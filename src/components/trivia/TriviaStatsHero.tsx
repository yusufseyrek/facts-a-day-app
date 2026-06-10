import { type ReactNode, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Check, ChevronRight, Flame, Target, Zap } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { XStack, YStack } from 'tamagui';

import { hexColors } from '../../theme';
import { blendHexColors, darkenColor, getContrastColor } from '../../utils/colors';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';
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
        {/* Progress arc. Skipped entirely at 0%: a zero-length dash with a
            round linecap still paints a cap dot at 12 o'clock. */}
        {percentage > 0 && (
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
        )}
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

// One stat line of the support column: frosted icon plate + fixed value slot
// + label/micro stack.
function StatRow({
  icon,
  plateBg,
  value,
  label,
  micro,
  microActive,
  valueMuted = false,
  contrastColor,
  valueSlotWidth,
}: {
  icon: ReactNode;
  plateBg: string;
  value: number;
  label: string;
  micro: string;
  microActive: boolean;
  valueMuted?: boolean;
  contrastColor: string;
  valueSlotWidth: number;
}) {
  const { typography, iconSizes, spacing } = useResponsive();
  return (
    <XStack alignItems="center" gap={spacing.sm}>
      {/* Frosted plate, half-size sibling of the grid cards' icon plates */}
      <YStack
        width={iconSizes.xl}
        height={iconSizes.xl}
        borderRadius={iconSizes.xl / 2}
        backgroundColor={plateBg}
        justifyContent="center"
        alignItems="center"
      >
        {icon}
      </YStack>
      {/* Fixed slot: shared width keeps the label column aligned across rows
          at any digit count; fixed height keeps rows level at one title line.
          Right-aligned so the digits share a common edge against the labels. */}
      <YStack
        minWidth={valueSlotWidth}
        height={typography.lineHeight.title}
        justifyContent="center"
        alignItems="flex-end"
      >
        <Text.Title
          fontFamily={FONT_FAMILIES.bold}
          color={contrastColor}
          opacity={valueMuted ? 0.55 : 1}
          numberOfLines={1}
        >
          {value}
        </Text.Title>
      </YStack>
      <YStack flex={1} justifyContent="center">
        <Text.Tiny
          color={contrastColor}
          opacity={0.78}
          textTransform="uppercase"
          letterSpacing={0.5}
          fontFamily={FONT_FAMILIES.medium}
          numberOfLines={1}
        >
          {label}
        </Text.Tiny>
        {/* Live deltas use the monochrome ramp: 0.9 active / 0.55 inactive
            (labels sit at 0.78 between them). No success-green on the
            gradient: light-mode #10B981 on #0077A8 is near-invisible. */}
        <Text.Tiny
          color={contrastColor}
          opacity={microActive ? 0.9 : 0.55}
          fontFamily={FONT_FAMILIES.medium}
          numberOfLines={1}
          flexShrink={1}
        >
          {micro}
        </Text.Tiny>
      </YStack>
    </XStack>
  );
}

