import { Platform } from 'react-native';
import { AdsConsent, NativeAd, NativeMediaAspectRatio, TestIds } from 'react-native-google-mobile-ads';

import Constants from 'expo-constants';

import { AD_KEYWORDS, ADS_ENABLED, NATIVE_ADS } from '../config/app';

import { shouldRequestNonPersonalizedAdsOnly } from './adsConsent';
import { trackNativeAdImpression, trackNativeAdLoadFailed } from './analytics';
import { shouldShowAds } from './premiumState';

export type SlotStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Aspect ratios our native cards know how to lay out. A slot requesting any
 * other aspect is marked `failed` (it can never be served).
 */
const SUPPORTED_ASPECTS: readonly NativeMediaAspectRatio[] = [
  NativeMediaAspectRatio.SQUARE,
  NativeMediaAspectRatio.PORTRAIT,
  NativeMediaAspectRatio.LANDSCAPE,
];

/** Delay before an unused slot is evicted (its ad destroyed) after its last subscriber leaves. */
const SLOT_EVICTION_DELAY_MS = 30_000;

interface SlotState {
  ad: NativeAd | null;
  status: SlotStatus;
  /** A request is in flight for this slot. */
  loading: boolean;
  listeners: Set<() => void>;
  impressionTracked: boolean;
  evictionTimer: ReturnType<typeof setTimeout> | null;
  aspectRatio: NativeMediaAspectRatio;
}

// ── Module state ─────────────────────────────────────────────────────────────
//
// On-demand model: each slot fetches its OWN native ad when a consumer first
// asks for it (via getSlot), and destroys it when its last subscriber leaves.
// There is no shared warm-cache/pool and no background pre-fetching — an ad is
// only ever requested for a slot the UI has actually mounted.

const slots = new Map<string, SlotState>();

/**
 * True once the Google Mobile Ads SDK has finished initialization. Requests
 * issued before this hit empty mediation adapters and burn the SDK's local
 * per-ad-unit rate limiter, so on-demand fetches are gated behind this flag and
 * resumed by `setNativeAdsSdkReady(true)`.
 */
let sdkReady = false;

// ── Logging (DEV only) ───────────────────────────────────────────────────────

const ASPECT_NAME: Record<number, string> = {
  [NativeMediaAspectRatio.ANY as number]: 'any',
  [NativeMediaAspectRatio.LANDSCAPE as number]: 'landscape',
  [NativeMediaAspectRatio.PORTRAIT as number]: 'portrait',
  [NativeMediaAspectRatio.SQUARE as number]: 'square',
};
const aspectName = (a: NativeMediaAspectRatio): string => ASPECT_NAME[a as number] ?? String(a);

/** Readable name for an aspect ratio enum, for analytics props. */
export const aspectRatioName = (a: NativeMediaAspectRatio): string => aspectName(a);

