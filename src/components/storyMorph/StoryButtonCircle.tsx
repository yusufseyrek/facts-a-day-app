import React from 'react';
import { StyleSheet, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { getLucideIcon } from '../../utils/iconMapper';
import { Shuffle } from '../icons';

/**
 * The story button's circle visual (gradient ring while unseen, hairline ring
 * once seen), shared by the live CategoryButton and the morph replica so the
 * replica is a pixel-exact static clone of the pressed button. All colors
 * arrive pre-computed (blends depend on theme + category), keeping this a
 * pure render of primitives — exactly what StoryMorphSource carries.
 */
export interface StoryButtonCircleProps {
  hasUnseen: boolean;
  isMix: boolean;
  icon?: string;
  ringColor: string;
  iconColor: string;
  unseenFill: string;
  seenFill: string;
  borderColor: string;
  outerSize: number;
  innerSize: number;
  iconSize: number;
}

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

export function StoryButtonCircle({
  hasUnseen,
  isMix,
  icon,
  ringColor,
  iconColor,
  unseenFill,
  seenFill,
  borderColor,
  outerSize,
  innerSize,
  iconSize,
}: StoryButtonCircleProps) {
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
