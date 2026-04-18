import { Platform } from 'react-native';
import {
  AdsConsent,
  NativeAd,
  NativeMediaAspectRatio,
  TestIds,
} from 'react-native-google-mobile-ads';

import Constants from 'expo-constants';

import { AD_KEYWORDS, ADS_ENABLED, NATIVE_ADS } from '../config/app';

import { shouldRequestNonPersonalizedAdsOnly } from './adsConsent';
import { trackNativeAdImpression } from './analytics';
import { shouldShowAds } from './premiumState';

export type SlotStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Aspects we pre-load into parallel queues. Each aspect has its own buffer;
 * a slot requesting an aspect not in this list is marked `failed`.
 */
const POOLED_ASPECTS: readonly NativeMediaAspectRatio[] = [
  NativeMediaAspectRatio.SQUARE,
  NativeMediaAspectRatio.PORTRAIT,
  NativeMediaAspectRatio.LANDSCAPE,
];

/**
 * Warm-cache depth per aspect. A consumer drains one, then the pool refills
 * in the background. Size 2 means the second ad row in a fast scroll still
 * gets an instant bind while request #1 is in flight.
 */
const POOL_SIZE_PER_ASPECT = 2;

/**
 * Retry delays. On `"No ad to show"` (inventory gap) we escalate gently —
 * 5 s → 10 s → 20 s and then hold at 20 s — so transient gaps recover fast
 * but long outages don't hammer the ad unit. On the rate-limit signal
 * (`"Too many recently failed requests"`), we respect a full 60 s cooldown
 * before the next request. Retries are unbounded on both sides; slots stay
 * in 'loading' (rendering nothing, per the card components) until an ad
 * arrives.
 */
const NO_FILL_RETRY_SCHEDULE_MS: readonly number[] = [5_000, 10_000, 20_000];
const RATE_LIMIT_COOLDOWN_MS = 60_000;

/** Delay before an unused slot is evicted after its last subscriber leaves. */
const SLOT_EVICTION_DELAY_MS = 30_000;

interface SlotState {
  ad: NativeAd | null;
  status: SlotStatus;
  listeners: Set<() => void>;
  impressionTracked: boolean;
  evictionTimer: ReturnType<typeof setTimeout> | null;
  aspectRatio: NativeMediaAspectRatio;
}

// ── Module state ─────────────────────────────────────────────────────────────

const slots = new Map<string, SlotState>();
const readyQueues = new Map<NativeMediaAspectRatio, NativeAd[]>();
const inFlightByAspect = new Map<NativeMediaAspectRatio, number>();
const retryTimerByAspect = new Map<NativeMediaAspectRatio, ReturnType<typeof setTimeout>>();
/** Consecutive no-fill attempts per aspect. Indexes into NO_FILL_RETRY_SCHEDULE_MS. */
const noFillAttemptByAspect = new Map<NativeMediaAspectRatio, number>();

let premiumOverride = false;
/**
 * True once the Google Mobile Ads SDK has finished initialization. Requests
 * issued before this hit empty mediation adapters and burn the SDK's local
 * per-ad-unit rate limiter; all fetching is gated behind this flag.
 */
let sdkReady = false;

for (const aspect of POOLED_ASPECTS) {
  readyQueues.set(aspect, []);
  inFlightByAspect.set(aspect, 0);
}

// ── Logging (DEV only) ───────────────────────────────────────────────────────

const ASPECT_NAME: Record<number, string> = {
  [NativeMediaAspectRatio.ANY as number]: 'any',
  [NativeMediaAspectRatio.LANDSCAPE as number]: 'landscape',
  [NativeMediaAspectRatio.PORTRAIT as number]: 'portrait',
  [NativeMediaAspectRatio.SQUARE as number]: 'square',
};
const aspectName = (a: NativeMediaAspectRatio): string => ASPECT_NAME[a as number] ?? String(a);

