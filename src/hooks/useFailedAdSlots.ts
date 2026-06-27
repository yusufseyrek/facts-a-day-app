import { useCallback, useEffect, useState } from 'react';

import { isNativeAdPlaceholder, type NativeAdPlaceholder } from '../utils/insertNativeAds';

/**
 * Tracks native-ad slot keys whose on-demand fetch terminally failed (no-fill /
 * unsupported aspect) so a list can DROP their placeholders from its data —
 * leaving no blank cell behind, with no layout jump.
 *
 * Why dropping is jump-free: ads load on demand as a cell enters FlashList's
 * `drawDistance`, i.e. while it is still off-screen. A failure therefore
 * resolves before the cell is visible, so removing it shifts only not-yet-seen
 * items and keeps a snap grid aligned (unlike collapsing the cell in place,
 * which orphans its separators / snap interval).
 *
 * Pass the source list (before ad interleaving) as `resetKey`: when it changes,
 * the failed set clears so the dropped placeholders can reappear for a fresh
 * batch of content. Whether they then re-fetch is up to the ad service — a slot
 * it has already marked `failed` stays so (no retry) until it is evicted or the
 * SDK re-initializes, so a same-key slot may simply re-report failed and drop
 * out again. Clearing here just avoids the failed set growing without bound.
 */
export function useFailedAdSlots(resetKey: unknown) {
  const [failedKeys, setFailedKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    // Keep the empty-Set identity stable so this never re-renders in a loop.
    setFailedKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, [resetKey]);

  const markAdFailed = useCallback((key: string) => {
    setFailedKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const dropFailedAds = useCallback(
    <T>(items: (T | NativeAdPlaceholder)[]): (T | NativeAdPlaceholder)[] =>
      failedKeys.size === 0
        ? items
        : items.filter((it) => !isNativeAdPlaceholder(it) || !failedKeys.has(it.key)),
    [failedKeys]
  );

  return { markAdFailed, dropFailedAds };
}
