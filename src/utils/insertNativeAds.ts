import { ADS_ENABLED, NATIVE_ADS } from '../config/app';

/** Sentinel type for a native ad placeholder in a list */
export interface NativeAdPlaceholder {
  type: 'nativeAd';
  /** Unique key for React, e.g. 'native-ad-0' */
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

/**
 * Insert native ad placeholders into an array of items.
 *
 * The first ad is inserted after `firstAdIndex` countable items, then every
 * `NATIVE_ADS.INTERVAL` countable items after that.
 *
 * @param items - The source array of items
 * @param firstAdIndex - Number of countable items before the first ad
 * @param isCountable - Optional predicate to decide which items count toward
 *   ad positioning (e.g. skip section headers). Defaults to counting all items.
 * @returns New array with NativeAdPlaceholder items inserted.
 */
export function insertNativeAds<T>(
  items: T[],
  firstAdIndex: number,
  isCountable?: (item: T) => boolean,
): (T | NativeAdPlaceholder)[] {
  if (!ADS_ENABLED || !NATIVE_ADS.ACTIVE || items.length === 0) {
    return items;
  }

  const interval = NATIVE_ADS.INTERVAL;
  const result: (T | NativeAdPlaceholder)[] = [];
  let adIndex = 0;
  let counted = 0;
  let nextAdAt = firstAdIndex;

  for (const item of items) {
    const countable = isCountable ? isCountable(item) : true;
    if (countable) {
      if (counted === nextAdAt) {
        result.push({ type: 'nativeAd', key: `native-ad-${adIndex++}` });
        nextAdAt = counted + interval;
      }
      counted++;
    }
    result.push(item);
  }

  // If the list was too short for any ad, append one at the end
  if (adIndex === 0) {
    result.push({ type: 'nativeAd', key: `native-ad-${adIndex}` });
  }

  return result;
}
