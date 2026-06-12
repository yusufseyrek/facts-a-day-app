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

// Theme-button aura blur radius, and the headroom the story row must reserve
// above the circles: the row is a horizontal ScrollView, which clips at its
// bounds — without top padding the aura renders cut off at the row's top edge.
// A blur's visible falloff reaches ~2x its radius (radius alone still showed
// a faint flat edge), so the bleed reserves the full tail.
const GLOW_RADIUS = 12;
export const THEME_GLOW_BLEED = GLOW_RADIUS * 2;

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
 * two effects instead of a ring: an event-colored glow (shadow in the theme
 * color; Android gets it via colored elevation on API 28+) and a periodic
 * diagonal shine sweeping across the image — kin to the screen's gradient
 * signature rather than a flat cutout.
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
  // 0 → 1 drives one shine sweep (left of the circle to past its right edge);
  // the strip parks outside the clip between sweeps, so no opacity juggling.
  const shine = useSharedValue(0);

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
    return () => cancelAnimation(shine);
  }, [shine]);

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
    <View
      style={[
        styles.imageGlow,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          // Opaque fill behind the image: Android elevation needs it to cast,
          // and it doubles as the loading placeholder.
          backgroundColor: fill,
          // Lightened so the halo carries luminance on the dark home surface
          // (the raw event color reads as barely-there at shadow opacity).
          shadowColor: lightenColor(glowColor, 0.3),
        },
      ]}
    >
      {/* Clip layer is separate from the shadow layer (overflow hidden kills shadows). */}
      <View
        style={{ width: outerSize, height: outerSize, borderRadius: outerSize / 2, overflow: 'hidden' }}
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
  imageGlow: {
    // Zero offset: an even halo all around (aura), not a drop shadow.
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: GLOW_RADIUS,
    elevation: 12,
  },
});
