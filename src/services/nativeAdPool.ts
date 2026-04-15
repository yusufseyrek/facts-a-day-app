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

const DEFAULT_ASPECT_RATIO: NativeMediaAspectRatio = NativeMediaAspectRatio.LANDSCAPE;

interface SlotState {
  ad: NativeAd | null;
  status: SlotStatus;
  listeners: Set<() => void>;
  impressionTracked: boolean;
  evictionTimer: ReturnType<typeof setTimeout> | null;
  /** Preferred ad media aspect ratio. Only the default goes through the shared queue. */
  aspectRatio: NativeMediaAspectRatio;
  /** Guards against issuing more than one direct fetch per non-default-aspect slot. */
  directRequestInFlight: boolean;
}

const slots = new Map<string, SlotState>();
const readyQueue: NativeAd[] = [];
let inFlightRequests = 0;
let premiumOverride = false;

/**
 * Delay before an unused slot is evicted after its last subscriber leaves.
 * Long enough to survive brief scroll-past / tab-switch scenarios without
 * re-requesting an ad, short enough to bound memory during long scrolls.
 */
const SLOT_EVICTION_DELAY_MS = 30_000;

const getNativeAdUnitId = (): string => {
  const config = Constants.expoConfig?.extra;
  if (Platform.OS === 'ios') {
    return config?.ADMOB_IOS_NATIVE_ID || TestIds.NATIVE;
  }
  return config?.ADMOB_ANDROID_NATIVE_ID || TestIds.NATIVE;
};

/** How many not-yet-bound ads we try to keep buffered in the queue. */
const readyQueueTarget = (): number =>
  Math.max(1, NATIVE_ADS.POOL_SIZE ?? 4);

/** Refill the buffer once free capacity in the queue drops below this. */
const refillThreshold = (): number =>
  Math.max(1, NATIVE_ADS.POOL_REFILL_THRESHOLD ?? 2);

/** Buffered (ready) + currently in-flight ads. Bound ads are tied to slot lifetime. */
const bufferFootprint = (): number => readyQueue.length + inFlightRequests;

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
      directRequestInFlight: false,
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

const adsAllowed = (): boolean =>
  ADS_ENABLED && NATIVE_ADS.ACTIVE && shouldShowAds() && !premiumOverride;

const requestOneAd = async (): Promise<void> => {
  if (!adsAllowed()) return;
  if (bufferFootprint() >= readyQueueTarget()) return;

  inFlightRequests++;
  try {
    const consentInfo = await AdsConsent.getConsentInfo();
    if (!consentInfo.canRequestAds) return;

    const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();
    const ad = await NativeAd.createForAdRequest(getNativeAdUnitId(), {
      requestNonPersonalizedAdsOnly: nonPersonalized,
      aspectRatio: NativeMediaAspectRatio.LANDSCAPE,
      keywords: AD_KEYWORDS,
    });

    if (!adsAllowed()) {
      ad.destroy();
      return;
    }

    readyQueue.push(ad);
    assignReadyAds();
  } catch {
    // no-fill / network error — mark any loading slot as failed so the row
    // can render its reserved-height spacer immediately
    for (const slot of slots.values()) {
      if (slot.status === 'loading' && !slot.ad) {
        slot.status = 'failed';
        notifySlot(slot);
        break;
      }
    }
  } finally {
    inFlightRequests--;
  }
};

const ensureFill = (): void => {
  if (!adsAllowed()) return;
  while (bufferFootprint() < readyQueueTarget()) {
    void requestOneAd();
  }
};

const assignReadyAds = (): void => {
  for (const slot of slots.values()) {
    if (slot.ad || slot.status === 'failed') continue;
    // Non-default-aspect slots never claim from the shared (LANDSCAPE) queue.
    if (slot.aspectRatio !== DEFAULT_ASPECT_RATIO) continue;
    const ad = readyQueue.shift();
    if (!ad) break;
    slot.ad = ad;
    slot.status = 'ready';
    if (!slot.impressionTracked) {
      slot.impressionTracked = true;
      trackNativeAdImpression();
    }
    notifySlot(slot);
  }

  if (bufferFootprint() < refillThreshold()) {
    ensureFill();
  }
};

/**
 * Fetch an ad for a specific slot with its declared aspect ratio. Used for
 * non-default aspect ratios (e.g. SQUARE for the Latest carousel) that can't
 * be satisfied from the shared LANDSCAPE ready queue.
 */
