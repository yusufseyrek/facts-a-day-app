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
 * Insert native ad placeholders into an array of items at every Nth countable position.
 *
 * After every `interval` countable items, an ad placeholder is inserted.
 * For example, with interval=5: items 1-4 are facts, position 5 is an ad,
 * items 6-9 are facts, position 10 is an ad, etc.
 *
 * @param items - The source array of items
 * @param isCountableItem - Predicate returning true for items that count toward the interval
 *   (e.g., facts but not section headers). If not provided, all items are counted.
 * @param interval - Number of countable items between ads. Defaults to NATIVE_ADS.FACTS_BETWEEN_ADS.
 * @returns New array with NativeAdPlaceholder items inserted.
 */
export function insertNativeAds<T>(
  items: T[],
  isCountableItem?: (item: T) => boolean,
  interval: number = NATIVE_ADS.FACTS_BETWEEN_ADS,
): (T | NativeAdPlaceholder)[] {
  if (!ADS_ENABLED || !NATIVE_ADS.ACTIVE || items.length === 0) {
    return items;
  }

  const result: (T | NativeAdPlaceholder)[] = [];
  let countableCount = 0;
  let adIndex = 0;

  for (const item of items) {
    const shouldCount = isCountableItem ? isCountableItem(item) : true;
    if (shouldCount) {
      countableCount++;
      if (countableCount > 0 && countableCount % interval === 0) {
        result.push({
          type: 'nativeAd',
          key: `native-ad-${adIndex++}`,
        });
      }
    }
    result.push(item);
  }

  return result;
}
