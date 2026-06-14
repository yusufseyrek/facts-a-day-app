import React, { useEffect, useId } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  BULB_PATHS,
  CARD,
  DOT_COLS,
  DOT_R,
  DOT_ROWS,
  HEADER_BOTTOM,
  TAB,
  TAB_CXS,
} from './factBulbGeometry';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

// Square crop centred on the mark (1024 icon grid) with room for the halo + base.
const VIEW_BOX = '110 124 800 800';

// Glass centre — anchor for the halo glow.
const GLASS_CX = 510;
const GLASS_CY = 440;

// Orange header band: rounded top corners (matching the card), square bottom.
const HEADER_D =
  `M${CARD.x} ${CARD.y + CARD.rx} a${CARD.rx} ${CARD.rx} 0 0 1 ${CARD.rx} -${CARD.rx} ` +
  `H${CARD.x + CARD.w - CARD.rx} a${CARD.rx} ${CARD.rx} 0 0 1 ${CARD.rx} ${CARD.rx} ` +
  `V${HEADER_BOTTOM} H${CARD.x} Z`;

// Reading order (top row first) so days light left-to-right, top-to-bottom.
const DOTS = DOT_ROWS.flatMap((cy) => DOT_COLS.map((cx) => ({ cx, cy })));
const DOT_COUNT = DOTS.length;

export interface FactBulbProps {
  /** 0→1 amount the user has pulled (lights the bulb partway). */
  progress: SharedValue<number>;
  /** 0→1 eased "is refreshing" bloom (lights it the rest of the way). */
  active: SharedValue<number>;
  /** Drives the breathing + day-tick loops; off snaps them away. */
  refreshing: boolean;
  size?: number;
  theme: 'light' | 'dark';
  reduceMotion?: boolean;
}

/** One calendar day; lights in turn during the refresh loop, else fully on. */
function AnimatedDot({
  cx,
  cy,
  index,
  tick,
  color,
  refreshing,
}: {
  cx: number;
  cy: number;
  index: number;
  tick: SharedValue<number>;
  color: string;
  refreshing: boolean;
}) {
  const props = useAnimatedProps(() => {
    if (!refreshing) return { opacity: 1 };
    // A wave sweeps 0→DOT_COUNT (+pause), lighting each day as it passes.
    const phase = tick.value * (DOT_COUNT + 2);
    const lit = Math.min(1, Math.max(0, phase - index));
    return { opacity: 0.3 + 0.7 * lit };
  });
  return <AnimatedCircle cx={cx} cy={cy} r={DOT_R} fill={color} animatedProps={props} />;
}

/**
 * Animated app-logo for the pull-to-refresh affordance, built from the faithful
 * vector of the app icon ({@link BULB_PATHS} + calendar primitives). As you pull
 * it fades and scales in, the glass fills with light and the halo swells; on
 * release it "switches on" — the halo breathes and the calendar days light up in
 * turn while the feed loads. Driven entirely by `progress` + `active`, so it can
 * be dropped anywhere a branded loader is wanted.
 */
export function FactBulb({
  progress,
  active,
  refreshing,
  size = 72,
  theme,
  reduceMotion = false,
}: FactBulbProps) {
  // Faithful palette (sampled from splash-icon.png); bulb lifted a touch on dark
  // so the cyan reads against the navy feed.
  const bulbTop = theme === 'dark' ? '#22C6FF' : '#0AB6FF';
  const bulbBot = theme === 'dark' ? '#0E9CFF' : '#0086EE';
  const dot = '#0E8FE0';
  const tab = '#0A5FA8';

  // react-native-svg resolves gradient/clip ids globally, so namespace them per
  // instance to keep two mounted bulbs from stealing each other's paint.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const haloId = `fb-halo-${uid}`;
  const bulbId = `fb-bulb-${uid}`;
  const cardId = `fb-card-${uid}`;
  const hdrId = `fb-hdr-${uid}`;

  // Loop drivers — only spun up while the feed is actually refreshing.
  const breath = useSharedValue(0);
  const tick = useSharedValue(0);

  useEffect(() => {
    if (refreshing && !reduceMotion) {
      breath.value = withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      tick.value = 0;
      tick.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(breath);
      cancelAnimation(tick);
      breath.value = withTiming(0, { duration: 240 });
      tick.value = 0;
    }
    return () => {
      cancelAnimation(breath);
      cancelAnimation(tick);
    };
  }, [refreshing, reduceMotion, breath, tick]);

  // Total illumination: the pull lights it, the refresh bloom finishes the job.
  const light = useDerivedValue(() => Math.max(progress.value, active.value));

  // Whole-mark entrance: scale up + fade in as it catches light, breathe on load.
  const containerStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, light.value * 1.7),
    transform: [{ scale: 0.6 + 0.4 * light.value + 0.03 * breath.value * active.value }],
  }));

  // Soft radial halo behind the glass — swells with light and breathes.
  const glowProps = useAnimatedProps(() => {
    const l = light.value;
    const b = breath.value * active.value;
    return { r: 200 + 70 * l + 24 * b, opacity: 0.08 + 0.34 * l + 0.14 * b };
  });

  // Glass rim + screw base brighten as the mark lights.
  const bulbProps = useAnimatedProps(() => ({ fillOpacity: 0.45 + 0.55 * light.value }));

  // Calendar fades in a beat behind the glass.
  const calProps = useAnimatedProps(() => ({
    opacity: interpolate(light.value, [0.18, 0.7], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size }, containerStyle]}>
      <Svg width={size} height={size} viewBox={VIEW_BOX}>
        <Defs>
          <RadialGradient id={haloId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={bulbTop} stopOpacity={0.55} />
            <Stop offset="0.5" stopColor={bulbTop} stopOpacity={0.22} />
            <Stop offset="1" stopColor={bulbTop} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={bulbId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={bulbTop} />
            <Stop offset="1" stopColor={bulbBot} />
          </LinearGradient>
          <LinearGradient id={cardId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="1" stopColor="#E2F2FF" />
          </LinearGradient>
          <LinearGradient id={hdrId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FE9C06" />
            <Stop offset="1" stopColor="#F07410" />
          </LinearGradient>
        </Defs>

        {/* Halo */}
        <AnimatedCircle
          cx={GLASS_CX}
          cy={GLASS_CY}
          fill={`url(#${haloId})`}
          animatedProps={glowProps}
        />

        {/* Bulb glass + screw base. evenodd guarantees the glass renders as a
            ring (hole shows through) and never a solid disc on-device. */}
        <AnimatedG fill={`url(#${bulbId})`} animatedProps={bulbProps}>
          {BULB_PATHS.map((d, i) => (
            <Path key={i} d={d} fillRule="evenodd" />
          ))}
        </AnimatedG>

        {/* Calendar */}
        <AnimatedG animatedProps={calProps}>
          <Rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={CARD.rx} fill={`url(#${cardId})`} />
          <Path d={HEADER_D} fill={`url(#${hdrId})`} />
          {TAB_CXS.map((cx) => (
            <Rect
              key={cx}
              x={cx - TAB.w / 2}
              y={TAB.y}
              width={TAB.w}
              height={TAB.h}
              rx={TAB.rx}
              fill={tab}
            />
          ))}
          {DOTS.map((d, i) => (
            <AnimatedDot
              key={i}
              cx={d.cx}
              cy={d.cy}
              index={i}
              tick={tick}
              color={dot}
              refreshing={refreshing}
            />
          ))}
        </AnimatedG>
      </Svg>
    </Animated.View>
  );
}
