import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useRouter } from 'expo-router';

import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';

import { FactCardReplica } from './FactCardReplica';
import { FactMorphContext } from './FactMorphContext';

import type { FactMorphSource } from '../../services/factMorph';

// Container-transform timings (App Store card feel): fast-start/soft-settle
// expansion on open, a slightly quicker settle back onto the card on close.
const OPEN_DURATION_MS = 450;
const CLOSE_DURATION_MS = 320;
const OPEN_EASING = Easing.bezier(0.19, 1, 0.22, 1);
const CLOSE_EASING = Easing.bezier(0.4, 0, 0.22, 1);

/**
 * "Container transform" shared-element morph from a pressed fact card to the
 * full-screen fact detail.
 *
 * Hosted by the fact/morph/[id] route (transparentModal, animation:'none', so
 * the feed stays visible behind and this component owns ALL motion):
 *
 *  - A clipped container animates from the card's window rect to full screen.
 *  - Inside it, two layers cross-fade:
 *     1. the real detail screen, rendered at final size and scaled with a
 *        top-left origin so its width tracks the container width exactly
 *        every frame (the hero image stays geometrically continuous), and
 *     2. a static replica of the pressed card whose image region morphs from
 *        the card frame onto the detail hero frame.
 *  - Close (X button, pull-down, Android back) plays the reverse morph, then
 *    pops the route. Reanimated's reduced-motion handling makes both
 *    directions jump-cut automatically when the system requests it.
 */
export function FactMorphContainer({
  source,
  children,
}: {
  source: FactMorphSource;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const { isTablet, isLandscape } = useResponsive();

  // End-state size. Window dimensions are right on the first frame; onLayout
  // corrects them if the transparent modal's actual viewport ever differs.
  const [target, setTarget] = useState({ w: windowW, h: windowH });
  const targetW = target.w;
  const targetH = target.h;

  // Mirrors FactModal's IMAGE_HEIGHT formula (containerWidth === targetW), so
  // the replica's image region lands exactly on the detail hero frame.
  const heroHeight = isTablet ? (isLandscape ? targetW * 0.7 : targetW * 0.8) : targetW;

  // Primitives only — the worklets below must not capture `source` itself
  // (it carries a component reference, which isn't worklet-serializable).
  const srcX = source.x;
  const srcY = source.y;
  const srcW = source.width;
  const srcH = source.height;
  const srcRadius = source.borderRadius;

  const progress = useSharedValue(0);
  // Content is inert while morphing; enabled once fully open.
  const [interactive, setInteractive] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: OPEN_DURATION_MS, easing: OPEN_EASING },
      (finished) => {
        if (finished) runOnJS(setInteractive)(true);
      }
    );
    // Open exactly once, on mount.
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, [router]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setInteractive(false);
    progress.value = withTiming(
      0,
      { duration: CLOSE_DURATION_MS, easing: CLOSE_EASING },
      (finished) => {
        if (finished) runOnJS(goBack)();
      }
    );
  }, [goBack, progress]);

  // Android hardware back: play the reverse morph instead of an instant pop.
  // Registered after the navigator's own handler, so it wins (LIFO).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  const controller = useMemo(() => ({ close }), [close]);

  const onRootLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0 && (width !== targetW || height !== targetH)) {
        setTarget({ w: width, h: height });
      }
    },
    [targetW, targetH]
  );

  // Feed dim behind the expanding card.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.45]),
  }));

  // The clipped container: card rect → full screen.
  const containerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      left: interpolate(p, [0, 1], [srcX, 0]),
      top: interpolate(p, [0, 1], [srcY, 0]),
      width: interpolate(p, [0, 1], [srcW, targetW]),
      height: interpolate(p, [0, 1], [srcH, targetH]),
      borderRadius: interpolate(p, [0, 1], [srcRadius, 0]),
    };
  });

  // Real detail screen at final size, scaled from the top-left so its visual
  // width equals the container width at every frame (both are linear in p
  // with the same endpoints), keeping the hero image continuous.
  const contentStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0.15, 0.45], [0, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, [0, 1], [srcW / targetW, 1]) }],
    };
  });

  // Card replica's image region: card frame → detail hero frame, fading out
  // on top of the incoming content (and back in on close).
  const replicaStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      height: interpolate(p, [0, 1], [srcH, heroHeight]),
      opacity: interpolate(p, [0.2, 0.6], [1, 0], Extrapolation.CLAMP),
    };
  });

  const surfaceColor = theme === 'dark' ? hexColors.dark.surface : hexColors.light.surface;

  return (
    <FactMorphContext.Provider value={controller}>
      {/* Root also swallows touches so the visible feed behind stays inert. */}
      <View style={styles.root} onLayout={onRootLayout}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
        <Animated.View
          style={[styles.container, { backgroundColor: surfaceColor }, containerStyle]}
        >
          <Animated.View
            style={[
              styles.content,
              {
                width: targetW,
                height: targetH,
                pointerEvents: interactive ? 'auto' : 'none',
              },
              contentStyle,
            ]}
          >
            {children}
          </Animated.View>
          <Animated.View style={[styles.replica, replicaStyle]}>
            <FactCardReplica source={source} />
          </Animated.View>
        </Animated.View>
      </View>
    </FactMorphContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: '#000000',
  },
  container: {
    position: 'absolute',
    overflow: 'hidden',
  },
  content: {
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: 'top left',
  },
  replica: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
});
