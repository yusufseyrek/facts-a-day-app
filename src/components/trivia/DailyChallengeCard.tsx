import React from 'react';
import { Pressable } from 'react-native';
import { YStack, XStack } from 'tamagui';
import { Zap, Check, ChevronRight } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
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
  const { typography: typo } = useResponsive();
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
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
          opacity: pressed && !isCompleted ? 0.8 : 1,
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
            width={44}
            height={44}
            borderRadius={22}
            backgroundColor={isCompleted ? successColor : primaryColor}
            justifyContent="center"
            alignItems="center"
          >
            {isCompleted ? (
              <Check size={22} color="#FFFFFF" />
            ) : (
              <Zap size={22} color="#FFFFFF" />
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
            <ChevronRight size={20} color={secondaryTextColor} />
          )}
        </XStack>
      </Pressable>
    </Animated.View>
  );
}

