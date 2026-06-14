import React, { useCallback, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Haptics from 'expo-haptics';

import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useThemeName } from '../../theme/ThemeProvider';

import { FactBulb } from './FactBulb';

/** Overscroll distance (px) that arms a refresh. */
export const PULL_THRESHOLD = 92;
const BULB_SIZE = 50;
/** Fixed distance below the safe-area top where the logo sits (like a spinner). */
const PARK_TOP = 24;

interface LogoPullRefreshProps {
  /** 0→1 pull amount, driven by the custom pull gesture (see usePullToRefresh). */
  progress: SharedValue<number>;
  /** True while the feed is re-fetching. */
  refreshing: boolean;
  /** Absolute top of the logo within its parent. Defaults to safe-area + PARK_TOP
   *  (right for a full-bleed list under the nav); pass a small value when the
   *  wrapped scroller already sits below a header. */
  top?: number;
}

/**
 * Branded pull-to-refresh affordance: an absolutely-positioned {@link FactBulb}
 * pinned to the top of the feed like a spinner. The custom pull gesture owns the
 * trigger; this only paints the logo, lighting it from `progress` (the live
 * drag) and blooming on `refreshing`, with a tick at the arm point.
 */
export function LogoPullRefresh({ progress, refreshing, top }: LogoPullRefreshProps) {
  const theme = useThemeName();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const topPos = top ?? insets.top + PARK_TOP;

  // Eased on/off bloom for the refreshing state.
  const active = useSharedValue(0);
  useEffect(() => {
    active.value = withTiming(refreshing ? 1 : 0, { duration: refreshing ? 420 : 320 });
    if (refreshing) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, [refreshing, active]);

  // Light tick the instant the pull passes the arm threshold.
  const fireArm = useCallback(() => {
    if (refreshing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [refreshing]);
  useAnimatedReaction(
    () => progress.value >= 1,
    (armed, wasArmed) => {
      if (armed && !wasArmed) runOnJS(fireArm)();
    }
  );

  // Pinned like the native spinner: a fixed spot just below the safe-area top.
  // It only fades/scales/lights in place from `progress` + `refreshing`, so it
  // never rides the finger or snaps vertically.
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { top: topPos }]}>
      <FactBulb
        progress={progress}
        active={active}
        refreshing={refreshing}
        size={BULB_SIZE}
        theme={theme}
        reduceMotion={reduceMotion}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
});
