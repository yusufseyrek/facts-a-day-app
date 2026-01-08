import React from 'react';
import { Pressable } from 'react-native';
import { YStack, XStack } from 'tamagui';
import { Zap, Check, ChevronRight } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { hexColors, spacing, radius } from '../../theme';
import { Text, FONT_FAMILIES } from '../Typography';
import { useResponsive } from '../../utils/useResponsive';
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
  const { typography: typo, iconSizes } = useResponsive();
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  
  return (
    <Animated.View entering={FadeIn.duration(300).delay(100)}>
      <Pressable
        onPress={onPress}
        disabled={isCompleted}
        style={({ pressed }) => ({
          opacity: pressed && !isCompleted ? 0.8 : 1,
        })}
      >
        <XStack
          backgroundColor={cardBg}
          padding={spacing.phone.lg}
          borderRadius={radius.phone.md}
          borderWidth={1}
          borderColor={isCompleted ? successColor : borderColor}
          alignItems="center"
          gap={spacing.phone.md}
        >
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
            <Text.Label
              fontFamily={FONT_FAMILIES.semibold}
              color={textColor}
            >
              {t('dailyTrivia')}
            </Text.Label>
            <Text.Caption color={secondaryTextColor} marginTop={2}>
              {isCompleted
                ? t('dailyTriviaCompleted')
                : t('dailyTriviaQuestions', { count: questionsCount })}
            </Text.Caption>
          </YStack>
          
          {!isCompleted && (
            <ChevronRight size={iconSizes.md} color={secondaryTextColor} />
          )}
        </XStack>
      </Pressable>
    </Animated.View>
  );
}

