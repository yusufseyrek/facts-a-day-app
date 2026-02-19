import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { ChevronRight } from '@tamagui/lucide-icons';
import { XStack, YStack } from 'tamagui';

import { hexColors } from '../../theme';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

import type { TranslationKeys } from '../../i18n/translations';
import type { CategoryWithProgress, TriviaStats } from '../../services/trivia';

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
  const _responsive = useResponsive();
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
      <YStack position="absolute" alignItems="center" justifyContent="center">
        <Text.Label fontFamily={FONT_FAMILIES.bold} color={textColor}>
          {percentage}%
        </Text.Label>
      </YStack>
    </YStack>
  );
}

export function TriviaStatsHero({
  stats,
  categories = [],
  isDark,
  t,
  onPress,
}: TriviaStatsHeroProps) {
  const { typography, iconSizes, spacing, radius, media, borderWidths } = useResponsive();
  const categoryIconSize = media.topicCardSize * 0.6;
  const dividerHeight = iconSizes.heroLg + spacing.sm;
  const accuracy = stats?.accuracy ?? 0;
  const testsTaken = stats?.testsTaken ?? 0;

  // Find top category by accuracy (only categories with answered questions)
  const topCategory =
    categories.length > 0
      ? categories
          .filter((c) => c.answered > 0) // Only categories with answered questions
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
  const progressColor = hasData
    ? primaryColor
    : isDark
      ? hexColors.dark.textMuted
      : hexColors.light.textMuted;

  // Category icon color
  const categoryColor =
    topCategory?.color_hex || (isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple);

  const cardContent = (
    <YStack
      padding={spacing.lg}
      gap={spacing.md}
    >
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <Text.Title color={textColor}>{t('yourPerformance')}</Text.Title>
        {hasData && (
          <XStack alignItems="center" gap={2}>
            <Text.Label color={primaryColor}>{t('details')}</Text.Label>
            <ChevronRight size={iconSizes.md} color={primaryColor} />
          </XStack>
        )}
      </XStack>

      {/* Stats Row or Empty State */}
      {hasData ? (
        <XStack alignItems="center" justifyContent="space-between" paddingTop={spacing.sm}>
          {/* Accuracy with circular progress */}
          <YStack flex={1} alignItems="center" gap={spacing.xs}>
            <CircularProgress
              percentage={accuracy}
              size={iconSizes.heroLg}
              strokeWidth={borderWidths.extraHeavy}
              progressColor={progressColor}
              trackColor={trackColor}
              textColor={textColor}
            />
            <Text.Tiny
              color={secondaryTextColor}
              textTransform="uppercase"
              marginTop={spacing.xs}
              fontFamily={FONT_FAMILIES.medium}
            >
              {t('accuracy')}
            </Text.Tiny>
          </YStack>

          {/* Vertical Divider */}
          <YStack width={1} height={dividerHeight} backgroundColor={borderColor} />

          {/* Tests Count */}
          <YStack flex={1} alignItems="center">
            <Text.Hero color={textColor}>{testsTaken}</Text.Hero>
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
          <YStack width={1} height={dividerHeight} backgroundColor={borderColor} />

          {/* Top Category */}
          <YStack flex={1} alignItems="center" gap={spacing.xs}>
            {topCategory ? (
              <>
                <YStack
                  width={categoryIconSize}
                  height={categoryIconSize}
                  borderRadius={categoryIconSize / 2}
                  backgroundColor={`${categoryColor}30`}
                  justifyContent="center"
                  alignItems="center"
                >
                  {getLucideIcon(topCategory.icon, typography.fontSize.title, categoryColor)}
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
                  width={categoryIconSize}
                  height={categoryIconSize}
                  borderRadius={categoryIconSize / 2}
                  backgroundColor={`${categoryColor}30`}
                  justifyContent="center"
                  alignItems="center"
                >
                  {getLucideIcon(
                    'help-circle',
                    typography.fontSize.title,
                    isDark ? hexColors.dark.textMuted : hexColors.light.textMuted
                  )}
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
        <YStack alignItems="center" justifyContent="center" paddingVertical={spacing.sm}>
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
          style={({ pressed }) => [
            heroShadowStyles.card,
            {
              backgroundColor: cardBg,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: borderColor,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          testID="trivia-stats-hero"
          accessibilityLabel={t('yourPerformance')}
        >
          {cardContent}
        </Pressable>
      ) : (
        <YStack
          backgroundColor={cardBg}
          borderRadius={radius.lg}
          borderWidth={1}
          borderColor={borderColor}
          style={heroShadowStyles.card}
        >
          {cardContent}
        </YStack>
      )}
    </Animated.View>
  );
}

const heroShadowStyles = StyleSheet.create({
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
});
