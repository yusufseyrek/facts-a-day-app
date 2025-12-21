import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { Zap, Check, ChevronRight, Flame } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import type { TranslationKeys } from '../../i18n/translations';

const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

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
  streak,
  isDark,
  onPress,
  t,
}: DailyChallengeCardProps) {
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const orangeColor = isDark ? tokens.color.dark.neonOrange : tokens.color.light.neonOrange;
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const borderColor = isDark ? tokens.color.dark.border : tokens.color.light.border;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  
  return (
    <Animated.View entering={FadeIn.duration(300).delay(100)}>
      <Pressable
        onPress={onPress}
        disabled={isCompleted}
        style={({ pressed }) => ({
          opacity: pressed && !isCompleted ? 0.7 : 1,
        })}
      >
        <XStack
          backgroundColor={cardBg}
          padding={tokens.space.lg}
          borderRadius={tokens.radius.md}
          borderWidth={1}
          borderColor={isCompleted ? successColor : borderColor}
          alignItems="center"
          gap={tokens.space.md}
        >
          {/* Icon */}
          <YStack
            width={40}
            height={40}
            borderRadius={20}
            backgroundColor={isCompleted ? successColor : primaryColor}
            justifyContent="center"
            alignItems="center"
          >
            {isCompleted ? (
              <Check size={20} color="#FFFFFF" />
            ) : (
              <Zap size={20} color="#FFFFFF" />
            )}
          </YStack>
          
          {/* Content */}
          <YStack flex={1}>
            <Text
              fontSize={16}
              fontWeight="600"
              color={textColor}
              fontFamily={FONT_FAMILIES.semibold}
            >
              {t('dailyQuiz')}
            </Text>
            <Text fontSize={13} color={secondaryTextColor} marginTop={2}>
              {isCompleted
                ? t('dailyQuizCompleted')
                : t('dailyQuizQuestions', { count: questionsCount })}
            </Text>
          </YStack>
          
          {/* Right side */}
          {streak > 0 && (
            <XStack alignItems="center" gap={4}>
              <Flame size={16} color={orangeColor} />
              <Text fontSize={14} fontWeight="600" color={orangeColor}>
                {streak}
              </Text>
            </XStack>
          )}
          
          {!isCompleted && (
            <ChevronRight size={20} color={secondaryTextColor} />
          )}
        </XStack>
      </Pressable>
    </Animated.View>
  );
}
