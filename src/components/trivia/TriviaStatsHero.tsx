import React from 'react';
import { Pressable } from 'react-native';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { ChevronRight } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import { getLucideIcon } from '../../utils/iconMapper';
import type { TriviaStats, CategoryWithProgress } from '../../services/trivia';
import type { TranslationKeys } from '../../i18n/translations';

const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

interface TriviaStatsHeroProps {
  stats: TriviaStats | null;
  categories?: CategoryWithProgress[];
  isDark: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
  onPress?: () => void;
}

// Circular progress ring component
function CircularProgress({ 
  percentage, 
  size, 
  strokeWidth, 
  progressColor, 
  trackColor,
  textColor,
}: { 
  percentage: number;
  size: number;
  strokeWidth: number;
  progressColor: string;
  trackColor: string;
  textColor: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const center = size / 2;

  return (
    <YStack alignItems="center" justifyContent="center">
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      {/* Percentage text in center */}
      <YStack 
        position="absolute" 
        alignItems="center" 
        justifyContent="center"
      >
        <Text
          fontSize={16}
          fontFamily={FONT_FAMILIES.bold}
          color={textColor}
        >
          {percentage}%
        </Text>
      </YStack>
    </YStack>
  );
}

export function TriviaStatsHero({ stats, categories = [], isDark, t, onPress }: TriviaStatsHeroProps) {
  const accuracy = stats?.accuracy ?? 0;
  const testsTaken = stats?.testsTaken ?? 0;
  
  // Find top category (by answered count, then by accuracy)
  const topCategory = categories.length > 0 
    ? categories.reduce((prev, current) => 
        (current.answered > prev.answered) || 
        (current.answered === prev.answered && current.accuracy > prev.accuracy)
          ? current 
          : prev
      )
    : null;
  
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const borderColor = isDark ? tokens.color.dark.border : tokens.color.light.border;
  const trackColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  
  // Show muted colors when no data
  const hasData = testsTaken > 0;
  const progressColor = hasData ? primaryColor : (isDark ? tokens.color.dark.textMuted : tokens.color.light.textMuted);
  
  // Category icon color
  const categoryColor = topCategory?.color_hex || (isDark ? tokens.color.dark.neonPurple : tokens.color.light.neonPurple);
  
  const cardContent = (
    <YStack
      backgroundColor={cardBg}
      borderRadius={tokens.radius.lg}
      padding={tokens.space.lg}
      gap={tokens.space.md}
      borderWidth={1}
      borderColor={borderColor}
    >
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <Text
          fontSize={18}
          fontFamily={FONT_FAMILIES.bold}
          color={textColor}
        >
          {t('yourPerformance')}
        </Text>
        {hasData && (
          <XStack alignItems="center" gap={2}>
            <Text
              fontSize={14}
              fontFamily={FONT_FAMILIES.medium}
              color={primaryColor}
            >
              {t('details')}
            </Text>
            <ChevronRight size={18} color={primaryColor} />
          </XStack>
        )}
      </XStack>

      {/* Stats Row or Empty State */}
      {hasData ? (
        <XStack 
          alignItems="center" 
          justifyContent="space-between"
          paddingTop={tokens.space.sm}
        >
          {/* Accuracy with circular progress */}
          <YStack 
            flex={1}
            alignItems="center"
            gap={tokens.space.xs}
          >
            <CircularProgress
              percentage={accuracy}
              size={65}
              strokeWidth={6}
              progressColor={progressColor}
              trackColor={trackColor}
              textColor={textColor}
            />
            <Text 
              fontSize={11}
              color={secondaryTextColor} 
              textTransform="uppercase"
              letterSpacing={0.5}
              marginTop={tokens.space.xs}
              fontFamily={FONT_FAMILIES.medium}
            >
              {t('accuracy')}
            </Text>
          </YStack>
          
          {/* Vertical Divider */}
          <YStack 
            width={1} 
            height={70} 
            backgroundColor={borderColor} 
          />
          
          {/* Tests Count */}
          <YStack 
            flex={1}
            alignItems="center"
            gap={tokens.space.xs}
          >
            <Text
              fontSize={36}
              fontFamily={FONT_FAMILIES.bold}
              color={textColor}
            >
              {testsTaken}
            </Text>
            <Text 
              fontSize={11} 
              color={secondaryTextColor} 
              textTransform="uppercase"
              letterSpacing={0.5}
              fontFamily={FONT_FAMILIES.medium}
            >
              {t('quizzes')}
            </Text>
          </YStack>
          
          {/* Vertical Divider */}
          <YStack 
            width={1} 
            height={70} 
            backgroundColor={borderColor} 
          />
          
          {/* Top Category */}
          <YStack 
            flex={1}
            alignItems="center"
            gap={tokens.space.xs}
          >
            {topCategory ? (
              <>
                <YStack
                  width={48}
                  height={48}
                  borderRadius={24}
                  backgroundColor={`${categoryColor}30`}
                  justifyContent="center"
                  alignItems="center"
                >
                  {getLucideIcon(topCategory.icon, 24, categoryColor)}
                </YStack>
                <Text
                  fontSize={13}
                  fontFamily={FONT_FAMILIES.semibold}
                  
                  color={textColor}
                  numberOfLines={1}
                  textAlign="center"
                >
                  {topCategory.name}
                </Text>
                <Text 
                  fontSize={11} 
                  color={secondaryTextColor} 
                  textTransform="uppercase"
                  letterSpacing={0.5}
                  fontFamily={FONT_FAMILIES.medium}
                >
                  {t('topCat')}
                </Text>
              </>
            ) : (
              <>
                <YStack
                  width={48}
                  height={48}
                  borderRadius={24}
                  backgroundColor={`${categoryColor}30`}
                  justifyContent="center"
                  alignItems="center"
                >
                  {getLucideIcon('help-circle', 24, isDark ? tokens.color.dark.textMuted : tokens.color.light.textMuted)}
                </YStack>
                <Text
                  fontSize={13}
                  fontFamily={FONT_FAMILIES.semibold}
                  color={isDark ? tokens.color.dark.textMuted : tokens.color.light.textMuted}
                  numberOfLines={1}
                  textAlign="center"
                >
                  —
                </Text>
                <Text 
                  fontSize={11} 
                  color={secondaryTextColor} 
                  textTransform="uppercase"
                  letterSpacing={0.5}
                  fontFamily={FONT_FAMILIES.medium}
                  marginTop={-4}
                >
                  {t('topCat')}
                </Text>
              </>
            )}
          </YStack>
        </XStack>
      ) : (
        <YStack 
          alignItems="center" 
          justifyContent="center"
          paddingVertical={tokens.space.sm}
        >
          <Text
            fontSize={16}
            color={secondaryTextColor}
            textAlign="center"
            fontFamily={FONT_FAMILIES.semibold}
          >
            {t('noTestsYet')}
          </Text>
        </YStack>
      )}
    </YStack>
  );

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      {hasData ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {cardContent}
        </Pressable>
      ) : (
        cardContent
      )}
    </Animated.View>
  );
}