export function TriviaStatsHero({
  stats,
  categories = [],
  isDark,
  t,
  onPress,
}: TriviaStatsHeroProps) {
  const { typography, iconSizes, spacing, radius, borderWidths, media } = useResponsive();
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
  // null and the strip's third row renders the Correct stat instead. When
  // per-category progress returns, the Top Cat. branch lights up automatically.
  const topCategory =
    categories.length > 0
      ? categories
          .filter((c) => c.answered > 0) // Only categories with answered questions
          .sort((a, b) => b.accuracy - a.accuracy)[0] || null // Sort by accuracy descending, take first
      : null;

  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const purpleColor = isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple;
  // The gradient bridges the two flagship mode hues sitting directly below
  // this card: daily (primary) top-left into mixed (neonPurple) bottom-right.
  // LOAD-BEARING: the purple stop MUST stay darkened by 0.22. Raw dark-mode
  // neonPurple #A855F7 (luminance 0.503) flips getContrastColor to BLACK while
  // the cyan end stays white; darkenColor keeps BOTH ends white-contrast in
  // BOTH themes, and reproduces the grid cards' [accent, darken(accent, 0.22)]
  // depth cue. Do not "simplify" this back to the raw hue.
  const gradientEnd = darkenColor(purpleColor, 0.22);
  // Both gradient ends verified to agree on contrast in both themes.
  const contrastColor = getContrastColor(primaryColor);
  const onDark = contrastColor === '#FFFFFF';
  // Signature alphas from TriviaGridCard, branched in case a future palette
  // swap flips the contrast to black.
  const plateBg = onDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)';
  const circleA = onDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const circleB = onDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)';
  // Glow bridges both hues instead of doubling the daily card's primary glow
  // sitting directly below the hero's left edge.
  const glowColor = blendHexColors(primaryColor, purpleColor, 0.5);

  const hasData = testsTaken > 0;

  // Deco-circle driver: identical to TriviaGridCard's iconContainerSize so the
  // corner texture matches the grid tiles.
  const s = media.topicCardSize * 0.7;
  // Shared value-slot width: Montserrat Bold digits ≈ 0.62em; 0.65 adds safety.
  // All three rows share it, so a 4-digit value cannot break alignment.
  const valueDigits = Math.max(
    String(testsTaken).length,
    String(currentStreak).length,
    String(totalCorrect).length
  );
  const valueSlotWidth = Math.max(
    iconSizes.xxl,
    Math.ceil(valueDigits * typography.fontSize.title * 0.65)
  );

  const tinyLabelProps = {
    color: contrastColor,
    opacity: 0.78,
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
          borderRadius: radius.xl,
          shadowColor: glowColor,
          // Empty state renders at full opacity with no press transform:
          // informative, not actionable — never dimmed like a disabled control.
          opacity: pressed && hasData ? 0.9 : 1,
          transform: [{ scale: pressed && hasData ? 0.97 : 1 }],
        },
      ]}
      testID="trivia-stats-hero"
      accessibilityLabel={t('yourPerformance')}
    >
      <LinearGradient
        colors={[primaryColor, gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.xl, overflow: 'hidden' }}
      >
        {/* Layered decorative circles for depth (grid-card geometry). The
            bottom-left circle passes faintly behind the ring track; accepted
            for signature fidelity (tuning knob: 1.4 -> 1.15 size multiplier). */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -s * 0.6,
            right: -s * 0.5,
            width: s * 1.8,
            height: s * 1.8,
            borderRadius: s * 0.9,
            backgroundColor: circleA,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: -s * 0.7,
            left: -s * 0.4,
            width: s * 1.4,
            height: s * 1.4,
            borderRadius: s * 0.7,
            backgroundColor: circleB,
          }}
        />
        <YStack padding={spacing.lg} gap={spacing.md}>
          {/* Header row: full Title size so the card title owns the
              hierarchy; the Details pill stays a quiet Caption-sized control. */}
          <XStack justifyContent="space-between" alignItems="center">
            <Text.Title flex={1} color={contrastColor} numberOfLines={1}>
              {t('yourPerformance')}
            </Text.Title>
            {hasData && (
              /* Frosted pill: same contrast-plate alpha the grid cards use for
                 their icon plates, so the affordance reads as a real button. */
              <XStack
                alignItems="center"
                gap={2}
                paddingHorizontal={spacing.sm}
                paddingVertical={spacing.xs}
                borderRadius={radius.full}
                backgroundColor={plateBg}
              >
                <Text.Caption fontFamily={FONT_FAMILIES.semibold} color={contrastColor}>
                  {t('details')}
                </Text.Caption>
                <ChevronRight size={iconSizes.sm} color={contrastColor} opacity={0.78} />
              </XStack>
            )}
          </XStack>

          {/* Body row — one skeleton for filled and empty so the empty state
              previews the filled geometry and cannot drift out of sync. */}
          <XStack alignItems="center" gap={spacing.lg}>
            {/* Ring column: number stays full Display size (a 0-100 value plus
                % fits the 84pt inner diameter without auto-shrinking — iOS
                collapses adjustsFontSizeToFit text inside flex rows); the
                label sits under the ring where it has the full column width. */}
            <YStack alignItems="center" gap={spacing.xs}>
              <CircularProgress
                percentage={hasData ? accuracy : 0}
                size={iconSizes.heroXl}
                strokeWidth={borderWidths.extraHeavy}
                progressColor={contrastColor}
                trackColor={plateBg}
              >
                {hasData ? (
                  <XStack alignItems="baseline">
                    <Text.Display color={contrastColor} numberOfLines={1}>
                      {accuracy}
                    </Text.Display>
                    <Text.Caption
                      fontFamily={FONT_FAMILIES.bold}
                      color={contrastColor}
                      opacity={0.78}
                    >
                      %
                    </Text.Caption>
                  </XStack>
                ) : (
                  <Target size={iconSizes.lg} color={contrastColor} />
                )}
              </CircularProgress>
              {hasData && (
                <Text.Tiny {...tinyLabelProps} numberOfLines={1}>
                  {t('accuracy')}
                </Text.Tiny>
              )}
            </YStack>

            {hasData ? (
              <YStack flex={1} gap={spacing.sm}>
                <StatRow
                  icon={<Zap size={iconSizes.xs} color={contrastColor} />}
                  plateBg={plateBg}
                  value={testsTaken}
                  label={t('quizzes')}
                  micro={t('thisWeek', { count: testsThisWeek })}
                  microActive={testsThisWeek > 0}
                  contrastColor={contrastColor}
                  valueSlotWidth={valueSlotWidth}
                />
                {/* Streak value muted at 0 as a dormant comeback cue; the Best
                    micro line is always inactive (reference, not a delta). */}
                <StatRow
                  icon={<Flame size={iconSizes.xs} color={contrastColor} />}
                  plateBg={plateBg}
                  value={currentStreak}
                  label={t('dayStreak')}
                  micro={t('best', { count: bestStreak })}
                  microActive={false}
                  valueMuted={currentStreak === 0}
                  contrastColor={contrastColor}
                  valueSlotWidth={valueSlotWidth}
                />
                {topCategory ? (
                  /* DORMANT branch (see topCategory above). Icon stays
                     contrastColor — never topCategory.color_hex — so the
                     all-contrast signature holds. */
                  <XStack alignItems="center" gap={spacing.sm}>
                    <YStack
                      width={iconSizes.xl}
                      height={iconSizes.xl}
                      borderRadius={iconSizes.xl / 2}
                      backgroundColor={plateBg}
                      justifyContent="center"
                      alignItems="center"
                    >
                      {getLucideIcon(topCategory.icon, iconSizes.xs, contrastColor)}
                    </YStack>
                    <YStack flex={1} justifyContent="center">
                      <Text.Caption
                        fontFamily={FONT_FAMILIES.semibold}
                        color={contrastColor}
                        numberOfLines={1}
                      >
                        {topCategory.name}
                      </Text.Caption>
                      <Text.Tiny
                        color={contrastColor}
                        opacity={0.78}
                        fontFamily={FONT_FAMILIES.medium}
                        numberOfLines={1}
                      >
                        {`${topCategory.accuracy}% · ${t('topCat')}`}
                      </Text.Tiny>
                    </YStack>
                  </XStack>
                ) : (
                  <StatRow
                    icon={<Check size={iconSizes.xs} color={contrastColor} />}
                    plateBg={plateBg}
                    value={totalCorrect}
                    label={t('correct')}
                    micro={t('todayCount', { count: correctToday })}
                    microActive={correctToday > 0}
                    contrastColor={contrastColor}
                    valueSlotWidth={valueSlotWidth}
                  />
                )}
              </YStack>
            ) : (
              /* No numberOfLines: long-locale sentences wrap (the German
                 noTestsYet string is 60 chars). */
              <Text.Label
                flex={1}
                color={contrastColor}
                opacity={0.78}
                fontFamily={FONT_FAMILIES.semibold}
              >
                {t('noTestsYet')}
              </Text.Label>
            )}
          </XStack>
        </YStack>
      </LinearGradient>
    </Pressable>
  );
}

const heroShadowStyles = StyleSheet.create({
  card: {
    // shadowColor is overridden inline with the blue/violet blend glow.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});
