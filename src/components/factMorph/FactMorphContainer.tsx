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

import { setActiveFactMorph } from '../../services/factMorph';
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

// Interactive left-edge swipe-back (stand-in for the native stack gesture,
// which a transparentModal can't have). Translation across the screen width
// maps linearly onto the reverse morph, like UIKit's interactive pop.
const EDGE_SWIPE_WIDTH = 32;
const SWIPE_CLOSE_DISTANCE_RATIO = 0.3;
const SWIPE_CLOSE_VELOCITY = 800;
const SWIPE_SETTLE_MS = 220;

// Ceiling on waiting for the replica's image to paint before the morph
// starts anyway (broken or glacial images shouldn't block the open; they
// just fall back to the pre-gate behavior of fading from the blurhash).
const REPLICA_READY_FALLBACK_MS = 300;

/**
 * "Container transform" shared-element morph from a pressed fact card to the
 * full-screen fact detail.
 *
 * Hosted by the fact/morph/[id] route (transparentModal, animation:'none', so
 * the feed stays visible behind and this component owns ALL motion):
 *
 *  - A clipped container animates from the card's window rect to full screen.
 *  - Inside it, a ONE-SIDED dissolve: the real detail screen (rendered at
 *    final size, scaled with a top-left origin so its width tracks the
 *    container width exactly every frame) stays fully opaque, and only the
 *    static card replica on top fades out. The detail content must NEVER sit
 *    under an animated opacity: FactModal's bottom action bar uses Liquid
 *    Glass (UIVisualEffectView), which permanently fails to render when
 *    mounted while any ancestor has alpha < 1. Replicas are therefore opaque
 *    at progress 0 (they're all the frame-0 coverage there is).
 *  - Replica geometry: sources with an image (full-bleed cards, row
 *    thumbnails — for rows the registered rect is the thumbnail itself, not
 *    the row) morph their image from the pressed frame onto the detail hero
 *    frame, keeping the picture continuous. Imageless thumbnail sources have
 *    no hero to land on (the detail renders none), so their placeholder
 *    replica stays pinned at its original size and fades in place.
 *  - The morph does NOT start on mount: replica images decode asynchronously
 *    even on memory-cache hits, and starting earlier flashes the blurhash/
 *    placeholder where the pressed image was. Until the replica reports its
 *    first paint (onLoad/onDisplay, REPLICA_READY_FALLBACK_MS backstop) the
 *    container parks off-screen — translated, never alpha-hidden (the Liquid
 *    Glass constraint above) — and the source card stays visible.
 *  - From that ready commit on, the source card hides itself
 *    (setActiveFactMorph → useFactMorphSource), like UIKit's zoom transition
 *    hiding the source cell: otherwise the closing screen shrinks down on
 *    top of a visible duplicate. It's revealed one commit BEFORE the pop,
 *    under the replica's exact cover, so neither direction shows a hole or a
 *    double.
 *  - Close (X button, pull-down, left-edge swipe-right, Android back) plays
 *    the reverse morph, then pops the route. The edge swipe is interactive:
 *    the finger drives the morph progress directly. Reanimated's
 *    reduced-motion handling makes the timed directions jump-cut
 *    automatically when the system requests it.
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
  // (it can carry a component reference, which isn't worklet-serializable).
  const srcX = source.x;
  const srcY = source.y;
  const srcW = source.width;
  const srcH = source.height;
  const srcRadius = source.borderRadius;
  // Hero-continuous geometry: the replica's image morphs onto the detail hero
  // frame. Full-bleed cards (and the onboarding sample cards) always do;
  // thumbnail sources do when the fact has an image. An imageless thumbnail
  // has no hero to land on — the detail renders none — so it fades in place.
  const morphsToHero =
    source.kind === 'image-card' || source.kind === 'sample-card' || source.imageUri != null;

  const progress = useSharedValue(0);
  // Content is inert while morphing; enabled once fully open.
  const [interactive, setInteractive] = useState(false);
  const closingRef = useRef(false);

  // Frame-0 gate: true once the replica's image has painted (or the fallback
  // fired), i.e. once the container can cover the source card without a
  // flash. See the readiness note in the component docs.
  const [replicaReady, setReplicaReady] = useState(false);
  const onReplicaReady = useCallback(() => setReplicaReady(true), []);
  useEffect(() => {
    const fallback = setTimeout(() => setReplicaReady(true), REPLICA_READY_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    if (!replicaReady) return;
    progress.value = withTiming(
      1,
      { duration: OPEN_DURATION_MS, easing: OPEN_EASING },
      (finished) => {
        if (finished) runOnJS(setInteractive)(true);
      }
    );
    // Opens exactly once: replicaReady only ever flips false → true.
  }, [replicaReady]);

  // Hide the pressed card from the ready commit on — the same commit that
  // moves the container into place over it, so the swap is seamless. The
  // unmount cleanup is only the safety net — the normal path reveals the card
  // in goBack(), one commit before the pop, while the replica still covers it
  // exactly; revealing only on unmount can leave a one-frame hole after the
  // screen is gone.
  useEffect(() => {
    if (!replicaReady) return;
    setActiveFactMorph(source);
    return () => setActiveFactMorph(null);
  }, [replicaReady, source]);

  // Idempotent: the X button, the edge swipe, and Android back can race onto
  // this; a double router.back() would pop the screen below too.
  const poppedRef = useRef(false);
  const goBack = useCallback(() => {
    if (poppedRef.current) return;
    poppedRef.current = true;
    setActiveFactMorph(null);
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
  // otherwise the morph springs back open. hitSlop restricts recognition to
  // the edge strip so the vertical scroll and the related-facts carousel
  // never compete with it, and the pan is attached to an ANCESTOR of the
  // scroll views (observes, doesn't consume), so vertical drags that start
  // in the strip still scroll normally after failOffsetY fails the pan.
  // Disabled until the open completes and while a button-close is running
  // (close() flips `interactive` off, which also cancels an in-flight pan).
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
  // with the same endpoints), keeping the hero image continuous. NO opacity
  // here — the Liquid Glass action bar inside breaks if it mounts under an
  // animated alpha (see component docs); the replica above provides the fade.
  const contentStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [{ scale: interpolate(p, [0, 1], [srcW / targetW, 1]) }],
    };
  });

  // Card replica, fading out on top of the always-opaque content (and back
  // in on close) — see the one-sided dissolve note in the component docs.
  // Hero-continuous sources: the image morphs pressed frame → detail hero
  // frame, tracking the container width. Imageless thumbnails: pinned at the
  // original size (no hero to morph onto), fading in place.
  const replicaStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      width: morphsToHero ? interpolate(p, [0, 1], [srcW, targetW]) : srcW,
      height: morphsToHero ? interpolate(p, [0, 1], [srcH, heroHeight]) : srcH,
      opacity: interpolate(p, [0.2, 0.6], [1, 0], Extrapolation.CLAMP),
    };
  });

  const surfaceColor = theme === 'dark' ? hexColors.dark.surface : hexColors.light.surface;

  return (
    <FactMorphContext.Provider value={controller}>
      {/* Local GH root: expo-router doesn't mount a global one, and the
          GestureDetector below requires an ancestor root view. */}
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={edgeSwipe}>
          {/* Root also swallows touches so the visible feed behind stays inert. */}
          <View style={styles.root} onLayout={onRootLayout}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
            <Animated.View
              style={[
                styles.container,
                { backgroundColor: surfaceColor },
                containerStyle,
                !replicaReady && styles.waitingOffscreen,
              ]}
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
                <FactCardReplica source={source} onReady={onReplicaReady} />
              </Animated.View>
            </Animated.View>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
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
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  // Parks the not-yet-ready presentation out of view WITHOUT touching alpha
  // (the Liquid Glass mount constraint): layout and image decoding proceed
  // normally off-screen while the source card stays visible in the feed.
  waitingOffscreen: {
    transform: [{ translateX: 100000 }],
  },
});
