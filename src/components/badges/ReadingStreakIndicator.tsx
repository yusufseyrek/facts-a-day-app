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
  const { spacing, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  const isActive = streak > 0;
  const flameColor = isActive ? '#FF6B35' : colors.textSecondary;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {/* Bare icon + count: no chip background — inside the iOS 26 glass
          header a filled pill reads as a stray box. Padding kept for the
          touch target. */}
      <XStack
        alignItems="center"
        gap={spacing.xs}
        paddingHorizontal={spacing.sm}
        paddingVertical={spacing.xs}
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
