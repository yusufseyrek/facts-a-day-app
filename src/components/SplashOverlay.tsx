import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import * as SplashScreen from 'expo-splash-screen';

import { waitForHomeScreenReady } from '../contexts';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { absoluteFillObject } from '../utils/styles';

import {
  BULB_PATHS,
  CARD,
  DOT_COLS,
  DOT_R,
  DOT_ROWS,
  HEADER_BOTTOM,
  TAB,
  TAB_CXS,
} from './splashLogoGeometry';

// Must match app.json splash config exactly so the native→JS handoff is seamless.
const SPLASH_BACKGROUND = '#0A1628';
const LOGO_SIZE = 200;
// Deep blue of the calendar dots/tabs, sampled from the real logo (icon.png).
const DOT_BLUE = '#004CB0';

// Orange header band (rounded top corners matching the card, square bottom).
const HEADER_D =
  `M${CARD.x} ${CARD.y + CARD.rx} a${CARD.rx} ${CARD.rx} 0 0 1 ${CARD.rx} -${CARD.rx} ` +
  `H${CARD.x + CARD.w - CARD.rx} a${CARD.rx} ${CARD.rx} 0 0 1 ${CARD.rx} ${CARD.rx} ` +
  `V${HEADER_BOTTOM} H${CARD.x} Z`;

// 4-4-3 dot grid: the real logo drops the bottom-right dot.
const LAST_ROW = DOT_ROWS.length - 1;
const LAST_COL = DOT_COLS.length - 1;
const DOTS = DOT_ROWS.flatMap((cy, ri) =>
  DOT_COLS.map((cx, ci) => ({ cx, cy, ri, ci }))
).filter((d) => !(d.ri === LAST_ROW && d.ci === LAST_COL));

// Hard ceiling so a missed gate never strands the user on the splash.
const SAFETY_MS = 3200;

interface SplashOverlayProps {
  /** True once the app tree under the overlay is mounted (gates are armed). */
  appReady: boolean;
  onHidden: () => void;
}

/** The lit bulb + calendar mark on a 1024 grid (the traced app icon). */
function LogoMark() {
  return (
    <Svg width={LOGO_SIZE} height={LOGO_SIZE} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="spl-bulb" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0ABFFF" />
          <Stop offset="1" stopColor="#0090FB" />
        </LinearGradient>
        <LinearGradient id="spl-hdr" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FE9C06" />
          <Stop offset="1" stopColor="#F07410" />
        </LinearGradient>
      </Defs>
      {BULB_PATHS.map((d, i) => (
        <Path key={i} d={d} fill="url(#spl-bulb)" fillRule="evenodd" />
      ))}
      <Rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={CARD.rx} fill="#F2FAFF" />
      <Path d={HEADER_D} fill="url(#spl-hdr)" />
      {TAB_CXS.map((cx) => (
        <Rect key={cx} x={cx - TAB.w / 2} y={TAB.y} width={TAB.w} height={TAB.h} rx={TAB.rx} fill={DOT_BLUE} />
      ))}
      {DOTS.map((d, i) => (
        <Circle key={i} cx={d.cx} cy={d.cy} r={DOT_R} fill={DOT_BLUE} />
      ))}
    </Svg>
  );
}

/**
 * JS splash. Hands off seamlessly from the native splash (the lit logo), then
 * does a Twitter-style exit: the mark scales up past the edges of the screen
 * while the splash background fades, revealing the app behind it.
 *
 * A safety timer guarantees onHidden fires even if a readiness gate is missed.
 */
export function SplashOverlay({ appReady, onHidden }: SplashOverlayProps) {
  const reduceMotion = useReduceMotion();

  const [nativeHidden, setNativeHidden] = useState(false);
  const [homeReady, setHomeReady] = useState(false);
  const hiddenRef = useRef(false);

  const scale = useSharedValue(1); // starts at 1 to match the native logo exactly
  const bgOpacity = useSharedValue(1); // navy backdrop; fades to reveal the app
  const logoOpacity = useSharedValue(1);

  const finish = useCallback(() => {
    if (hiddenRef.current) return;
    hiddenRef.current = true;
    onHidden();
  }, [onHidden]);

  // Hide the native splash once the JS overlay has painted its first frame.
  const handleLayout = useCallback(() => {
    if (nativeHidden) return;
    const hide = () => {
      SplashScreen.hide();
      setNativeHidden(true);
    };
    requestAnimationFrame(() => (Platform.OS === 'android' ? requestAnimationFrame(hide) : hide()));
  }, [nativeHidden]);

  // Once the tree is mounted, wait for the home screen's first real paint.
  useEffect(() => {
    if (!appReady) return;
    let cancelled = false;
    waitForHomeScreenReady().then(() => {
      if (!cancelled) setHomeReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [appReady]);

  // Hard safety: never strand the user on the splash.
  useEffect(() => {
    const t = setTimeout(finish, SAFETY_MS);
    return () => clearTimeout(t);
  }, [finish]);

  // Play once both the native splash is gone and the app has painted.
  useEffect(() => {
    if (!nativeHidden || !homeReady) return;

    if (reduceMotion) {
      bgOpacity.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.ease) });
      logoOpacity.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.ease) });
      const t = setTimeout(finish, 300);
      return () => clearTimeout(t);
    }

    // Zoom the mark up past the viewport (accelerating) while the navy backdrop
    // fades to reveal the app, then the mark itself fades out.
    scale.value = withTiming(12, { duration: 460, easing: Easing.in(Easing.cubic) });
    bgOpacity.value = withDelay(80, withTiming(0, { duration: 340, easing: Easing.out(Easing.quad) }));
    logoOpacity.value = withDelay(170, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));

    const t = setTimeout(finish, 520);
    return () => clearTimeout(t);
  }, [nativeHidden, homeReady, reduceMotion, finish, scale, bgOpacity, logoOpacity]);

  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Animated.View style={[styles.bg, bgStyle]} />
      <Animated.View style={[styles.fillCenter, logoStyle]}>
        <LogoMark />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...absoluteFillObject,
    zIndex: 9999,
  },
  bg: {
    ...absoluteFillObject,
    backgroundColor: SPLASH_BACKGROUND,
  },
  fillCenter: {
    ...absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