const requestAdForSlot = async (slotKey: string): Promise<void> => {
  const slot = slots.get(slotKey);
  if (!slot || slot.directRequestInFlight || slot.ad) return;
  if (!adsAllowed()) return;

  slot.directRequestInFlight = true;
  try {
    const consentInfo = await AdsConsent.getConsentInfo();
    if (!consentInfo.canRequestAds) {
      const current = slots.get(slotKey);
      if (current && !current.ad) {
        current.status = 'failed';
        notifySlot(current);
      }
      return;
    }

    const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();
    const ad = await NativeAd.createForAdRequest(getNativeAdUnitId(), {
      requestNonPersonalizedAdsOnly: nonPersonalized,
      aspectRatio: slot.aspectRatio,
      keywords: AD_KEYWORDS,
    });

    const current = slots.get(slotKey);
    if (!current || !adsAllowed()) {
      ad.destroy();
      return;
    }

    current.ad = ad;
    current.status = 'ready';
    if (!current.impressionTracked) {
      current.impressionTracked = true;
      trackNativeAdImpression();
    }
    notifySlot(current);
  } catch {
    const current = slots.get(slotKey);
    if (current && !current.ad) {
      current.status = 'failed';
      notifySlot(current);
    }
  } finally {
    const current = slots.get(slotKey);
    if (current) current.directRequestInFlight = false;
  }
};

/**
 * Start preloading native ads into the pool. Safe to call many times — the
 * pool will only top itself up to `NATIVE_ADS.POOL_SIZE`.
 */
export const primePool = (): void => {
  if (!adsAllowed()) return;
  ensureFill();
};

/**
 * Get or create a slot state for the given key. When this is the first call
 * for a key and a ready ad is available, it is bound to the slot.
 *
 * `aspectRatio` determines how the ad request is issued. The default LANDSCAPE
 * uses the shared ready queue for instant binding. Non-default ratios bypass
 * the queue and fetch per-slot (with stable binding across recycles).
 */
export const getSlot = (
  slotKey: string,
  aspectRatio: NativeMediaAspectRatio = DEFAULT_ASPECT_RATIO
): { ad: NativeAd | null; status: SlotStatus } => {
  const slot = getOrCreateSlot(slotKey, aspectRatio);

  if (!adsAllowed()) {
    if (slot.status !== 'failed') {
      slot.status = 'failed';
    }
    return { ad: null, status: slot.status };
  }

  if (!slot.ad && slot.status !== 'failed') {
    if (slot.aspectRatio === DEFAULT_ASPECT_RATIO) {
      const ad = readyQueue.shift();
      if (ad) {
        slot.ad = ad;
        slot.status = 'ready';
        if (!slot.impressionTracked) {
          slot.impressionTracked = true;
          trackNativeAdImpression();
        }
        // We took from the buffer — top it back up to the target in the background.
        ensureFill();
      } else if (slot.status === 'idle') {
        slot.status = 'loading';
        ensureFill();
      }
    } else if (!slot.directRequestInFlight) {
      slot.status = 'loading';
      void requestAdForSlot(slotKey);
    }
  }

  return { ad: slot.ad, status: slot.status };
};

/**
 * Subscribe to state changes for a slot. Returns an unsubscribe function.
 * Does NOT allocate an ad for the slot — call getSlot to trigger binding.
 *
 * When the last subscriber leaves we schedule an eviction (releaseSlot) after
 * SLOT_EVICTION_DELAY_MS so brief scroll-past / remounts don't trigger a new
 * ad request, but long-lived sessions stay bounded.
 */
export const subscribeSlot = (
  slotKey: string,
  listener: () => void,
  aspectRatio: NativeMediaAspectRatio = DEFAULT_ASPECT_RATIO
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
 * Release a slot: destroy its ad (if any) and remove the entry. Call when the
 * row backing this slot is permanently removed from the data set. Safe to call
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
  if (adsAllowed()) {
    ensureFill();
  }
};

/**
 * Drop all ads and reset the pool. Use on premium upgrade or when ads become
 * disabled. Does not destroy ads that are still bound to slots with listeners
 * (they will be cleaned up by releaseSlot on the next render).
 */
export const resetPool = (): void => {
  while (readyQueue.length > 0) {
    const ad = readyQueue.shift();
    ad?.destroy();
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

/** Test-only: inspect pool internals. */
export const __getPoolInternals = () => ({
  slots,
  readyQueue,
  inFlightRequests,
});
