import { useEffect, useState } from 'react';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';

import { usePremium } from '../contexts/PremiumContext';
import { getSlot, type SlotStatus, subscribeSlot } from '../services/nativeAdPool';

import type { NativeAd } from 'react-native-google-mobile-ads';

interface UseAdForSlotResult {
  ad: NativeAd | null;
  status: SlotStatus;
}

const EMPTY: UseAdForSlotResult = { ad: null, status: 'failed' };

/**
 * Subscribe a list cell to the shared native ad pool. The same `slotKey`
 * always returns the same ad instance across FlashList recycles, so we do not
 * re-request ads while scrolling.
 *
 * `aspectRatio` controls how the ad request is issued. LANDSCAPE slots share
 * a preloaded queue; other aspect ratios (e.g. SQUARE for the Latest carousel)
 * fetch per-slot but still benefit from stable binding across recycles.
 *
 * Premium users short-circuit to `EMPTY` so ad cells render their
 * reserved-height spacer without attempting to load.
 */
export function useAdForSlot(
  slotKey: string | null | undefined,
  aspectRatio: NativeMediaAspectRatio = NativeMediaAspectRatio.LANDSCAPE
): UseAdForSlotResult {
  const { isPremium } = usePremium();
  const [state, setState] = useState<UseAdForSlotResult>(() => {
    if (!slotKey || isPremium) return EMPTY;
    return getSlot(slotKey, aspectRatio);
  });

  useEffect(() => {
    if (!slotKey || isPremium) {
      setState(EMPTY);
      return;
    }

    const sync = () => {
      const next = getSlot(slotKey, aspectRatio);
      setState((prev) => {
        if (prev.ad === next.ad && prev.status === next.status) {
          return prev;
        }
        return next;
      });
    };

    sync();
    const unsubscribe = subscribeSlot(slotKey, sync, aspectRatio);
    return unsubscribe;
  }, [slotKey, isPremium, aspectRatio]);

  return state;
}
