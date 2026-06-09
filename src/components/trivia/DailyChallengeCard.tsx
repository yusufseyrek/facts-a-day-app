import { Platform, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Check, ChevronRight, Zap } from '@tamagui/lucide-icons';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { XStack, YStack } from 'tamagui';

import { hexColors } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { absoluteFillObject } from '../../utils/styles';
import { useResponsive } from '../../utils/useResponsive';
import { GlassSurface } from '../GlassSurface';
import { FONT_FAMILIES, Text } from '../Typography';

import type { TranslationKeys } from '../../i18n/translations';

interface DailyChallengeCardProps {
  questionsCount: number;
  isCompleted: boolean;
  streak: number;
  isDark: boolean;
  onPress: () => void;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}

export function DailyChallengeCard({
  questionsCount,
  isCompleted,
  isDark,
  onPress,
  t,
}: DailyChallengeCardProps) {
  const { spacing, radius, iconSizes } = useResponsive();
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

  // On iOS 26 the card goes transparent and Liquid Glass (tinted with the same
  // card color) shows through. The neutral hairline border is dropped under
  // glass, but the success border is KEPT — it's the completion signal.
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  return (
    <Animated.View
      entering={FadeIn.duration(300).delay(100)}
      style={[dailyShadowStyles.card, { borderRadius: radius.md }]}
    >
      <Pressable
        onPress={onPress}
        disabled={isCompleted}
        style={({ pressed }) => ({
          opacity: pressed && !isCompleted ? 0.8 : 1,
        })}
      >
        <XStack
          backgroundColor={useGlass ? 'transparent' : cardBg}
          padding={spacing.lg}
          borderRadius={radius.md}
          borderWidth={useGlass && !isCompleted ? 0 : 1}
          borderColor={isCompleted ? successColor : borderColor}
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
              style={absoluteFillObject}
            />
          )}
          {/* Icon */}
          <YStack
            width={44}
            height={44}
            borderRadius={22}
            backgroundColor={isCompleted ? successColor : primaryColor}
            justifyContent="center"
            alignItems="center"
          >
            {isCompleted ? (
              <Check size={iconSizes.md} color="#FFFFFF" />
            ) : (
              <Zap size={iconSizes.md} color="#FFFFFF" />
            )}
          </YStack>

          {/* Content */}
          <YStack flex={1}>
            <Text.Label fontFamily={FONT_FAMILIES.semibold} color={textColor}>
              {t('dailyTrivia')}
            </Text.Label>
            <Text.Caption color={secondaryTextColor} marginTop={2}>
              {isCompleted
                ? t('dailyTriviaCompleted')
                : t('dailyTriviaQuestions', { count: questionsCount })}
            </Text.Caption>
          </YStack>

          {!isCompleted && <ChevronRight size={iconSizes.md} color={secondaryTextColor} />}
        </XStack>
      </Pressable>
    </Animated.View>
  );
}

const dailyShadowStyles = StyleSheet.create({
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
});
