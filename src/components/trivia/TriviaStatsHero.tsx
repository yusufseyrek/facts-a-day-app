import { type ReactNode,useEffect } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
  children,
}: {
  percentage: number;
  size: number;
  strokeWidth: number;
  progressColor: string;
  trackColor: string;
  children?: ReactNode;
}) {
  const { spacing } = useResponsive();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(percentage, {
      duration: 700,
      reduceMotion: ReduceMotion.System,
    });
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
      {/* Center content, width-bound to the inner diameter (padding keeps it
          slightly off the stroke's inner edge) */}
      <YStack
        position="absolute"
        alignItems="center"
        justifyContent="center"
        width={size - strokeWidth * 2}
        paddingHorizontal={spacing.xs}
      >
        {children}
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
  const { typography, iconSizes, spacing, radius, borderWidths } = useResponsive();
  const accuracy = stats?.accuracy ?? 0;
  const testsTaken = stats?.testsTaken ?? 0;
  // currentStreak IS the daily play streak (getDailyStreak) — the same number
  // as the hub header's badge. It is labeled "Day Streak" so the duplication
  // reads as the same metric; the "Best: N" micro-line is the net-new info.
  const currentStreak = stats?.currentStreak ?? 0;
  const bestStreak = stats?.bestStreak ?? 0;
  const testsThisWeek = stats?.testsThisWeek ?? 0;
  const totalCorrect = stats?.totalCorrect ?? 0;
  const correctToday = stats?.correctToday ?? 0;

  // DORMANT: getCategoriesWithProgress currently zeroes `answered` for every
  // category (the local question mirror was removed), so topCategory is always
  // null and the strip's third column renders the Correct stat instead. When
  // per-category progress returns, the Top Cat. branch lights up automatically.
  const topCategory =
    categories.length > 0
      ? categories
          .filter((c) => c.answered > 0) // Only categories with answered questions
          .sort((a, b) => b.accuracy - a.accuracy)[0] || null // Sort by accuracy descending, take first
      : null;

  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const purpleColor = isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple;
  const textColor = isDark ? hexColors.dark.text : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const mutedTextColor = isDark ? hexColors.dark.textMuted : hexColors.light.textMuted;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const dividerColor = isDark ? hexColors.dark.border : hexColors.light.border;
  // Dimmed-primary track gives the unfilled ring an Apple-style "empty" read.
  const ringTrackColor = hexToRgba(primaryColor, isDark ? 0.18 : 0.12);

  const hasData = testsTaken > 0;

  // Category icon color
  const categoryColor = topCategory?.color_hex || purpleColor;

  // On iOS 26 the card goes transparent and Liquid Glass (tinted with the same
  // card color) shows through; the primary-tinted hairline stays in both modes
  // since it defines the card even before the glass material initializes.
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  const tinyLabelProps = {
    color: secondaryTextColor,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: FONT_FAMILIES.medium,
  } as const;

  const microLineProps = {
    fontFamily: FONT_FAMILIES.medium,
    numberOfLines: 1,
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
      <YStack padding={spacing.lg} gap={spacing.lg}>
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

        {hasData ? (
          <>
            {/* Focal accuracy ring */}
            <YStack alignItems="center">
              <CircularProgress
                percentage={accuracy}
                size={iconSizes.heroXl}
                strokeWidth={borderWidths.extraHeavy}
                progressColor={primaryColor}
                trackColor={ringTrackColor}
              >
                <XStack alignItems="baseline">
                  {/* adjustsFontSizeToFit bounds the 3-digit "100%" case inside
                      the ring's inner diameter at the display preset's max
                      font multiplier. */}
                  <Text.Display color={textColor} numberOfLines={1} adjustsFontSizeToFit>
                    {accuracy}
                  </Text.Display>
                  <Text.Caption fontFamily={FONT_FAMILIES.bold} color={secondaryTextColor}>
                    %
                  </Text.Caption>
                </XStack>
                <Text.Tiny {...tinyLabelProps} numberOfLines={1} adjustsFontSizeToFit>
                  {t('accuracy')}
                </Text.Tiny>
              </CircularProgress>
            </YStack>

            {/* Divider */}
            <YStack
              alignSelf="stretch"
              height={borderWidths.hairline}
              backgroundColor={dividerColor}
            />

            {/* Support strip: each column has a fixed-height value slot and an
                always-rendered micro line so the three columns stay level. */}
            <XStack gap={spacing.sm}>
              {/* Tests */}
              <YStack flex={1} alignItems="center" gap={spacing.xs}>
                <YStack
                  height={typography.lineHeight.title}
                  justifyContent="center"
                  alignItems="center"
                >
                  <Text.Title fontFamily={FONT_FAMILIES.bold} color={textColor} numberOfLines={1}>
                    {testsTaken}
                  </Text.Title>
                </YStack>
                <Text.Tiny
                  {...microLineProps}
                  color={testsThisWeek > 0 ? successColor : mutedTextColor}
                >
                  {t('thisWeek', { count: testsThisWeek })}
                </Text.Tiny>
                <Text.Tiny {...tinyLabelProps} numberOfLines={1}>
                  {t('quizzes')}
                </Text.Tiny>
              </YStack>

              {/* Day streak (muted at 0 as a dormant comeback cue) */}
              <YStack flex={1} alignItems="center" gap={spacing.xs}>
                <YStack
                  height={typography.lineHeight.title}
                  justifyContent="center"
                  alignItems="center"
                >
                  <Text.Title
                    fontFamily={FONT_FAMILIES.bold}
                    color={currentStreak > 0 ? textColor : mutedTextColor}
                    numberOfLines={1}
                  >
                    {currentStreak}
                  </Text.Title>
                </YStack>
                <Text.Tiny {...microLineProps} color={mutedTextColor}>
                  {t('best', { count: bestStreak })}
                </Text.Tiny>
                <Text.Tiny {...tinyLabelProps} numberOfLines={1}>
                  {t('dayStreak')}
                </Text.Tiny>
              </YStack>

              {/* Top category when available, otherwise total correct */}
              <YStack flex={1} alignItems="center" gap={spacing.xs}>
                {topCategory ? (
                  <>
                    <YStack
                      height={typography.lineHeight.title}
                      justifyContent="center"
                      alignItems="center"
                    >
                      <XStack alignItems="center" gap={spacing.xs} flexShrink={1}>
                        {getLucideIcon(topCategory.icon, iconSizes.xs, categoryColor)}
                        <Text.Caption
                          fontFamily={FONT_FAMILIES.semibold}
                          color={textColor}
                          numberOfLines={1}
                          flexShrink={1}
                        >
                          {topCategory.name}
                        </Text.Caption>
                      </XStack>
                    </YStack>
                    <Text.Tiny {...microLineProps} color={mutedTextColor}>
                      {`${topCategory.accuracy}%`}
                    </Text.Tiny>
                    <Text.Tiny {...tinyLabelProps} numberOfLines={1}>
                      {t('topCat')}
                    </Text.Tiny>
                  </>
                ) : (
                  <>
                    <YStack
                      height={typography.lineHeight.title}
                      justifyContent="center"
                      alignItems="center"
                    >
                      <Text.Title
                        fontFamily={FONT_FAMILIES.bold}
                        color={textColor}
                        numberOfLines={1}
                      >
                        {totalCorrect}
                      </Text.Title>
                    </YStack>
                    <Text.Tiny
                      {...microLineProps}
                      color={correctToday > 0 ? successColor : mutedTextColor}
                    >
                      {t('todayCount', { count: correctToday })}
                    </Text.Tiny>
                    <Text.Tiny {...tinyLabelProps} numberOfLines={1}>
                      {t('correct')}
                    </Text.Tiny>
                  </>
                )}
              </YStack>
            </XStack>
          </>
        ) : (
          /* Empty state: the 0% ring renders track-only, previewing the filled
             geometry with the Target icon in the center. */
          <YStack alignItems="center" gap={spacing.sm} paddingVertical={spacing.sm}>
            <CircularProgress
              percentage={0}
              size={iconSizes.heroXl}
              strokeWidth={borderWidths.extraHeavy}
              progressColor={primaryColor}
              trackColor={ringTrackColor}
            >
              <Target size={iconSizes.lg} color={primaryColor} />
            </CircularProgress>
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
