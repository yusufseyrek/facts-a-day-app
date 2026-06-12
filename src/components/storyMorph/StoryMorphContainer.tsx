import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
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

import { setActiveStoryMorph } from '../../services/storyMorph';
import { hexColors, useTheme } from '../../theme';

import { StoryButtonCircle } from './StoryButtonCircle';
import { StoryMorphContext } from './StoryMorphContext';

import type { StoryMorphSource } from '../../services/storyMorph';

// Same container-transform timings as FactMorphContainer: fast-start/
// soft-settle expansion on open, a slightly quicker settle back on close.
const OPEN_DURATION_MS = 450;
const CLOSE_DURATION_MS = 320;
const OPEN_EASING = Easing.bezier(0.19, 1, 0.22, 1);
const CLOSE_EASING = Easing.bezier(0.4, 0, 0.22, 1);

// Interactive left-edge swipe-back, identical to the fact morph's. The strip
// is narrow and the pan fails on vertical movement, so the story's vertical
// snap-scroll never competes with it.
const EDGE_SWIPE_WIDTH = 32;
const SWIPE_CLOSE_DISTANCE_RATIO = 0.3;
const SWIPE_CLOSE_VELOCITY = 800;
const SWIPE_SETTLE_MS = 220;

/**
 * "Container transform" morph from a pressed story button circle to the
 * full-screen story view — the story twin of FactMorphContainer.
 *
 * Hosted by the story/morph/[category] route (transparentModal,
 * animation:'none', so the home feed stays visible behind and this component
 * owns ALL motion):
 *
 *  - A clipped container animates from the circle's window rect to full
 *    screen. Inside it, the real story screen (rendered at final size, scaled
 *    with a top-left origin so its width tracks the container width exactly
 *    every frame) stays fully opaque, and only the static circle replica on
 *    top fades out — the same one-sided dissolve as the fact morph, which
 *    also keeps the story's Liquid Glass close button out from under an
 *    animated opacity.
 *  - Replica geometry: unlike fact cards, the circle has no full-screen
 *    counterpart to morph onto, and pinning it to the container's top-left
 *    would fling it across the screen (the circle can sit anywhere in the
 *    row). It counter-translates instead, holding its window position while
 *    the story expands around it — the circle "opens up" in place.
 *  - While mounted, the source circle hides itself (setActiveStoryMorph →
 *    useStoryMorphSource) and is revealed one commit BEFORE the pop, under
 *    the replica's exact cover, so neither direction shows a hole or a
 *    double.
 *  - Close (story X button via StoryMorphContext, left-edge swipe-right,
 *    Android back) plays the reverse morph, then pops the route.
 */
export function StoryMorphContainer({
  source,
  children,
}: {
  source: StoryMorphSource;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const { width: windowW, height: windowH } = useWindowDimensions();

  // End-state size. Window dimensions are right on the first frame; onLayout
  // corrects them if the transparent modal's actual viewport ever differs.
  const [target, setTarget] = useState({ w: windowW, h: windowH });
  const targetW = target.w;
  const targetH = target.h;

  // Primitives only — the worklets below must not capture `source` itself.
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

  // Hide the pressed circle for the lifetime of this presentation. The
  // unmount cleanup is only the safety net — the normal path reveals it in
  // goBack(), one commit before the pop, while the replica still covers it
  // exactly.
  useEffect(() => {
    setActiveStoryMorph(source);
    return () => setActiveStoryMorph(null);
  }, [source]);

  // Idempotent: the X button, the edge swipe, and Android back can race onto
  // this; a double router.back() would pop the screen below too.
  const poppedRef = useRef(false);
  const goBack = useCallback(() => {
    if (poppedRef.current) return;
    poppedRef.current = true;
    setActiveStoryMorph(null);
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

  // Left-edge swipe-right: the finger drives the reverse morph directly;
  // release past the distance/velocity threshold completes the close,
  // otherwise the morph springs back open. Attached to an ANCESTOR of the
  // story's scroll view (observes, doesn't consume), so vertical drags that
  // start in the strip still scroll normally after failOffsetY fails the pan.
  const edgeSwipe = useMemo(
    () =>
      Gesture.Pan()
        .enabled(interactive)
        .hitSlop({ right: -(targetW - EDGE_SWIPE_WIDTH) })
        .activeOffsetX(12)
        .failOffsetY([-16, 16])
        .onUpdate((e) => {
          progress.value = 1 - Math.min(Math.max(e.translationX, 0) / targetW, 1);
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationX > targetW * SWIPE_CLOSE_DISTANCE_RATIO ||
            e.velocityX > SWIPE_CLOSE_VELOCITY;
          if (shouldClose) {
            progress.value = withTiming(
              0,
              { duration: SWIPE_SETTLE_MS, easing: CLOSE_EASING },
              (finished) => {
                if (finished) runOnJS(goBack)();
              }
            );
          } else {
            progress.value = withTiming(1, { duration: SWIPE_SETTLE_MS, easing: CLOSE_EASING });
          }
        }),
    [interactive, targetW, progress, goBack]
  );

  const onRootLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0 && (width !== targetW || height !== targetH)) {
        setTarget({ w: width, h: height });
      }
    },
    [targetW, targetH]
  );

  // Home feed dim behind the expanding story.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.45]),
  }));

  // The clipped container: circle rect → full screen.
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

  // Real story screen at final size, scaled from the top-left so its visual
  // width equals the container width at every frame (both are linear in p
  // with the same endpoints). NO opacity here — the replica above provides
  // the fade (one-sided dissolve, see component docs).
  const contentStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [{ scale: interpolate(p, [0, 1], [srcW / targetW, 1]) }],
    };
  });

  // Circle replica, fading out on top of the always-opaque content (and back
  // in on close). Counter-translates against the container's drift toward the
  // window origin (container left = srcX·(1−p), so replica left = srcX·p) so
  // the circle holds its window position while the story expands around it.
  // At p=0 both terms place it exactly on the source rect — the reveal cover.
  const replicaStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      left: srcX * p,
      top: srcY * p,
      opacity: interpolate(p, [0.2, 0.6], [1, 0], Extrapolation.CLAMP),
    };
  });

  // The story screen's own background, so the container never flashes a
  // mismatched surface while the (initially loading) story renders behind it.
  const backgroundColor = hexColors[theme].background;

  return (
    <StoryMorphContext.Provider value={controller}>
      {/* Local GH root: expo-router doesn't mount a global one, and the
          GestureDetector below requires an ancestor root view. */}
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={edgeSwipe}>
          {/* Root also swallows touches so the visible feed behind stays inert. */}
          <View style={styles.root} onLayout={onRootLayout}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
            <Animated.View style={[styles.container, { backgroundColor }, containerStyle]}>
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
              <Animated.View style={[styles.replica, { width: srcW, height: srcH }, replicaStyle]}>
                <StoryButtonCircle
                  hasUnseen={source.hasUnseen}
                  isMix={source.isMix}
                  icon={source.icon}
                  imageUrl={source.imageUrl}
                  ringColor={source.ringColor}
                  iconColor={source.iconColor}
                  unseenFill={source.unseenFill}
                  seenFill={source.seenFill}
                  borderColor={source.borderColor}
                  outerSize={source.outerSize}
                  innerSize={source.innerSize}
                  iconSize={source.iconSize}
                />
              </Animated.View>
            </Animated.View>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </StoryMorphContext.Provider>
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
    pointerEvents: 'none',
  },
});
