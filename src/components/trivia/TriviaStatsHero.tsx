import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { ChevronRight, Target } from '@tamagui/lucide-icons';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { XStack, YStack } from 'tamagui';

import { hexColors } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { getLucideIcon } from '../../utils/iconMapper';
import { absoluteFillObject } from '../../utils/styles';
import { useResponsive } from '../../utils/useResponsive';
import { GlassSurface } from '../GlassSurface';
import { FONT_FAMILIES, Text } from '../Typography';

import type { TranslationKeys } from '../../i18n/translations';
import type { CategoryWithProgress, TriviaStats } from '../../services/trivia';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
  const center = size / 2;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(percentage, { duration: 700 });
  }, [percentage, progress]);

  // Only strokeDashoffset animates; strokeDasharray stays a plain prop so the
  // arc length geometry never re-renders.
  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - (progress.value / 100) * circumference,
  }));

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
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedRingProps}
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      {/* Percentage text in center */}
      <YStack position="absolute" alignItems="center" justifyContent="center">
        <Text.Label flex={1} fontFamily={FONT_FAMILIES.bold} color={textColor}>
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
  const purpleColor = isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const trackColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';

  const hasData = testsTaken > 0;

  // Category icon color
  const categoryColor = topCategory?.color_hex || purpleColor;

  // On iOS 26 the card goes transparent and Liquid Glass (tinted with the same
  // card color) shows through; the primary-tinted hairline stays in both modes
  // since it defines the card even before the glass material initializes.
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  // Tinted stat-cell grammar (HeroTile): low-alpha fill so iOS 26 glass still
  // reads through, accent hairline, centered content.
  const statCellProps = (accent: string) =>
    ({
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: hexToRgba(accent, isDark ? 0.14 : 0.08),
      borderRadius: radius.lg,
      borderWidth: borderWidths.hairline,
      borderColor: `${accent}30`,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    }) as const;

  const tinyLabelProps = {
    color: secondaryTextColor,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: FONT_FAMILIES.medium,
  } as const;

  return (
    <Pressable
      onPress={onPress}
      disabled={!hasData}
      style={({ pressed }) => [
        heroShadowStyles.card,
        {
          backgroundColor: useGlass ? 'transparent' : cardBg,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: hexToRgba(primaryColor, isDark ? 0.35 : 0.25),
          shadowColor: primaryColor,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        useGlass && { overflow: 'hidden' as const },
      ]}
      testID="trivia-stats-hero"
      accessibilityLabel={t('yourPerformance')}
    >
      {useGlass && (
        <GlassSurface
          variant="glass"
          isDark={isDark}
          tint={cardBg}
          glassTint={hexToRgba(cardBg, isDark ? 0.6 : 0.65)}
          borderRadius={radius.xl}
          style={absoluteFillObject}
        />
      )}
      <YStack padding={spacing.lg} gap={spacing.md}>
        {/* Header */}
        <XStack justifyContent="space-between" alignItems="center">
          <Text.Title flex={1} color={textColor}>
            {t('yourPerformance')}
          </Text.Title>
          {hasData && (
            <XStack
              alignItems="center"
              gap={2}
              paddingHorizontal={spacing.sm}
              paddingVertical={spacing.xs}
              borderRadius={radius.full}
              backgroundColor={hexToRgba(primaryColor, isDark ? 0.18 : 0.1)}
            >
              <Text.Label color={primaryColor}>{t('details')}</Text.Label>
              <ChevronRight size={iconSizes.md} color={primaryColor} />
            </XStack>
          )}
        </XStack>

        {/* Stats Row or Empty State */}
        {hasData ? (
          <XStack gap={spacing.sm}>
            {/* Accuracy with circular progress */}
            <YStack {...statCellProps(primaryColor)}>
              <CircularProgress
                percentage={accuracy}
                size={iconSizes.heroLg}
                strokeWidth={borderWidths.extraHeavy}
                progressColor={primaryColor}
                trackColor={trackColor}
                textColor={textColor}
              />
              <Text.Tiny {...tinyLabelProps}>{t('accuracy')}</Text.Tiny>
            </YStack>

            {/* Tests Count */}
            <YStack {...statCellProps(purpleColor)}>
              <Text.Hero color={textColor}>{testsTaken}</Text.Hero>
              <Text.Tiny {...tinyLabelProps}>{t('quizzes')}</Text.Tiny>
            </YStack>

            {/* Top Category */}
            <YStack {...statCellProps(categoryColor)}>
              <YStack
                width={categoryIconSize}
                height={categoryIconSize}
                borderRadius={categoryIconSize / 2}
                backgroundColor={hexToRgba(categoryColor, isDark ? 0.18 : 0.12)}
                justifyContent="center"
                alignItems="center"
              >
                {topCategory
                  ? getLucideIcon(topCategory.icon, typography.fontSize.title, categoryColor)
                  : getLucideIcon(
                      'help-circle',
                      typography.fontSize.title,
                      isDark ? hexColors.dark.textMuted : hexColors.light.textMuted
                    )}
              </YStack>
              <Text.Caption
                fontFamily={FONT_FAMILIES.semibold}
                color={
                  topCategory
                    ? textColor
                    : isDark
                      ? hexColors.dark.textMuted
                      : hexColors.light.textMuted
                }
                numberOfLines={1}
                textAlign="center"
              >
                {topCategory ? topCategory.name : '—'}
              </Text.Caption>
              <Text.Tiny {...tinyLabelProps}>{t('topCat')}</Text.Tiny>
            </YStack>
          </XStack>
        ) : (
          <YStack
            alignItems="center"
            justifyContent="center"
            gap={spacing.sm}
            paddingVertical={spacing.sm}
          >
            <YStack
              width={categoryIconSize}
              height={categoryIconSize}
              borderRadius={categoryIconSize / 2}
              backgroundColor={hexToRgba(primaryColor, isDark ? 0.18 : 0.12)}
              justifyContent="center"
              alignItems="center"
            >
              <Target size={typography.fontSize.title} color={primaryColor} />
            </YStack>
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
    </Pressable>
  );
}

const heroShadowStyles = StyleSheet.create({
  card: {
    // shadowColor is overridden inline with the primary accent for a faint glow.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
});
