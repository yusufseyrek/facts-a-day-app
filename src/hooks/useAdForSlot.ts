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
// Intentionally-paused state (no slot key provided by caller, or `enabled`
// is false because the cell hasn't entered the viewport yet). Distinct from
// `EMPTY` — callers listening for 'failed' must not treat an idle, not-yet-
// subscribed cell as a terminal failure.
const IDLE: UseAdForSlotResult = { ad: null, status: 'idle' };

/**
 * Subscribe a list cell to the shared native ad pool. The same `slotKey`
 * always returns the same ad instance across FlashList recycles, so we do not
 * re-request ads while scrolling.
 *
 * `aspectRatio` picks which preloaded queue to drain. Slots requesting a
 * non-pooled aspect are marked `failed`.
 *
 * `enabled` (default `true`) gates subscription — pass `false` for list cells
 * that have been mounted by FlashList's drawDistance but not yet scrolled into
 * view, so the pool doesn't burn inventory on slots the user may never see.
 *
 * Premium users short-circuit to `EMPTY` without subscribing.
 */
export function useAdForSlot(
  slotKey: string | null | undefined,
  aspectRatio: NativeMediaAspectRatio = NativeMediaAspectRatio.LANDSCAPE,
  enabled: boolean = true
): UseAdForSlotResult {
  const { isPremium } = usePremium();
  const [state, setState] = useState<UseAdForSlotResult>(() => {
    if (isPremium) return EMPTY;
    if (!slotKey || !enabled) return IDLE;
    return getSlot(slotKey, aspectRatio);
  });

  useEffect(() => {
    if (isPremium) {
      setState(EMPTY);
      return;
    }
    if (!slotKey || !enabled) {
      setState(IDLE);
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
  }, [slotKey, isPremium, aspectRatio, enabled]);

  return state;
}
