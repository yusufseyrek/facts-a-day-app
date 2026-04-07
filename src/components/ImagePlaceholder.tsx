import React from 'react';
import { StyleSheet, View } from 'react-native';

import { hexColors, useTheme } from '../theme';
import { getLucideIcon } from '../utils/iconMapper';

interface ImagePlaceholderProps {
  width: number;
  height: number;
  borderRadius?: number;
  iconSize?: number;
  /** Category icon name (e.g. 'beaker', 'globe') — falls back to a subtle empty state */
  categoryIcon?: string | null;
  /** Category color hex — tints the icon */
  categoryColor?: string | null;
}

/**
 * Centered placeholder for images that haven't loaded.
 * Shows the category icon (if available) on a subtle surface background.
 */
export const ImagePlaceholder = React.memo(function ImagePlaceholder({
  width,
  height,
  borderRadius = 0,
  iconSize = 24,
  categoryIcon,
  categoryColor,
}: ImagePlaceholderProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const fallbackColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const iconColor = categoryColor ? `${categoryColor}80` : fallbackColor;

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius,
          backgroundColor: isDark ? hexColors.dark.surface : hexColors.light.border,
        },
      ]}
    >
      {categoryIcon ? getLucideIcon(categoryIcon, iconSize, iconColor) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