const log = (msg: string, data?: Record<string, unknown>): void => {
  if (__DEV__) {
    console.log(`[NativeAds] ${msg}`, data ?? {});
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const getNativeAdUnitId = (): string => {
  const config = Constants.expoConfig?.extra;
  if (Platform.OS === 'ios') {
    return config?.ADMOB_IOS_NATIVE_ID || TestIds.NATIVE;
  }
  return config?.ADMOB_ANDROID_NATIVE_ID || TestIds.NATIVE;
};

const isSupportedAspect = (aspect: NativeMediaAspectRatio): boolean =>
  SUPPORTED_ASPECTS.includes(aspect);

const looksLikeRateLimit = (err: unknown): boolean =>
  String(err ?? '')
    .toLowerCase()
    .includes('too many recently failed requests');

const notifySlot = (slot: SlotState): void => {
  for (const listener of slot.listeners) {
    listener();
  }
};

/** Will this session ever serve native ads? False for premium / ads-disabled builds. */
const adsAllowed = (): boolean => ADS_ENABLED && NATIVE_ADS.ACTIVE && shouldShowAds();

/** Can we fire a request right now? Additionally requires the SDK to be ready. */
const canFetchNow = (): boolean => adsAllowed() && sdkReady;

const getOrCreateSlot = (slotKey: string, aspectRatio: NativeMediaAspectRatio): SlotState => {
  let slot = slots.get(slotKey);
  if (!slot) {
    slot = {
      ad: null,
      status: 'idle',
      loading: false,
      listeners: new Set(),
      impressionTracked: false,
      evictionTimer: null,
      aspectRatio,
    };
    slots.set(slotKey, slot);
  } else {
    if (slot.evictionTimer) {
      clearTimeout(slot.evictionTimer);
      slot.evictionTimer = null;
    }
    slot.aspectRatio = aspectRatio;
  }
  return slot;
};

/**
 * Fire a single on-demand request for this slot. No-ops if the slot already has
 * an ad, a request is in flight, fetching isn't allowed yet, or the aspect is
 * unsupported. On terminal failure the slot is marked `failed` (no retry — a
 * fresh attempt only happens if the slot is released and re-created, or the SDK
 * transitions to ready).
 */
const loadSlot = (slotKey: string, slot: SlotState): void => {
  if (slot.ad || slot.loading) return;
  // Snapshot the aspect at request time: the slot's aspectRatio can change
  // under us (device rotation re-runs getSlot) while this request is in flight,
  // and the served creative + its analytics must reflect what we actually asked.
  const aspect = slot.aspectRatio;
  if (!isSupportedAspect(aspect)) {
    slot.status = 'failed';
    return;
  }
  if (!canFetchNow()) return;

  slot.loading = true;
  slot.status = 'loading';
  log('load:start', { slotKey, aspect: aspectName(aspect) });

  void (async () => {
    let loadedAd: NativeAd | null = null;
    try {
      const consentInfo = await AdsConsent.getConsentInfo();
      if (!consentInfo.canRequestAds) throw new Error('no_consent');

      const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();
      loadedAd = await NativeAd.createForAdRequest(getNativeAdUnitId(), {
        requestNonPersonalizedAdsOnly: nonPersonalized,
        aspectRatio: aspect,
        keywords: AD_KEYWORDS,
      });
    } catch (err) {
      slot.loading = false;
      // The slot may have been released while the request was in flight.
      if (slots.get(slotKey) !== slot) return;
      slot.status = 'failed';
      trackNativeAdLoadFailed({
        reason: looksLikeRateLimit(err) ? 'rate_limit' : 'no_fill',
        aspectRatio: aspectName(aspect),
      });
      log('load:failed', { slotKey });
      notifySlot(slot);
      return;
    }

    slot.loading = false;
    // Discard if the slot was released mid-flight, replaced, or premium kicked in.
    if (slots.get(slotKey) !== slot || !adsAllowed()) {
      loadedAd.destroy();
      if (slots.get(slotKey) === slot) {
        slot.ad = null;
        slot.status = 'failed';
        notifySlot(slot);
      }
      return;
    }

    slot.ad = loadedAd;
    slot.status = 'ready';
    // Count the impression only if a card is still subscribed to this slot. If
    // the consumer already dropped it (e.g. a story page skipped it as
    // not-ready and unmounted), the ad will never render — don't log a phantom.
    if (!slot.impressionTracked && slot.listeners.size > 0) {
      slot.impressionTracked = true;
      trackNativeAdImpression({
        placement: 'feed',
        aspectRatio: aspectName(aspect),
        slotKey,
      });
    }
    log('load:ready', { slotKey });
    notifySlot(slot);
  })();
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get or create a slot state for the given key, kicking off an on-demand fetch
 * if the slot has no ad yet. The same `slotKey` always returns the same ad
 * instance across FlashList recycles, so we don't re-request while scrolling.
 *
 * `aspectRatio` is requested from the ad server; an unsupported aspect marks
 * the slot `failed`. Premium / ads-disabled sessions short-circuit to `failed`.
 * Before the SDK is ready the slot parks in 'loading' and is resumed by
 * `setNativeAdsSdkReady(true)`.
 */
export const getSlot = (
  slotKey: string,
  aspectRatio: NativeMediaAspectRatio = NativeMediaAspectRatio.LANDSCAPE
): { ad: NativeAd | null; status: SlotStatus } => {
  const slot = getOrCreateSlot(slotKey, aspectRatio);

  // Permanent gate (premium / ads disabled).
  if (!adsAllowed()) {
    if (slot.status !== 'failed') slot.status = 'failed';
    return { ad: null, status: slot.status };
  }

  // Aspect not supported: cannot serve.
  if (!isSupportedAspect(aspectRatio)) {
    if (slot.status !== 'failed') slot.status = 'failed';
    return { ad: null, status: slot.status };
  }

  // Transient gate (SDK initializing): park in 'loading'.
  if (!sdkReady) {
    if (slot.status === 'idle') slot.status = 'loading';
    return { ad: slot.ad, status: slot.status };
  }

  // Fetch on demand if we don't already have (or aren't already fetching) an ad.
  if (!slot.ad && !slot.loading && slot.status !== 'failed') {
    loadSlot(slotKey, slot);
  }

  return { ad: slot.ad, status: slot.status };
};

/**
 * Read-only peek: does this slot currently have an ad bound? Never creates a
 * slot or fires a fetch — safe to call from scroll/viewability handlers.
 * Full-screen placements (story pages) use this to decide whether an ad page
 * can actually be presented, since unfilled slots would render blank.
 */
export const hasReadyAd = (slotKey: string): boolean => slots.get(slotKey)?.ad != null;

/**
 * Subscribe to state changes for a slot. Returns an unsubscribe function. Does
 * NOT allocate an ad — call `getSlot` to trigger the fetch.
 */
export const subscribeSlot = (
  slotKey: string,
  listener: () => void,
  aspectRatio: NativeMediaAspectRatio = NativeMediaAspectRatio.LANDSCAPE
): (() => void) => {
  const slot = getOrCreateSlot(slotKey, aspectRatio);
  slot.listeners.add(listener);
  return () => {
    const current = slots.get(slotKey);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0 && !current.evictionTimer) {
      // Ads just turned off (e.g. the user went premium): free the bound ad
      // immediately instead of holding native memory for the eviction delay.
      if (!adsAllowed()) {
        releaseSlot(slotKey);
        return;
      }
      current.evictionTimer = setTimeout(() => {
        const stillAlive = slots.get(slotKey);
        if (!stillAlive || stillAlive.listeners.size > 0) return;
        releaseSlot(slotKey);
      }, SLOT_EVICTION_DELAY_MS);
    }
  };
};

/**
 * Release a slot: destroy its ad (if any) and remove the entry. Safe to call
 * with an unknown slotKey.
 */
export const releaseSlot = (slotKey: string): void => {
  const slot = slots.get(slotKey);
  if (!slot) return;
  if (slot.evictionTimer) {
    clearTimeout(slot.evictionTimer);
    slot.evictionTimer = null;
  }
  if (slot.ad) {
    slot.ad.destroy();
    slot.ad = null;
  }
  slots.delete(slotKey);
};

/**
 * Called once the Google Mobile Ads SDK has finished initializing. Flipping
 * false → true wakes any slots parked by the pre-SDK guard so their subscribed
 * hooks re-request against a live SDK. Does NOT pre-fetch anything on its own.
 */
export const setNativeAdsSdkReady = (ready: boolean): void => {
  const prev = sdkReady;
  sdkReady = ready;
  if (prev || !ready) return;
  if (!adsAllowed()) return;
  log('sdkReady');
  for (const slot of slots.values()) {
    if (slot.ad || slot.loading) continue;
    if (slot.status === 'loading' || slot.status === 'failed') {
      slot.status = 'idle';
      // The hook's listener re-calls getSlot, which fires the on-demand load.
      notifySlot(slot);
    }
  }
};

/** Test-only: inspect slot internals. */
export const __getNativeAdInternals = () => ({ slots });
