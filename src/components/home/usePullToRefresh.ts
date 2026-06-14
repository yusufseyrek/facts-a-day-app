import { useCallback, useEffect } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PULL_THRESHOLD } from './LogoPullRefresh';

import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** Distance (px) the list holds open at while the fetch runs, showing the lit logo. */
const PARK = 74;
/** Resistance applied to drag past the arm threshold (rubber-band feel). */
const RESIST = 0.35;

/**
 * Custom, gesture-driven pull-to-refresh that works identically on iOS and
 * Android (the native RefreshControl can't expose its drag distance on Android).
 *
 * The pull amount comes straight from the Pan gesture's `translationY` on the UI
 * thread, so the branded {@link LogoPullRefresh} bulb tracks the finger 1:1. The
 * list is only used as an "at top" gate (plain JS `onScroll` writing a shared
 * value), so the FlashList itself stays a normal, un-wrapped scroller.
 *
 * Usage: spread `gesture`/`wrapStyle`/`onScroll` onto the list (see
 * KeepReadingList) and feed `progress` to the bulb overlay.
 */
export function usePullToRefresh({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const pull = useSharedValue(0);
  const atTop = useSharedValue(true);
  const canPull = useSharedValue(false);
  const refreshingSV = useSharedValue(false);

  // Mirror the refreshing flag onto the UI thread + retract when it clears.
  useEffect(() => {
    refreshingSV.value = refreshing;
    if (!refreshing) {
      pull.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    }
  }, [refreshing, refreshingSV, pull]);

  const progress = useDerivedValue(() => Math.min(1, Math.max(0, pull.value / PULL_THRESHOLD)));

  // Cheap "at top" gate — a boolean, throttled JS scroll is plenty.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      atTop.value = e.nativeEvent.contentOffset.y <= 0.5;
    },
    [atTop]
  );

  const native = Gesture.Native();
  const pan = Gesture.Pan()
    // Only engage a pull that *starts* at the very top; otherwise it's a scroll.
    .onBegin(() => {
      canPull.value = atTop.value && !refreshingSV.value;
    })
    .onUpdate((e) => {
      if (!canPull.value || refreshingSV.value || !atTop.value || e.translationY <= 0) {
        pull.value = 0;
        return;
      }
      const d = e.translationY;
      pull.value = d <= PULL_THRESHOLD ? d : PULL_THRESHOLD + (d - PULL_THRESHOLD) * RESIST;
    })
    .onEnd(() => {
      const armed = canPull.value && !refreshingSV.value && pull.value >= PULL_THRESHOLD;
      canPull.value = false;
      if (armed) {
        pull.value = withTiming(PARK, { duration: 160 });
        runOnJS(onRefresh)();
      } else if (!refreshingSV.value) {
        pull.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
      }
    });
  // Run alongside the list's own scroll so normal scrolling is untouched.
  const gesture = Gesture.Simultaneous(native, pan);

  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pull.value }] }));

  return { gesture, wrapStyle, progress, onScroll };
}
