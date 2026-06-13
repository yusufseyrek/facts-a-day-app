import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { getLucideIcon } from '../../utils/iconMapper';
import { Shuffle } from '../icons';

/**
 * The story button's circle visual (gradient ring while unseen, hairline ring
 * once seen, glowing image circle for story themes), shared by the live
 * CategoryButton and the morph replica so the replica is a pixel-exact clone
 * of the pressed button. All colors arrive pre-computed (blends depend on
 * theme + category) — exactly what StoryMorphSource carries. The theme
 * variant runs a self-contained shine loop; everything else stays a pure
 * render of primitives.
 */
export interface StoryButtonCircleProps {
  hasUnseen: boolean;
  isMix: boolean;
  icon?: string;
  /** Story themes: full-circle image fill replacing the icon. */
  imageUrl?: string | null;
  ringColor: string;
  iconColor: string;
  unseenFill: string;
  seenFill: string;
  borderColor: string;
  outerSize: number;
  innerSize: number;
  iconSize: number;
}

// How far the event-colored aura bleeds past a story-theme circle on every
// side, and the headroom the row must reserve above the circles: the row is a
// horizontal list that clips at its bounds, so without this top padding the
// aura's top would be cut off. The aura is sized to fade fully to transparent
// inside this margin (see ThemeImageCircle), so it never reaches the edge.
const GLOW_BLEED = 20;
export const THEME_GLOW_BLEED = GLOW_BLEED;

/** Lighten a hex color by a given amount (0–1). */
export function lightenColor(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const newR = Math.min(255, Math.round(r + (255 - r) * amount));
  const newG = Math.min(255, Math.round(g + (255 - g) * amount));
  const newB = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Story themes: the image IS the button. Borderless full-bleed circle sold by
 * three effects instead of a ring: a soft event-colored radial aura that hugs
 * the image rim and fades into the dark surface (drawn with SVG so it reads the
 * same on both platforms, unlike a one-sided RN shadow / monochrome Android
 * elevation), a slow breathing pulse on that aura, and a periodic diagonal
 * shine sweeping across the image — kin to the screen's gradient signature
 * rather than a flat cutout.
 */
function ThemeImageCircle({
  imageUrl,
  glowColor,
  fill,
  outerSize,
}: {
  imageUrl: string;
  glowColor: string;
  fill: string;
  outerSize: number;
}) {
  // Aura canvas: the circle plus GLOW_BLEED of headroom on every side. The
  // radial gradient peaks right at the image rim (so the edge looks lit) and
  // fades to fully transparent before the canvas edge — staying inside the
  // bleed the row reserves, so it's never clipped.
  const auraSize = outerSize + GLOW_BLEED * 2;
  const rimStop = outerSize / auraSize; // fraction of the radius where the image edge sits
  const midStop = rimStop + (1 - rimStop) * 0.5;
  // Lightened core keeps the halo luminous on the dark home surface; the raw
  // event color carries the cooler outer falloff.
  const coreGlow = lightenColor(glowColor, 0.35);
  // SVG gradient ids are resolved globally on native — key by color so two
  // themes with different colors can't pick up each other's gradient.
  const gradId = `themeGlow-${glowColor.replace(/[^a-zA-Z0-9]/g, '')}`;

  // 0 → 1 drives one shine sweep (left of the circle to past its right edge);
  // the strip parks outside the clip between sweeps, so no opacity juggling.
  const shine = useSharedValue(0);
  // 0 ⇄ 1 breathing pulse for the aura (scale + opacity), so the promo button
  // feels alive without the distraction of a hard blink.
  const pulse = useSharedValue(0);

  useEffect(() => {
    shine.value = 0;
    shine.value = withRepeat(
      withSequence(
        withDelay(2600, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => {
      cancelAnimation(shine);
      cancelAnimation(pulse);
    };
  }, [shine, pulse]);

  const auraStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.75, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.98, 1.06]) }],
  }));

  const stripWidth = outerSize * 0.45;
  const shineStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(shine.value, [0, 1], [-stripWidth * 1.5, outerSize + stripWidth]),
      },
      { rotate: '18deg' },
    ],
  }));

  return (
    <View style={[styles.circle, { width: outerSize, height: outerSize }]}>
      {/* Radial aura, centered behind the circle and larger than it. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: auraSize,
            height: auraSize,
            top: -GLOW_BLEED,
            left: -GLOW_BLEED,
          },
          auraStyle,
        ]}
      >
        <Svg width={auraSize} height={auraSize}>
          <Defs>
            <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={coreGlow} stopOpacity={0.5} />
              <Stop offset={rimStop} stopColor={coreGlow} stopOpacity={0.62} />
              <Stop offset={midStop} stopColor={glowColor} stopOpacity={0.3} />
              <Stop offset="1" stopColor={glowColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={auraSize / 2} cy={auraSize / 2} r={auraSize / 2} fill={`url(#${gradId})`} />
        </Svg>
      </Animated.View>

      {/* Image clip layer. The fill doubles as the loading placeholder. */}
      <View
        style={{
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          overflow: 'hidden',
          backgroundColor: fill,
        }}
      >
        <Image
          source={{ uri: imageUrl }}
          contentFit="cover"
          transition={150}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: -outerSize * 0.3,
              left: 0,
              width: stripWidth,
              height: outerSize * 1.6,
            },
            shineStyle,
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

export function StoryButtonCircle({
  hasUnseen,
  isMix,
  icon,
  imageUrl,
  ringColor,
  iconColor,
  unseenFill,
  seenFill,
  borderColor,
  outerSize,
  innerSize,
  iconSize,
}: StoryButtonCircleProps) {
  if (imageUrl) {
    return (
      <ThemeImageCircle
        imageUrl={imageUrl}
        glowColor={ringColor}
        fill={seenFill}
        outerSize={outerSize}
      />
    );
  }

  const iconNode = isMix ? (
    <Shuffle size={iconSize} color={iconColor} />
  ) : (
    getLucideIcon(icon, iconSize, iconColor)
  );

  if (hasUnseen) {
    // Gradient ring for unseen facts
    return (
      <LinearGradient
        colors={[ringColor, lightenColor(ringColor, 0.4)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.circle,
          {
            width: outerSize,
            height: outerSize,
            borderRadius: outerSize / 2,
          },
        ]}
      >
        <View
          style={[
            styles.circle,
            {
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
              backgroundColor: unseenFill,
            },
          ]}
        >
          {iconNode}
        </View>
      </LinearGradient>
    );
  }

  // Seen: slim hairline ring + faint category tint (the chunky muted ring
  // read as heavy next to the gradient state)
  return (
    <View
      style={[
        styles.circle,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          borderWidth: 1.5,
          borderColor,
          backgroundColor: seenFill,
        },
      ]}
    >
      {iconNode}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
