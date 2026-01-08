import React from 'react';
import { Pressable } from 'react-native';
import { YStack, XStack } from 'tamagui';
import { ChevronRight } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { hexColors, spacing, radius } from '../../theme';
import { Text, FONT_FAMILIES } from '../Typography';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';
import type { TriviaStats, CategoryWithProgress } from '../../services/trivia';
import type { TranslationKeys } from '../../i18n/translations';

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
  const { typography: typo, iconSizes } = useResponsive();
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
        <Text.Label
          fontFamily={FONT_FAMILIES.bold}
          color={textColor}
        >
          {percentage}%
        </Text.Label>
      </YStack>
    </YStack>
  );
}

export function TriviaStatsHero({ stats, categories = [], isDark, t, onPress }: TriviaStatsHeroProps) {
  const { typography: typo, iconSizes } = useResponsive();
  const accuracy = stats?.accuracy ?? 0;
  const testsTaken = stats?.testsTaken ?? 0;
  
  // Find top category by accuracy (only categories with answered questions)
  const topCategory = categories.length > 0 
    ? categories
        .filter(c => c.answered > 0) // Only categories with answered questions
        .sort((a, b) => b.accuracy - a.accuracy)[0] || null // Sort by accuracy descending, take first
    : null;
  
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const trackColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  
  // Show muted colors when no data
  const hasData = testsTaken > 0;
  const progressColor = hasData ? primaryColor : (isDark ? hexColors.dark.textMuted : hexColors.light.textMuted);
  
  // Category icon color
  const categoryColor = topCategory?.color_hex || (isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple);
  
  const cardContent = (
    <YStack
      backgroundColor={cardBg}
      borderRadius={radius.phone.lg}
      padding={spacing.phone.lg}
      gap={spacing.phone.md}
      borderWidth={1}
      borderColor={borderColor}
    >
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <Text.Title
          color={textColor}
        >
          {t('yourPerformance')}
        </Text.Title>
        {hasData && (
          <XStack alignItems="center" gap={2}>
            <Text.Caption
              fontFamily={FONT_FAMILIES.medium}
              color={primaryColor}
            >
              {t('details')}
            </Text.Caption>
            <ChevronRight size={typo.fontSize.title} color={primaryColor} />
          </XStack>
        )}
      </XStack>

      {/* Stats Row or Empty State */}
      {hasData ? (
        <XStack 
          alignItems="center" 
          justifyContent="space-between"
          paddingTop={spacing.phone.sm}
        >
          {/* Accuracy with circular progress */}
          <YStack 
            flex={1}
            alignItems="center"
            gap={spacing.phone.xs}
          >
            <CircularProgress
              percentage={accuracy}
              size={iconSizes.heroLg}
              strokeWidth={6}
              progressColor={progressColor}
              trackColor={trackColor}
              textColor={textColor}
            />
            <Text.Tiny 
              color={secondaryTextColor} 
              textTransform="uppercase"
              letterSpacing={0.5}
              marginTop={spacing.phone.xs}
              fontFamily={FONT_FAMILIES.medium}
            >
              {t('accuracy')}
            </Text.Tiny>
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
            gap={spacing.phone.xs}
          >
            <Text.Headline
              color={textColor}
            >
              {testsTaken}
            </Text.Headline>
            <Text.Tiny 
              color={secondaryTextColor} 
              textTransform="uppercase"
              letterSpacing={0.5}
              fontFamily={FONT_FAMILIES.medium}
            >
              {t('quizzes')}
            </Text.Tiny>
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
            gap={spacing.phone.xs}
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
                  {getLucideIcon(topCategory.icon, typo.fontSize.title, categoryColor)}
                </YStack>
                <Text.Caption
                  fontFamily={FONT_FAMILIES.semibold}
                  color={textColor}
                  numberOfLines={1}
                  textAlign="center"
                >
                  {topCategory.name}
                </Text.Caption>
                <Text.Tiny 
                  color={secondaryTextColor} 
                  textTransform="uppercase"
                  letterSpacing={0.5}
                  fontFamily={FONT_FAMILIES.medium}
                >
                  {t('topCat')}
                </Text.Tiny>
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
                  {getLucideIcon('help-circle', typo.fontSize.title, isDark ? hexColors.dark.textMuted : hexColors.light.textMuted)}
                </YStack>
                <Text.Caption
                  fontFamily={FONT_FAMILIES.semibold}
                  color={isDark ? hexColors.dark.textMuted : hexColors.light.textMuted}
                  numberOfLines={1}
                  textAlign="center"
                >
                  —
                </Text.Caption>
                <Text.Tiny 
                  color={secondaryTextColor} 
                  textTransform="uppercase"
                  letterSpacing={0.5}
                  fontFamily={FONT_FAMILIES.medium}
                  marginTop={-4}
                >
                  {t('topCat')}
                </Text.Tiny>
              </>
            )}
          </YStack>
        </XStack>
      ) : (
        <YStack 
          alignItems="center" 
          justifyContent="center"
          paddingVertical={spacing.phone.sm}
        >
          <Text.Label
            color={secondaryTextColor}
            textAlign="center"
            fontFamily={FONT_FAMILIES.semibold}
          >
            {t('noTestsYet')}
          </Text.Label>
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
          testID="trivia-stats-hero"
          accessibilityLabel={t('yourPerformance')}
        >
          {cardContent}
        </Pressable>
      ) : (
        cardContent
      )}
    </Animated.View>
  );
}
