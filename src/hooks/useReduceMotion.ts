import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "Reduce Motion" accessibility setting and keeps it live.
 *
 * Today the only place that honors reduce-motion is `useFactAudio`, which does a
 * one-shot read with no subscription. This hook reads the initial value AND
 * subscribes to `reduceMotionChanged` so a runtime toggle is respected.
 *
 * Gate the *motion* with this (loops, entrances, press-springs), never the
 * *result* — a favorite still fills, an icon still flips, a loader still tints.
 * For Reanimated layout/entering animations prefer the built-in
 * `entering.reduceMotion(ReduceMotion.System)` / `useReducedMotion()` instead;
 * use this hook for classic `Animated` loops/springs and JS-side gating.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
