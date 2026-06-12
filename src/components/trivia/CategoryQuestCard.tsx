import { Platform, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { hexColors } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { getLucideIcon } from '../../utils/iconMapper';
import { absoluteFillObject } from '../../utils/styles';
import { useResponsive } from '../../utils/useResponsive';
import { GlassSurface } from '../GlassSurface';
import { Check, ChevronRight } from '../icons';
import { XStack, YStack } from '../Stacks';
import { FONT_FAMILIES, Text } from '../Typography';

import type { CategoryWithProgress } from '../../services/trivia';

interface CategoryQuestCardProps {
  category: CategoryWithProgress;
  isDark: boolean;
  onPress: () => void;
  index: number;
}

export function CategoryQuestCard({ category, isDark, onPress, index }: CategoryQuestCardProps) {
  const { spacing, radius, typography, iconSizes } = useResponsive();
  const progress = category.total > 0 ? Math.round((category.mastered / category.total) * 100) : 0;

  const isComplete = category.isComplete;

  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

  // Use category color or fallback
  const categoryColor = category.color_hex || primaryColor;

  // On iOS 26 the card goes transparent and Liquid Glass (tinted with the same
  // card color) shows through; everywhere else today's opaque card is untouched.
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  return (
    <Animated.View
      entering={FadeIn.duration(300).delay(150 + index * 50)}
      style={[questShadowStyles.card, { borderRadius: radius.md }]}
    >
      <Pressable
        onPress={onPress}
        disabled={isComplete}
        style={({ pressed }) => ({
          opacity: pressed && !isComplete ? 0.7 : isComplete ? 0.6 : 1,
        })}
      >
        <XStack
          backgroundColor={useGlass ? 'transparent' : cardBg}
          padding={spacing.lg}
          borderRadius={radius.md}
          alignItems="center"
          gap={spacing.md}
          overflow={useGlass ? 'hidden' : undefined}
        >
          {useGlass && (
            <GlassSurface
              variant="glass"
              isDark={isDark}
              tint={cardBg}
              glassTint={hexToRgba(cardBg, isDark ? 0.6 : 0.65)}
              borderRadius={radius.md}
              style={absoluteFillObject}
            />
          )}
          {/* Category icon */}
          <YStack
            width={40}
            height={40}
            borderRadius={20}
            backgroundColor={categoryColor}
            justifyContent="center"
            alignItems="center"
          >
            {getLucideIcon(category.icon, iconSizes.md, '#FFFFFF')}
          </YStack>

          {/* Content */}
          <YStack flex={1}>
            <XStack alignItems="center" gap={spacing.sm}>
              <Text.Label fontFamily={FONT_FAMILIES.semibold} color={textColor}>
                {category.name}
              </Text.Label>
              {isComplete && <Check size={typography.fontSize.caption} color={successColor} />}
            </XStack>

            {/* Progress bar */}
            <XStack alignItems="center" gap={spacing.sm} marginTop={spacing.xs}>
              <YStack
                flex={1}
                height={3}
                borderRadius={2}
                backgroundColor={isDark ? hexColors.dark.border : hexColors.light.border}
              >
                <YStack
                  height={3}
                  borderRadius={2}
                  backgroundColor={isComplete ? successColor : primaryColor}
                  width={`${progress}%`}
                />
              </YStack>
              <Text.Caption color={secondaryTextColor}>
                {category.mastered}/{category.total}
              </Text.Caption>
            </XStack>
          </YStack>

          {!isComplete && <ChevronRight size={iconSizes.md} color={secondaryTextColor} />}
        </XStack>
      </Pressable>
    </Animated.View>
  );
}

const questShadowStyles = StyleSheet.create({
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
});
