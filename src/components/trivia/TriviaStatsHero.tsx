import React from 'react';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { Target, CheckCircle, Award } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import type { TriviaStats } from '../../services/trivia';
import type { TranslationKeys } from '../../i18n/translations';

const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

interface TriviaStatsHeroProps {
  stats: TriviaStats | null;
  isDark: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}

export function TriviaStatsHero({ stats, isDark, t }: TriviaStatsHeroProps) {
  const accuracy = stats?.accuracy ?? 0;
  const totalAnswered = stats?.totalAnswered ?? 0;
  const totalMastered = stats?.totalMastered ?? 0;
  
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const yellowColor = isDark ? tokens.color.dark.neonYellow : tokens.color.light.neonYellow;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const mutedColor = isDark ? tokens.color.dark.textMuted : tokens.color.light.textMuted;
  const surfaceBg = isDark ? tokens.color.dark.surface : tokens.color.light.surface;
  const borderColor = isDark ? tokens.color.dark.border : tokens.color.light.border;
  
  // Show muted colors when no data
  const hasData = totalAnswered > 0;
  const accuracyColor = hasData ? successColor : mutedColor;
  const answeredColor = hasData ? primaryColor : mutedColor;
  const masteredColor = hasData ? yellowColor : mutedColor;
  
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <XStack
        backgroundColor={surfaceBg}
        borderRadius={tokens.radius.md}
        borderWidth={1}
        borderColor={borderColor}
        paddingVertical={tokens.space.md}
        paddingHorizontal={tokens.space.sm}
      >
        {/* Accuracy */}
        <YStack 
          flex={1} 
          alignItems="center"
          paddingVertical={tokens.space.xs}
        >
          <XStack alignItems="center" gap={6}>
            <Target size={18} color={accuracyColor} />
            <Text
              fontSize={20}
              fontWeight="700"
              color={accuracyColor}
              fontFamily={FONT_FAMILIES.bold}
            >
              {accuracy}%
            </Text>
          </XStack>
          <Text fontSize={12} color={secondaryTextColor} marginTop={4}>
            {t('accuracy')}
          </Text>
        </YStack>
        
        {/* Divider */}
        <YStack width={1} backgroundColor={borderColor} marginVertical={tokens.space.xs} />
        
        {/* Answered */}
        <YStack 
          flex={1} 
          alignItems="center"
          paddingVertical={tokens.space.xs}
        >
          <XStack alignItems="center" gap={6}>
            <CheckCircle size={18} color={answeredColor} />
            <Text
              fontSize={20}
              fontWeight="700"
              color={answeredColor}
              fontFamily={FONT_FAMILIES.bold}
            >
              {totalAnswered}
            </Text>
          </XStack>
          <Text fontSize={12} color={secondaryTextColor} marginTop={4}>
            {t('answered')}
          </Text>
        </YStack>
        
        {/* Divider */}
        <YStack width={1} backgroundColor={borderColor} marginVertical={tokens.space.xs} />
        
        {/* Mastered */}
        <YStack 
          flex={1} 
          alignItems="center"
          paddingVertical={tokens.space.xs}
        >
          <XStack alignItems="center" gap={6}>
            <Award size={18} color={masteredColor} />
            <Text
              fontSize={20}
              fontWeight="700"
              color={masteredColor}
              fontFamily={FONT_FAMILIES.bold}
            >
              {totalMastered}
            </Text>
          </XStack>
          <Text fontSize={12} color={secondaryTextColor} marginTop={4}>
            {t('mastered')}
          </Text>
        </YStack>
      </XStack>
    </Animated.View>
  );
}

