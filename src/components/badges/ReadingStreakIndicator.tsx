import React from 'react';
import { Pressable } from 'react-native';

import { Flame } from '@tamagui/lucide-icons';
import { XStack } from 'tamagui';

import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

interface ReadingStreakIndicatorProps {
  streak: number;
  onPress: () => void;
}

export function ReadingStreakIndicator({ streak, onPress }: ReadingStreakIndicatorProps) {
  const { theme } = useTheme();
  const { spacing, iconSizes, radius } = useResponsive();
  const colors = hexColors[theme];

  const isActive = streak > 0;
  const flameColor = isActive ? '#FF6B35' : colors.textSecondary;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <XStack
        alignItems="center"
        gap={spacing.xs}
        paddingHorizontal={spacing.sm}
        paddingVertical={spacing.xs}
        borderRadius={radius.md}
        backgroundColor={isActive ? `${flameColor}15` : `${colors.border}20`}
      >
        <Flame size={iconSizes.sm} color={flameColor} />
        <Text.Label
          fontFamily={FONT_FAMILIES.semibold}
          color={isActive ? flameColor : colors.textSecondary}
        >
          {streak}
        </Text.Label>
      </XStack>
    </Pressable>
  );
}
