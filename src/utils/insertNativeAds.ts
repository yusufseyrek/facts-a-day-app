import { NATIVE_ADS } from '../config/app';
import { shouldShowAds } from '../services/premiumState';

/** Default cadence for feed-list ad placements — one ad every N items. */
const DEFAULT_AD_INTERVAL = 4;

/** Sentinel type for a native ad placeholder in a list */
export interface NativeAdPlaceholder {
  type: 'nativeAd';
  /** Stable, content-derived key used both for React and the ad pool slot. */
  key: string;
}

export function isNativeAdPlaceholder(item: unknown): item is NativeAdPlaceholder {
  return (
    typeof item === 'object' &&
    item !== null &&
    'type' in item &&
    (item as NativeAdPlaceholder).type === 'nativeAd'
  );
}

interface InsertNativeAdsOptions<T> {
  /** Number of countable items before the first ad. */
  firstAdIndex: number;
  /** Optional predicate to decide which items count toward ad positioning. */
  isCountable?: (item: T) => boolean;
  /** Override the global ad interval. */
  interval?: number;
  /**
   * Build a stable slot key derived from the item that precedes the ad. Keep
   * this stable across paginations — e.g. the preceding fact's id — so pool
   * bindings survive list updates and FlashList recycles.
   */
  getAdKey?: (prevItem: T | null, adIndex: number) => string;
}

const defaultGetAdKey = <T,>(prevItem: T | null, adIndex: number): string => {
  if (prevItem && typeof prevItem === 'object' && 'id' in prevItem) {
    const id = (prevItem as { id: unknown }).id;
    if (id !== undefined && id !== null) {
      return `native-ad-after-${String(id)}`;
    }
  }
  return `native-ad-${adIndex}`;
};

/**
 * Insert native ad placeholders into an array of items. Ad keys are derived
 * from the preceding item so they stay stable across pagination and re-sorts.
 */
export function insertNativeAds<T>(
  items: T[],
  optionsOrFirstAdIndex: number | InsertNativeAdsOptions<T>,
  isCountableLegacy?: (item: T) => boolean,
  intervalLegacyOverride?: number
): (T | NativeAdPlaceholder)[] {
  const options: InsertNativeAdsOptions<T> =
    typeof optionsOrFirstAdIndex === 'number'
      ? {
          firstAdIndex: optionsOrFirstAdIndex,
          isCountable: isCountableLegacy,
          interval: intervalLegacyOverride,
        }
      : optionsOrFirstAdIndex;

  if (!shouldShowAds() || !NATIVE_ADS.ACTIVE || items.length === 0) {
    return items;
  }

  const { firstAdIndex, isCountable, interval: intervalOverride, getAdKey } = options;
  const interval = intervalOverride ?? DEFAULT_AD_INTERVAL;
  const resolveKey = getAdKey ?? defaultGetAdKey;

  const result: (T | NativeAdPlaceholder)[] = [];
  let adIndex = 0;
  let counted = 0;
  let nextAdAt = firstAdIndex;
  let prevCountable: T | null = null;

  for (const item of items) {
    const countable = isCountable ? isCountable(item) : true;
    if (countable) {
      if (counted === nextAdAt) {
        result.push({ type: 'nativeAd', key: resolveKey(prevCountable, adIndex) });
        adIndex++;
        nextAdAt = counted + interval;
      }
      counted++;
      prevCountable = item;
    }
    result.push(item);
  }

  // If the list was too short for any ad, append one at the end if needed
  if (adIndex === 0 && counted >= firstAdIndex) {
    result.push({ type: 'nativeAd', key: resolveKey(prevCountable, adIndex) });
  }

  return result;
}
