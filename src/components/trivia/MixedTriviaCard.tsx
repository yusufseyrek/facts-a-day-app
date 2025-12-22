import React from 'react';
import { Pressable } from 'react-native';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { Shuffle, ChevronRight } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import type { TranslationKeys } from '../../i18n/translations';

const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

interface MixedTriviaCardProps {
  questionsCount: number;
  isDark: boolean;
  onPress: () => void;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}

export function MixedTriviaCard({
  questionsCount,
  isDark,
  onPress,
  t,
}: MixedTriviaCardProps) {
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const borderColor = isDark ? tokens.color.dark.border : tokens.color.light.border;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const purpleColor = isDark ? tokens.color.dark.neonPurple : tokens.color.light.neonPurple;
  
  const isDisabled = questionsCount === 0;
  
  return (
    <Animated.View entering={FadeIn.duration(300).delay(150)}>
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => ({
          opacity: pressed && !isDisabled ? 0.8 : isDisabled ? 0.5 : 1,
        })}
      >
        <XStack
          backgroundColor={cardBg}
          padding={tokens.space.lg}
          borderRadius={tokens.radius.md}
          borderWidth={1}
          borderColor={borderColor}
          alignItems="center"
          gap={tokens.space.md}
        >
          {/* Icon */}
          <YStack
            width={44}
            height={44}
            borderRadius={22}
            backgroundColor={purpleColor}
            justifyContent="center"
            alignItems="center"
          >
            <Shuffle size={22} color="#FFFFFF" />
          </YStack>
          
          {/* Content */}
          <YStack flex={1}>
            <Text
              fontSize={16}
              fontWeight="600"
              color={textColor}
              fontFamily={FONT_FAMILIES.semibold}
            >
              {t('mixedTrivia')}
            </Text>
            <Text fontSize={13} color={secondaryTextColor} marginTop={2}>
              {isDisabled
                ? t('noMixedQuestions')
                : t('mixedTriviaQuestions', { count: Math.min(questionsCount, 10) })}
            </Text>
          </YStack>
          
          {!isDisabled && (
            <ChevronRight size={20} color={secondaryTextColor} />
          )}
        </XStack>
      </Pressable>
    </Animated.View>
  );
}

