import React from 'react';
import { StyleSheet } from 'react-native';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { Flame, Target, CheckCircle } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import type { QuizStats } from '../../services/quiz';
import type { TranslationKeys } from '../../i18n/translations';

const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

interface QuizStatsHeroProps {
  stats: QuizStats | null;
  streak: number;
  isDark: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}

export function QuizStatsHero({ stats, streak, isDark, t }: QuizStatsHeroProps) {
  const accuracy = stats?.accuracy ?? 0;
  const totalAnswered = stats?.totalAnswered ?? 0;
  
  // Don't show if no stats
  if (totalAnswered === 0) return null;
  
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const orangeColor = isDark ? tokens.color.dark.neonOrange : tokens.color.light.neonOrange;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <XStack
        backgroundColor={cardBg}
        padding={tokens.space.lg}
        borderRadius={tokens.radius.md}
        justifyContent="space-around"
      >
        {/* Streak */}
        <YStack alignItems="center" gap={4}>
          <XStack alignItems="center" gap={4}>
            <Flame size={16} color={streak > 0 ? orangeColor : secondaryTextColor} />
            <Text
              fontSize={18}
              fontWeight="600"
              color={streak > 0 ? orangeColor : secondaryTextColor}
              fontFamily={FONT_FAMILIES.semibold}
            >
              {streak}
            </Text>
          </XStack>
          <Text fontSize={11} color={secondaryTextColor}>
            {t('streak')}
          </Text>
        </YStack>
        
        {/* Accuracy */}
        <YStack alignItems="center" gap={4}>
          <XStack alignItems="center" gap={4}>
            <Target size={16} color={successColor} />
            <Text
              fontSize={18}
              fontWeight="600"
              color={successColor}
              fontFamily={FONT_FAMILIES.semibold}
            >
              {accuracy}%
            </Text>
          </XStack>
          <Text fontSize={11} color={secondaryTextColor}>
            {t('accuracy')}
          </Text>
        </YStack>
        
        {/* Answered */}
        <YStack alignItems="center" gap={4}>
          <XStack alignItems="center" gap={4}>
            <CheckCircle size={16} color={primaryColor} />
            <Text
              fontSize={18}
              fontWeight="600"
              color={primaryColor}
              fontFamily={FONT_FAMILIES.semibold}
            >
              {totalAnswered}
            </Text>
          </XStack>
          <Text fontSize={11} color={secondaryTextColor}>
            {t('answered')}
          </Text>
        </YStack>
      </XStack>
    </Animated.View>
  );
}