const log = (msg: string, data?: Record<string, unknown>): void => {
  if (__DEV__) {
    console.log(`[NativeAdPool] ${msg}`, data ?? {});
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

const queueFor = (aspect: NativeMediaAspectRatio): NativeAd[] => {
  let q = readyQueues.get(aspect);
  if (!q) {
    q = [];
    readyQueues.set(aspect, q);
  }
  return q;
};

const inFlightFor = (aspect: NativeMediaAspectRatio): number => inFlightByAspect.get(aspect) ?? 0;

const bumpInFlight = (aspect: NativeMediaAspectRatio, delta: number): void => {
  inFlightByAspect.set(aspect, Math.max(0, inFlightFor(aspect) + delta));
};

const bufferFootprintFor = (aspect: NativeMediaAspectRatio): number =>
  queueFor(aspect).length + inFlightFor(aspect);

const isPooledAspect = (aspect: NativeMediaAspectRatio): boolean => POOLED_ASPECTS.includes(aspect);

const notifySlot = (slot: SlotState): void => {
  for (const listener of slot.listeners) {
    listener();
  }
};

const getOrCreateSlot = (slotKey: string, aspectRatio: NativeMediaAspectRatio): SlotState => {
  let slot = slots.get(slotKey);
  if (!slot) {
    slot = {
      ad: null,
      status: 'idle',
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
 * Permanent session-level gate: will this session ever serve ads? False for
 * premium users and when ads are disabled by build config. A slot rejected
 * here is marked 'failed' permanently.
 */
const adsAllowed = (): boolean =>
  ADS_ENABLED && NATIVE_ADS.ACTIVE && shouldShowAds() && !premiumOverride;

/**
 * Can we actually fire an ad request right now? Additionally requires the
 * SDK to be ready. When this is false but `adsAllowed()` is true, the slot
 * parks in 'loading' and is resumed by `setPoolSdkReady(true)`.
 */
const canFetchNow = (): boolean => adsAllowed() && sdkReady;

const looksLikeRateLimit = (err: unknown): boolean =>
  String(err ?? '')
    .toLowerCase()
    .includes('too many recently failed requests');

const nextNoFillDelayMs = (aspect: NativeMediaAspectRatio): number => {
  const attempt = noFillAttemptByAspect.get(aspect) ?? 0;
  const idx = Math.min(attempt, NO_FILL_RETRY_SCHEDULE_MS.length - 1);
  noFillAttemptByAspect.set(aspect, attempt + 1);
  return NO_FILL_RETRY_SCHEDULE_MS[idx];
};

const clearRetryTimer = (aspect: NativeMediaAspectRatio): void => {
  const t = retryTimerByAspect.get(aspect);
  if (t) {
    clearTimeout(t);
    retryTimerByAspect.delete(aspect);
  }
};

const scheduleRetry = (aspect: NativeMediaAspectRatio, delayMs: number): void => {
  if (retryTimerByAspect.has(aspect)) return;
  const timer = setTimeout(() => {
    retryTimerByAspect.delete(aspect);
    if (!canFetchNow()) return;
    log('retry:fire', { aspect: aspectName(aspect) });
    ensureFillForAspect(aspect);
  }, delayMs);
  retryTimerByAspect.set(aspect, timer);
};

// ── Request path ─────────────────────────────────────────────────────────────

const requestOneAdForAspect = async (aspect: NativeMediaAspectRatio): Promise<void> => {
  if (!canFetchNow()) return;
  if (bufferFootprintFor(aspect) >= POOL_SIZE_PER_ASPECT) return;

  log('request:start', { aspect: aspectName(aspect) });
  bumpInFlight(aspect, 1);
  let loadedAd: NativeAd | null = null;
  try {
    const consentInfo = await AdsConsent.getConsentInfo();
    if (!consentInfo.canRequestAds) return;

    const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();
    loadedAd = await NativeAd.createForAdRequest(getNativeAdUnitId(), {
      requestNonPersonalizedAdsOnly: nonPersonalized,
      aspectRatio: aspect,
      keywords: AD_KEYWORDS,
    });
  } catch (err) {
    // Keep retrying indefinitely. AdMob tells us when to back off via the
    // rate-limit error, which swaps the escalating 5→10→20 s cadence for a
    // 60 s cooldown. Slots stay in 'loading' (rendering nothing) until an
    // ad lands — no need to mark them failed.
    //
    // Dedupe: if a retry is already pending for this aspect, don't schedule
    // again or bump the backoff counter. With POOL_SIZE > 1 two parallel
    // failures would otherwise double-advance the schedule and collapse
    // 5 → 10 → 20 into 5 → 20 → 20.
    if (retryTimerByAspect.has(aspect)) return;
    if (looksLikeRateLimit(err)) {
      log('request:backoff', { aspect: aspectName(aspect), inMs: RATE_LIMIT_COOLDOWN_MS });
      scheduleRetry(aspect, RATE_LIMIT_COOLDOWN_MS);
    } else {
      const delay = nextNoFillDelayMs(aspect);
      log('request:no_fill', { aspect: aspectName(aspect), retryInMs: delay });
      scheduleRetry(aspect, delay);
    }
    return;
  } finally {
    bumpInFlight(aspect, -1);
  }

  // Post-fetch handling runs AFTER `finally` has decremented inFlight so that
  // the refill check inside `assignReadyAds` sees an accurate buffer footprint
  // — otherwise the just-queued ad is double-counted (once as inFlight, once
  // as queued) and the refill is silently skipped.
  if (!loadedAd) return;
  if (!canFetchNow()) {
    loadedAd.destroy();
    return;
  }
  queueFor(aspect).push(loadedAd);
  log('request:loaded', { aspect: aspectName(aspect), queueLen: queueFor(aspect).length });
  clearRetryTimer(aspect);
  noFillAttemptByAspect.set(aspect, 0);
  assignReadyAds();
};

const ensureFillForAspect = (aspect: NativeMediaAspectRatio): void => {
  if (!canFetchNow()) return;
  if (!isPooledAspect(aspect)) return;
  // Respect a pending retry timer. Otherwise every cell mount calling
  // `useAdForSlot` → `getSlot` → `ensureFillForAspect` would fire a fresh
  // request and bypass the cooldown, hammering the ad unit.
  if (retryTimerByAspect.has(aspect)) return;
  while (bufferFootprintFor(aspect) < POOL_SIZE_PER_ASPECT) {
    void requestOneAdForAspect(aspect);
  }
};

const ensureFill = (): void => {
  if (!canFetchNow()) return;
  for (const aspect of POOLED_ASPECTS) {
    ensureFillForAspect(aspect);
  }
};

const assignReadyAds = (): void => {
  for (const [slotKey, slot] of slots.entries()) {
    if (slot.ad || slot.status === 'ready' || slot.status === 'failed') continue;
    const q = queueFor(slot.aspectRatio);
    const ad = q.shift();
    if (!ad) continue;
    slot.ad = ad;
    slot.status = 'ready';
    if (!slot.impressionTracked) {
      slot.impressionTracked = true;
      trackNativeAdImpression();
    }
    log('slot:bound', { slotKey, aspect: aspectName(slot.aspectRatio) });
    notifySlot(slot);
  }

  // Consuming an ad drops the aspect's queue below target — refill.
  for (const aspect of POOLED_ASPECTS) {
    if (bufferFootprintFor(aspect) < POOL_SIZE_PER_ASPECT) {
      ensureFillForAspect(aspect);
    }
  }
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start preloading native ads into the pool. Safe to call many times — each
 * call cancels any pending retry so the next fetch fires immediately.
 * No-op until `setPoolSdkReady(true)` has been called.
 */
export const primePool = (): void => {
  if (!adsAllowed()) return;
  log('primePool', { sdkReady });
  for (const aspect of POOLED_ASPECTS) {
    clearRetryTimer(aspect);
    noFillAttemptByAspect.set(aspect, 0);
  }
  ensureFill();
};

/**
 * Get or create a slot state for the given key. On first call, if a matching
 * ad is already queued it is bound instantly and a refill request fires in
 * the background; otherwise the slot parks in 'loading'.
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

  // Aspect not pooled: cannot serve.
  if (!isPooledAspect(aspectRatio)) {
    if (slot.status !== 'failed') slot.status = 'failed';
    return { ad: null, status: slot.status };
  }

  // Transient gate (SDK initializing): park in 'loading'.
  if (!sdkReady) {
    if (slot.status === 'idle') slot.status = 'loading';
    return { ad: slot.ad, status: slot.status };
  }

  // Try to claim from this aspect's queue; otherwise park and kick a fill.
  if (!slot.ad && slot.status !== 'failed') {
    const q = queueFor(slot.aspectRatio);
    const ad = q.shift();
    if (ad) {
      slot.ad = ad;
      slot.status = 'ready';
      if (!slot.impressionTracked) {
        slot.impressionTracked = true;
        trackNativeAdImpression();
      }
      log('slot:bound', { slotKey, aspect: aspectName(slot.aspectRatio) });
      // Consumed one — refill in the background.
      ensureFillForAspect(slot.aspectRatio);
    } else if (slot.status === 'idle' || slot.status === 'loading') {
      slot.status = 'loading';
      ensureFillForAspect(slot.aspectRatio);
    }
  }

  return { ad: slot.ad, status: slot.status };
};

/**
 * Subscribe to state changes for a slot. Returns an unsubscribe function.
 * Does NOT allocate an ad — call `getSlot` to trigger binding.
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
 * with an unknown slotKey. After release, the aspect's queue is refilled.
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
  const aspect = slot.aspectRatio;
  slots.delete(slotKey);
  if (canFetchNow() && isPooledAspect(aspect)) {
    ensureFillForAspect(aspect);
  }
};

/**
 * Drop all ads and reset the pool. Use on premium upgrade or when ads become
 * disabled. Destroys every ad — queued and bound — and notifies subscribed
 * slots so they rerender into their failed state.
 */
export const resetPool = (): void => {
  for (const aspect of POOLED_ASPECTS) {
    const q = queueFor(aspect);
    while (q.length > 0) {
      const ad = q.shift();
      ad?.destroy();
    }
    clearRetryTimer(aspect);
    noFillAttemptByAspect.set(aspect, 0);
  }
  for (const [key, slot] of slots.entries()) {
    if (slot.evictionTimer) {
      clearTimeout(slot.evictionTimer);
      slot.evictionTimer = null;
    }
    if (slot.ad) {
      slot.ad.destroy();
      slot.ad = null;
    }
    slot.status = 'failed';
    notifySlot(slot);
    if (slot.listeners.size === 0) {
      slots.delete(key);
    }
  }
};

/**
 * Signal that the premium state changed. When becoming premium, the pool is
 * drained; when losing premium, nothing happens until the next primePool call.
 */
export const setPoolPremium = (isPremium: boolean): void => {
  premiumOverride = isPremium;
  if (isPremium) {
    resetPool();
  }
};

/**
 * Called once the Google Mobile Ads SDK has finished initializing. Flipping
 * false → true wakes any slots parked in 'loading'/'failed' by the pre-SDK
 * guard so they retry against a live SDK, and fires the first real fill for
 * every pooled aspect.
 */
export const setPoolSdkReady = (ready: boolean): void => {
  const prev = sdkReady;
  sdkReady = ready;
  if (prev || !ready) return;
  if (!adsAllowed()) return;
  log('sdkReady');

  for (const slot of slots.values()) {
    if (slot.ad) continue;
    if (slot.status === 'failed' || slot.status === 'loading') {
      slot.status = 'idle';
      notifySlot(slot);
    }
  }
  for (const aspect of POOLED_ASPECTS) {
    clearRetryTimer(aspect);
  }
  ensureFill();
};

/** Test-only: inspect pool internals. */
export const __getPoolInternals = () => ({
  slots,
  readyQueues,
  inFlightByAspect,
  retryTimerByAspect,
});
