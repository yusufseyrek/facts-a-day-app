import { useCallback, useEffect, useRef } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * Lightweight, shared press feedback for tappable cards/rows: a quick opacity
 * dim (UI-thread timing) instead of a scale spring. Scale springs re-composite
 * the whole card subtree every frame and their loose release spring keeps the
 * card visibly wobbling long after the tap; an opacity fade is composited
 * cheaply and settles in under 200ms.
 *
 * Press-in is armed after a short delay so feedback never flashes while the
 * containing list is being scrolled (the touch gets cancelled before the
 * timer fires) — same guard the cards used with the scale animation.
 */
const PRESSED_OPACITY = 0.8;
const DIM_IN_MS = 100;
const DIM_OUT_MS = 180;
const PRESS_ACTIVATION_DELAY_MS = 100;

export function usePressFeedback() {
  const pressOpacity = useSharedValue(1);
  const pressDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pressStyle = useAnimatedStyle(() => ({
    opacity: pressOpacity.value,
  }));

  const onPressIn = useCallback(() => {
    if (pressDelayRef.current) clearTimeout(pressDelayRef.current);
    pressDelayRef.current = setTimeout(() => {
      pressDelayRef.current = null;
      pressOpacity.value = withTiming(PRESSED_OPACITY, { duration: DIM_IN_MS });
    }, PRESS_ACTIVATION_DELAY_MS);
  }, []);

  const onPressOut = useCallback(() => {
    if (pressDelayRef.current) {
      clearTimeout(pressDelayRef.current);
      pressDelayRef.current = null;
    }
    pressOpacity.value = withTiming(1, { duration: DIM_OUT_MS });
  }, []);

  // Don't let a pending press-in timer fire after unmount.
  useEffect(() => {
    return () => {
      if (pressDelayRef.current) clearTimeout(pressDelayRef.current);
    };
  }, []);

  return { pressStyle, onPressIn, onPressOut };
}
