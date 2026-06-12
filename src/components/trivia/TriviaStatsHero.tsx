import { type ReactNode, useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import { LinearGradient } from 'expo-linear-gradient';

import { hexColors } from '../../theme';
import { blendHexColors, darkenColor, getContrastColor } from '../../utils/colors';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';
import { Check, ChevronRight, Flame, Target, Zap } from '../icons';
import { XStack, YStack } from '../Stacks';
import { FONT_FAMILIES, Text } from '../Typography';

import type { TranslationKeys } from '../../i18n/translations';
import type { CategoryWithProgress, TriviaStats } from '../../services/trivia';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface TriviaStatsHeroProps {
  stats: TriviaStats | null;
  categories?: CategoryWithProgress[];
  isDark: boolean;
  /** First-load pending state: the card frame renders, the body is a spinner. */
  loading?: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
  onPress?: () => void;
}

// Circular progress dial: dotted watch-face track, frosted inner disc, soft
// glow halo under a sheen-gradient arc, and a comet-tip dot riding the leading
// edge. All strokes stay in the contrastColor family (alpha-only variation) to
// hold the card's all-contrast signature.
function CircularProgress({
  percentage,
  size,
  strokeWidth,
  progressColor,
  trackColor,
  innerFill,
  children,
}: {
  percentage: number;
  size: number;
  strokeWidth: number;
  progressColor: string;
  trackColor: string;
  innerFill?: string;
  children?: ReactNode;
}) {
  const { spacing } = useResponsive();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Glow + tip halo overhang the ring path, so the canvas gets padding while a
  // negative margin keeps the layout footprint at `size`.
  const glowPad = strokeWidth * 1.6;
  const box = size + glowPad * 2;
  const center = box / 2;
  // Near-zero dash + round caps renders the track as evenly spaced dial dots.
  const trackDotGap = circumference / 44;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(percentage, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [percentage, progress]);

  // Only strokeDashoffset animates; strokeDasharray stays a plain prop so the
  // arc length geometry never re-renders.
  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - (progress.value / 100) * circumference,
  }));

  // The tip dot tracks the arc's leading edge (arc starts at 12 o'clock and
  // sweeps clockwise, hence the -90° phase).
  const animatedTipProps = useAnimatedProps(() => {
    const angle = (progress.value / 100) * 2 * Math.PI - Math.PI / 2;
    return {
      cx: center + radius * Math.cos(angle),
      cy: center + radius * Math.sin(angle),
    };
  });

  return (
    <YStack alignItems="center" justifyContent="center">
      <Svg width={box} height={box} style={{ margin: -glowPad }}>
        <Defs>
          {/* Sheen runs top-left → bottom-right, matching the card gradient's
              light direction; alpha-only so the stroke stays contrast-white. */}
          <SvgLinearGradient id="heroRingSheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={progressColor} stopOpacity="1" />
            <Stop offset="100%" stopColor={progressColor} stopOpacity="0.62" />
          </SvgLinearGradient>
        </Defs>
        {/* Frosted inner disc gives the center value its own plate, echoing
            the stat rows' frosted icon plates. */}
        {innerFill && (
          <Circle cx={center} cy={center} r={radius - strokeWidth * 1.6} fill={innerFill} />
        )}
        {/* Dotted dial track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth * 0.55}
          strokeLinecap="round"
          strokeDasharray={[0.1, trackDotGap - 0.1]}
          fill="none"
        />
        {/* Progress arc layers. Skipped entirely at 0%: a zero-length dash
            with a round linecap still paints a cap dot at 12 o'clock. */}
        {percentage > 0 && (
          <>
            {/* Soft halo: the same arc widened and faded (no SVG blur on RN,
                a translucent under-stroke fakes the glow). */}
            <AnimatedCircle
              cx={center}
              cy={center}
              r={radius}
              stroke={progressColor}
              opacity={0.22}
              strokeWidth={strokeWidth * 2.1}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              animatedProps={animatedRingProps}
              rotation="-90"
              origin={`${center}, ${center}`}
            />
            <AnimatedCircle
              cx={center}
              cy={center}
              r={radius}
              stroke="url(#heroRingSheen)"
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              animatedProps={animatedRingProps}
              rotation="-90"
              origin={`${center}, ${center}`}
            />
            {/* Comet tip: halo + bright core at the leading edge */}
            <AnimatedCircle
              r={strokeWidth * 1.45}
              fill={progressColor}
              opacity={0.3}
              animatedProps={animatedTipProps}
            />
            <AnimatedCircle
              r={strokeWidth * 0.8}
              fill={progressColor}
              animatedProps={animatedTipProps}
            />
          </>
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

// One stat line of the support column: frosted icon plate tightly coupled to
// its value + label/micro stack.
function StatRow({
  icon,
  plateBg,
  value,
  label,
  micro,
  microActive,
  valueMuted = false,
  contrastColor,
}: {
  icon: ReactNode;
  plateBg: string;
  value: number;
  label: string;
  micro: string;
  microActive: boolean;
  valueMuted?: boolean;
  contrastColor: string;
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
      {/* Fixed height keeps rows level at one title line; minWidth gives
          1-2 digit values a shared column so the label stack starts at the
          same x on every row instead of ragged-left. */}
      <YStack
        height={typography.lineHeight.title}
        minWidth={typography.fontSize.title * 1.3}
        justifyContent="center"
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
        {/* Overline label: same semibold wide-tracked style as the card
            eyebrow and the ring's Accuracy caption, one step quieter. */}
        <Text.Tiny
          color={contrastColor}
          opacity={0.72}
          textTransform="uppercase"
          letterSpacing={0.8}
          fontFamily={FONT_FAMILIES.semibold}
          numberOfLines={1}
        >
          {label}
        </Text.Tiny>
        {/* Live deltas use the monochrome ramp: 0.95 active / 0.5 inactive
            (labels sit at 0.72 between them). No success-green on the
            gradient: light-mode #10B981 on #0077A8 is near-invisible. */}
        <Text.Tiny
          color={contrastColor}
          opacity={microActive ? 0.95 : 0.5}
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
  loading = false,
  t,
  onPress,
}: TriviaStatsHeroProps) {
  const { iconSizes, spacing, radius, borderWidths, media } = useResponsive();
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

  // While loading, the card is inert and the Details pill stays hidden — we
  // don't yet know whether there's anything to drill into.
  const hasData = !loading && testsTaken > 0;

  // Deco-circle driver: identical to TriviaGridCard's iconContainerSize so the
  // corner texture matches the grid tiles.
  const s = media.topicCardSize * 0.7;

  // Shared overline voice: semibold caps with wide tracking. The card title,
  // the ring's Accuracy caption, and the stat labels all speak it so the big
  // numbers own the hierarchy.
  const tinyLabelProps = {
    color: contrastColor,
    opacity: 0.72,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: FONT_FAMILIES.semibold,
  } as const;
  // Hairline divider between the ring and stat halves; one step fainter than
  // the deco circles so it reads as structure, not decoration.
  const hairline = onDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';

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
        <YStack padding={spacing.lg} gap={spacing.lg}>
          {/* Header row: the title is a quiet uppercase eyebrow (dashboard
              voice) so the Display-sized accuracy number owns the card's
              hierarchy; the Details pill shrinks to match. */}
          <XStack justifyContent="space-between" alignItems="center">
            <Text.Caption
              flex={1}
              color={contrastColor}
              opacity={0.85}
              textTransform="uppercase"
              letterSpacing={1.4}
              fontFamily={FONT_FAMILIES.semibold}
              numberOfLines={1}
            >
              {t('yourPerformance')}
            </Text.Caption>
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
                <Text.Tiny fontFamily={FONT_FAMILIES.semibold} color={contrastColor}>
                  {t('details')}
                </Text.Tiny>
                <ChevronRight size={iconSizes.xs} color={contrastColor} opacity={0.78} />
              </XStack>
            )}
          </XStack>

          {/* Body row — one skeleton for filled and empty so the empty state
              previews the filled geometry and cannot drift out of sync. */}
          {/* Body splits in equal halves around a hairline divider: ring
              centered left, stat rows filling the right. */}
          {loading ? (
            /* minHeight matches the ring's layout footprint so the card
               doesn't jump when the stats land. */
            <YStack minHeight={iconSizes.heroXl} justifyContent="center" alignItems="center">
              <ActivityIndicator color={contrastColor} />
            </YStack>
          ) : (
            <XStack alignItems="center" gap={spacing.md}>
              {/* Ring half: number stays full Display size (a 0-100 value plus
                % fits the 84pt inner diameter without auto-shrinking — iOS
                collapses adjustsFontSizeToFit text inside flex rows); the
                label sits under the ring where it has the full column width. */}
              <YStack flex={1} alignItems="center" gap={spacing.sm}>
                <CircularProgress
                  percentage={hasData ? accuracy : 0}
                  size={iconSizes.heroXl}
                  strokeWidth={borderWidths.extraHeavy}
                  progressColor={contrastColor}
                  trackColor={plateBg}
                  innerFill={circleA}
                >
                  {hasData ? (
                    <XStack alignItems="baseline">
                      <Text.Display color={contrastColor} numberOfLines={1}>
                        {accuracy}
                      </Text.Display>
                      <Text.Caption
                        fontFamily={FONT_FAMILIES.semibold}
                        color={contrastColor}
                        opacity={0.7}
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

              {/* Structural hairline between the halves */}
              <YStack
                width={1}
                alignSelf="stretch"
                marginVertical={spacing.xs}
                backgroundColor={hairline}
              />

              {hasData ? (
                <YStack flex={1} gap={spacing.md}>
                  <StatRow
                    icon={<Zap size={iconSizes.xs} color={contrastColor} />}
                    plateBg={plateBg}
                    value={testsTaken}
                    label={t('quizzes')}
                    micro={t('thisWeek', { count: testsThisWeek })}
                    microActive={testsThisWeek > 0}
                    contrastColor={contrastColor}
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
                          opacity={0.72}
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
                    />
                  )}
                </YStack>
              ) : (
                <YStack flex={1} justifyContent="center">
                  {/* No numberOfLines: long-locale sentences wrap (the German
                   noTestsYet string is 60 chars). Medium weight: an invitation,
                   not a stat, so it sits softer than the data voice. */}
                  <Text.Label
                    color={contrastColor}
                    opacity={0.85}
                    fontFamily={FONT_FAMILIES.medium}
                  >
                    {t('noTestsYet')}
                  </Text.Label>
                </YStack>
              )}
            </XStack>
          )}
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
