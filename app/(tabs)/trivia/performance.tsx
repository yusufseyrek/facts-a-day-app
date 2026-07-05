import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ContentContainer, GlassSurface } from '../../../src/components';
import { BadgeIcon } from '../../../src/components/badges/BadgeIcon';
import {
  Award,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Grid,
  ListChecks,
  Shuffle,
  Tag,
  Zap,
} from '../../../src/components/icons';
import { ShimmerPlaceholder } from '../../../src/components/ShimmerPlaceholder';
import { XStack, YStack } from '../../../src/components/Stacks';
import { getTriviaModeBadge, TriviaResults } from '../../../src/components/trivia';
import { FONT_FAMILIES, Text } from '../../../src/components/Typography';
import { DISPLAY_LIMITS } from '../../../src/config/app';
import { BADGE_DEFINITIONS } from '../../../src/config/badges';
import { useTranslation } from '../../../src/i18n';
import { Screens, trackScreenView, trackTriviaResultsView } from '../../../src/services/analytics';
import { getEarnedBadges } from '../../../src/services/badges';
import { useTabBarBannerInset } from '../../../src/services/tabBarBannerInset';
import * as triviaService from '../../../src/services/trivia';
import { hexColors, useTheme } from '../../../src/theme';
import { blendHexColors, darkenColor, getContrastColor, hexToRgba } from '../../../src/utils/colors';
import { getLucideIcon } from '../../../src/utils/iconMapper';
import { absoluteFillObject, androidRipple } from '../../../src/utils/styles';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { TranslationKeys } from '../../../src/i18n/translations';
import type { TriviaMode } from '../../../src/services/analytics';
import type {
  CategoryWithProgress,
  TriviaSessionWithCategory,
  TriviaStats,
} from '../../../src/services/trivia';

type ModeBreakdownRow = Awaited<ReturnType<typeof triviaService.getModeBreakdown>>[number];

// View All Button with press animation
function ViewAllButton({
  onPress,
  label,
  color,
}: {
  onPress: () => void;
  label: string;
  color: string;
}) {
  const { iconSizes, spacing } = useResponsive();
  const scale = React.useRef(new RNAnimated.Value(1)).current;

  const handlePressIn = () => {
    RNAnimated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 50,
      bounciness: 10,
    }).start();
  };

  const handlePressOut = () => {
    RNAnimated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <RNAnimated.View
        style={{
          transform: [{ scale }],
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
        }}
      >
        <Text.Label fontFamily={FONT_FAMILIES.semibold} color={color}>
          {label}
        </Text.Label>
        <ChevronRight size={iconSizes.sm} color={color} />
      </RNAnimated.View>
    </Pressable>
  );
}

/**
 * Card scaffold shared by every block on this screen: shadow + rounded card
 * fill, with the iOS 26 Liquid Glass backing when available (the same
 * treatment the old stat cards carried, factored out so the reworked blocks
 * can't drift apart in tone).
 */
function PerfCard({
  children,
  isDark,
  padding,
  onPress,
}: {
  children: React.ReactNode;
  isDark: boolean;
  padding?: number;
  onPress?: () => void;
}) {
  const { spacing, radius } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const body = (
    <>
      {useGlass && (
        <GlassSurface
          variant="glass"
          isDark={isDark}
          tint={colors.cardBackground}
          glassTint={hexToRgba(colors.cardBackground, isDark ? 0.6 : 0.65)}
          borderRadius={radius.lg}
          style={absoluteFillObject}
        />
      )}
      <YStack
        backgroundColor={useGlass ? 'transparent' : colors.cardBackground}
        borderRadius={radius.lg}
        padding={padding ?? spacing.lg}
      >
        {children}
      </YStack>
    </>
  );
  const frameStyle = [
    perfShadowStyles.card,
    { borderRadius: radius.lg },
    useGlass && {
      overflow: 'hidden' as const,
      borderWidth: 1,
      borderColor: colors.border,
    },
  ];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [...frameStyle, { opacity: pressed ? 0.7 : 1 }]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={frameStyle}>{body}</View>;
}

/** Group thousands (4,210) without Intl, which is unreliable across RN
 * engines (same helper as the leaderboard/profile). */
function formatScore(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The lifetime band: ONE gradient banner holding the four lifetime stats the
 * hub hero does NOT show (the hero owns accuracy/quizzes/current-streak/rank).
 * Its gradient STARTS at the hub hero's END stop — darken(neonPurple, 0.22) —
 * and runs into a deeper primary, so hub → performance reads as one gradient
 * handed off and deepened rather than a clone. This is the only gradient card
 * surface on the screen; the week/mode cards below stay quiet on purpose.
 *
 * LOAD-BEARING (same trap as TriviaStatsHero): both stops must stay darkened.
 * Raw dark-mode neonPurple #A855F7 (luminance 0.503) flips getContrastColor
 * to BLACK; darken(0.22)/darken(0.30) keep every stop white-contrast in both
 * themes. contrastColor is computed at runtime from the actual start stop.
 */
function LifetimeBanner({
  answered,
  perfectGames,
  bestStreak,
  timePlayed,
  isDark,
  animateIntro,
  t,
}: {
  answered: number;
  perfectGames: number;
  bestStreak: number;
  timePlayed: string;
  isDark: boolean;
  /** False when the dashboard remounts mid-visit (session-result peek):
   * cells render settled, no entrance replay. */
  animateIntro: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}) {
  const { spacing, radius, iconSizes, media } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;

  const gradStart = darkenColor(colors.neonPurple, 0.22);
  const gradEnd = darkenColor(colors.primary, 0.3);
  const contrastColor = getContrastColor(gradStart);
  const onDark = contrastColor === '#FFFFFF';
  // Signature alphas from the hub hero / grid cards, branched on contrast.
  const plateBg = onDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)';
  const hairline = onDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  const circleA = onDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const circleB = onDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)';
  // Deco-circle driver — identical to the grid tiles / hub hero.
  const s = media.topicCardSize * 0.7;
  const glowColor = blendHexColors(colors.neonPurple, colors.primary, 0.5);

  // All-contrast on purpose: no per-stat hues inside the banner. The hero's
  // all-contrast signature is the anti-confetti device (and keeps the gold
  // Award icon from reading as paywall chrome).
  const cells = [
    { Icon: ListChecks, value: formatScore(answered), label: t('answered') },
    { Icon: Award, value: formatScore(perfectGames), label: t('perfectGames') },
    { Icon: Flame, value: String(bestStreak), label: t('dayStreak') },
    { Icon: Clock, value: timePlayed, label: t('timePlayed') },
  ];

  // Stacked anatomy (plate above text), not inline: the text column then owns
  // the full quadrant width, which is what lets long localized values
  // ("3 Std. 24 Min.") and labels ("PERFEKTE QUIZZE") fit without truncating
  // on small devices or at accessibility font scales.
  const cell = (index: number) => {
    const { Icon, value, label } = cells[index];
    return (
      <Animated.View
        entering={
          animateIntro
            ? FadeInDown.delay(90 + index * 60)
                .duration(350)
                .reduceMotion(ReduceMotion.System)
            : undefined
        }
        style={{ flex: 1 }}
      >
        <YStack
          gap={spacing.sm}
          paddingVertical={spacing.sm}
          paddingHorizontal={spacing.sm}
          accessible
          accessibilityLabel={`${label}: ${value}`}
        >
          <YStack
            width={iconSizes.xl}
            height={iconSizes.xl}
            borderRadius={iconSizes.xl / 2}
            backgroundColor={plateBg}
            justifyContent="center"
            alignItems="center"
          >
            <Icon size={iconSizes.xs} color={contrastColor} />
          </YStack>
          <YStack>
            <Text.Title color={contrastColor} fontFamily={FONT_FAMILIES.bold} numberOfLines={1}>
              {value}
            </Text.Title>
            <Text.Tiny
              color={contrastColor}
              opacity={0.72}
              textTransform="uppercase"
              letterSpacing={0.8}
              fontFamily={FONT_FAMILIES.semibold}
              numberOfLines={2}
            >
              {label}
            </Text.Tiny>
          </YStack>
        </YStack>
      </Animated.View>
    );
  };

  const vHairline = (
    <YStack width={1} alignSelf="stretch" marginVertical={spacing.xs} backgroundColor={hairline} />
  );

  return (
    <View style={[perfShadowStyles.banner, { borderRadius: radius.xl, shadowColor: glowColor }]}>
      <LinearGradient
        colors={[gradStart, gradEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.xl, overflow: 'hidden' }}
      >
        {/* Layered deco circles — grid-card geometry, contrast-branched. */}
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
        <YStack padding={spacing.lg} gap={spacing.sm}>
          <Text.Caption
            color={contrastColor}
            opacity={0.85}
            textTransform="uppercase"
            letterSpacing={1.4}
            fontFamily={FONT_FAMILIES.semibold}
            numberOfLines={1}
          >
            {t('leaderboardAllTime')}
          </Text.Caption>
          <YStack>
            <XStack>
              {cell(0)}
              {vHairline}
              {cell(1)}
            </XStack>
            <View style={{ height: 1, backgroundColor: hairline, marginVertical: spacing.xs }} />
            <XStack>
              {cell(2)}
              {vHairline}
              {cell(3)}
            </XStack>
          </YStack>
        </YStack>
      </LinearGradient>
    </View>
  );
}

/**
 * One day column of the activity strip. Owns its grow animation, latched to
 * the screen's intro: plays once on the visit's first dashboard reveal.
 * Data refreshes don't remount rows (no replay), and remounts caused by the
 * session-results peek (the early-return branch swaps the whole dashboard
 * out and back) arrive with animateIntro=false, so they render settled.
 * Today's bar carries the hub ring's soft-halo quote — a translucent
 * under-mark, NOT a shadow, so Android draws no elevation box.
 */
function WeekBar({
  label,
  count,
  target,
  isToday,
  index,
  isDark,
  animateIntro,
}: {
  label: string;
  count: number;
  target: number;
  isToday: boolean;
  index: number;
  isDark: boolean;
  animateIntro: boolean;
}) {
  const { spacing, radius, typography } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  const active = count > 0;

  // Latched at mount: a later prop flip must not re-trigger the theater.
  const shouldAnimate = React.useRef(animateIntro).current;
  const grow = useSharedValue(shouldAnimate ? 0 : 1);
  useEffect(() => {
    if (!shouldAnimate || !active) return; // idle days schedule nothing
    grow.value = withDelay(
      index * 45,
      withTiming(1, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
      // Third arg: reduce-motion must skip the stagger too, not just the tween.
      ReduceMotion.System
    );
  }, [shouldAnimate, active, index, grow]);

  const growStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));

  return (
    <YStack flex={1} alignItems="center" gap={spacing.xs}>
      {active ? (
        <Animated.View
          style={[
            {
              // Today widens to host the halo; the gradient bar inside stays
              // at the other bars' visual width (0.85 × 0.65 ≈ 0.55).
              width: isToday ? '85%' : '55%',
              height: target,
              alignItems: 'center',
              transformOrigin: 'bottom',
            },
            growStyle,
          ]}
        >
          {isToday && (
            <View
              style={[
                absoluteFillObject,
                {
                  borderRadius: radius.full,
                  backgroundColor: hexToRgba(colors.primary, isDark ? 0.28 : 0.18),
                },
              ]}
            />
          )}
          <View
            style={{
              width: isToday ? '65%' : '100%',
              height: '100%',
              borderRadius: radius.full,
              overflow: 'hidden',
            }}
          >
            <LinearGradient
              colors={[colors.primary, darkenColor(colors.primary, 0.22)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>
        </Animated.View>
      ) : (
        <View
          style={{
            width: '55%',
            height: spacing.xs,
            borderRadius: radius.full,
            backgroundColor: colors.border,
          }}
        />
      )}
      <Text.Tiny
        color={isToday ? colors.primary : colors.textMuted}
        fontFamily={isToday ? FONT_FAMILIES.semibold : undefined}
        fontSize={typography.fontSize.tiny}
        maxFontSizeMultiplier={1}
      >
        {label}
      </Text.Tiny>
    </YStack>
  );
}

/** The trailing-week activity card: quiet label + this-week pill over the
 * 7-day strip of grow-in gradient bars (today haloed + tinted initial). */
function WeeklyActivityCard({
  weeklyActivity,
  testsThisWeek,
  isDark,
  animateIntro,
  t,
}: {
  weeklyActivity: { date: string; count: number }[];
  testsThisWeek: number;
  isDark: boolean;
  animateIntro: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}) {
  const { spacing, radius } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  const maxDayCount = Math.max(1, ...weeklyActivity.map((d) => d.count));
  const stripHeight = spacing.xl + spacing.md;

  // Localized single-letter weekday markers under the activity bars.
  const dayInitial = (isoDate: string) => {
    const d = new Date(`${isoDate}T12:00:00`);
    return d.toLocaleDateString(undefined, { weekday: 'narrow' });
  };

  // Today by LOCAL date-string match (the service builds the identical
  // padded local key, so a miss can only mean the data window predates the
  // current local day — e.g. resumed after midnight without a refetch). No
  // positional fallback: mislabeling yesterday as TODAY is worse than
  // highlighting nothing until the next load rolls the strip forward.
  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const todayIndex = weeklyActivity.findIndex((d) => d.date === todayLocal);

  return (
    <PerfCard isDark={isDark}>
      <YStack gap={spacing.md}>
        <XStack alignItems="center" justifyContent="space-between">
          <Text.Tiny
            color={colors.textMuted}
            textTransform="uppercase"
            letterSpacing={0.8}
            fontFamily={FONT_FAMILIES.semibold}
          >
            {t('last7Days')}
          </Text.Tiny>
          {testsThisWeek > 0 && (
            <XStack
              paddingHorizontal={spacing.sm}
              paddingVertical={2}
              borderRadius={radius.full}
              backgroundColor={hexToRgba(colors.primary, isDark ? 0.16 : 0.1)}
            >
              <Text.Caption color={colors.primary} fontFamily={FONT_FAMILIES.semibold}>
                {t('thisWeek', { count: testsThisWeek })}
              </Text.Caption>
            </XStack>
          )}
        </XStack>
        <XStack gap={spacing.sm} alignItems="flex-end">
          {weeklyActivity.map((day, index) => (
            <WeekBar
              key={day.date}
              label={dayInitial(day.date)}
              count={day.count}
              target={Math.max(stripHeight * 0.3, (day.count / maxDayCount) * stripHeight)}
              isToday={index === todayIndex}
              index={index}
              isDark={isDark}
              animateIntro={animateIntro}
            />
          ))}
        </XStack>
      </YStack>
    </PerfCard>
  );
}

/** Icon + hue signature per mode — the same map the hub grid cards and the
 * session rows speak, so a mode reads identically across all three surfaces. */
function modeVisual(
  mode: ModeBreakdownRow['mode'],
  isDark: boolean
): { Icon: typeof Calendar; color: string } {
  const colors = isDark ? hexColors.dark : hexColors.light;
  switch (mode) {
    case 'daily':
      return { Icon: Calendar, color: colors.primary };
    case 'true_false':
      return { Icon: CheckCircle, color: colors.neonGreen };
    case 'multiple_choice':
      return { Icon: Grid, color: colors.neonOrange };
    case 'category':
      return { Icon: Tag, color: colors.accent };
    default:
      return { Icon: Shuffle, color: colors.neonPurple };
  }
}

const MODE_LABEL_KEY: Record<ModeBreakdownRow['mode'], TranslationKeys> = {
  daily: 'dailyTrivia',
  mixed: 'mixedTrivia',
  true_false: 'trueFalseTrivia',
  multiple_choice: 'multipleChoiceTrivia',
  category: 'categoryMode',
};

/**
 * One mode row: the established plate/name/figures anatomy plus a thin
 * animated gradient accuracy RAIL in the row's hue. Deliberately thinner
 * (spacing.xs) than the category card's flat bars (spacing.sm) below, so the
 * two blocks read differently at a glance. The fill sweep is latched to the
 * screen's intro (see WeekBar): plays once on the visit's first dashboard
 * reveal, never on data refreshes or session-peek remounts.
 */
function ModeRow({
  row,
  index,
  isDark,
  animateIntro,
  t,
}: {
  row: ModeBreakdownRow;
  index: number;
  isDark: boolean;
  animateIntro: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}) {
  const { spacing, radius, iconSizes, typography } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  const { Icon, color } = modeVisual(row.mode, isDark);

  const hasFill = row.accuracy > 0;
  const shouldAnimate = React.useRef(animateIntro).current;
  const fill = useSharedValue(shouldAnimate ? 0 : 1);
  useEffect(() => {
    if (!shouldAnimate || !hasFill) return; // 0% rows keep a bare track, schedule nothing
    fill.value = withDelay(
      index * 60,
      withTiming(1, {
        duration: 600,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
      ReduceMotion.System
    );
  }, [shouldAnimate, hasFill, index, fill]);

  // Width stays the static percent and only scaleX animates, so the
  // gradient's endpoint hue is correct at every frame of the sweep.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  return (
    <XStack alignItems="center" gap={spacing.sm}>
      <View
        style={{
          width: iconSizes.xl,
          height: iconSizes.xl,
          borderRadius: radius.sm,
          backgroundColor: `${color}20`,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon size={iconSizes.xs} color={color} />
      </View>
      <YStack flex={1}>
        <Text.Label color={colors.text} fontFamily={FONT_FAMILIES.medium} numberOfLines={1}>
          {t(MODE_LABEL_KEY[row.mode])}
        </Text.Label>
        <Text.Caption color={colors.textMuted} fontSize={typography.fontSize.tiny}>
          {t('leaderboardGamesCount', { count: String(row.games) })}
        </Text.Caption>
        <View
          style={{
            marginTop: spacing.xs,
            height: spacing.xs,
            borderRadius: radius.full,
            backgroundColor: colors.border,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          {hasFill && (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${row.accuracy}%`,
                  borderRadius: radius.full,
                  overflow: 'hidden',
                  transformOrigin: 'left',
                },
                fillStyle,
              ]}
            >
              <LinearGradient
                colors={[color, darkenColor(color, 0.22)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          )}
        </View>
      </YStack>
      <YStack alignItems="flex-end">
        <Text.Label color={colors.text} fontFamily={FONT_FAMILIES.bold}>
          {`${row.accuracy}%`}
        </Text.Label>
        <Text.Caption color={colors.textMuted} fontSize={typography.fontSize.tiny}>
          {`${row.correct}/${row.answered}`}
        </Text.Caption>
      </YStack>
    </XStack>
  );
}

/** Per-mode play volume + accuracy rows. */
function ModeBreakdownCard({
  rows,
  isDark,
  animateIntro,
  t,
}: {
  rows: ModeBreakdownRow[];
  isDark: boolean;
  animateIntro: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}) {
  const { spacing } = useResponsive();
  return (
    <PerfCard isDark={isDark}>
      <YStack gap={spacing.lg}>
        {rows.map((row, index) => (
          <ModeRow
            key={row.mode}
            row={row}
            index={index}
            isDark={isDark}
            animateIntro={animateIntro}
            t={t}
          />
        ))}
      </YStack>
    </PerfCard>
  );
}

// Category Progress Bar - shows accuracy (correct answers percentage)
function CategoryProgressBar({
  category,
  isDark,
}: {
  category: CategoryWithProgress;
  isDark: boolean;
}) {
  const { typography, spacing } = useResponsive();
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const trackColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const progressColor =
    category.color_hex || (isDark ? hexColors.dark.primary : hexColors.light.primary);
  const percentage = category.accuracy;
  const barHeight = spacing.sm;

  const mutedColor = isDark ? hexColors.dark.textMuted : hexColors.light.textMuted;

  return (
    <YStack gap={spacing.xs}>
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap={spacing.sm}>
          {getLucideIcon(category.icon, typography.fontSize.title, progressColor)}
          <Text.Label color={textColor} fontFamily={FONT_FAMILIES.medium} width="50%">
            {category.name}
          </Text.Label>
        </XStack>
        <XStack alignItems="baseline" gap={spacing.xs}>
          {/* The denominator: a bare % hid whether it meant 2 answers or 200. */}
          <Text.Caption color={mutedColor} fontSize={typography.fontSize.tiny}>
            {`${category.correct}/${category.answered}`}
          </Text.Caption>
          <Text.Caption color={textColor} fontFamily={FONT_FAMILIES.semibold}>
            {percentage}%
          </Text.Caption>
        </XStack>
      </XStack>
      <View
        style={{
          width: '100%',
          height: barHeight,
          backgroundColor: trackColor,
          borderRadius: barHeight / 2,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: progressColor,
            borderRadius: barHeight / 2,
          }}
        />
      </View>
    </YStack>
  );
}

// Session Card Component (unified with history view)
function SessionCard({
  session,
  isDark,
  t,
  onPress,
  dateFormat = 'time',
  testID,
}: {
  session: TriviaSessionWithCategory;
  isDark: boolean;
  t: (key: any, params?: any) => string;
  onPress?: () => void;
  dateFormat?: 'time' | 'relative';
  testID?: string;
}) {
  const { iconSizes, spacing, radius, media } = useResponsive();
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const warningColor = '#F59E0B';
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const iconContainerSize = media.topicCardSize * 0.5;

  const scorePercentage =
    session.total_questions > 0 ? (session.correct_answers / session.total_questions) * 100 : 0;

  const getFeedback = () => {
    if (scorePercentage >= 90) {
      return { text: t('perfectScore'), color: successColor };
    } else if (scorePercentage >= 70) {
      return { text: t('greatJob'), color: successColor };
    } else if (scorePercentage >= 50) {
      return { text: t('goodEffort'), color: warningColor };
    } else {
      return { text: t('keepPracticing'), color: errorColor };
    }
  };

  const feedback = getFeedback();

  const formatTimeOnly = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `${t('today')}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return t('yesterday');
    } else {
      return t('daysAgo', { count: diffDays });
    }
  };

  const getDateDisplay = () => {
    return dateFormat === 'relative'
      ? formatRelativeDate(session.completed_at)
      : formatTimeOnly(session.completed_at);
  };

  const getDisplayName = () => {
    if (session.category) {
      return session.category.name;
    }
    switch (session.trivia_mode) {
      case 'daily':
        return t('dailyTrivia');
      case 'mixed':
        return t('mixedTrivia');
      case 'true_false':
        return t('trueFalseTrivia');
      case 'multiple_choice':
        return t('multipleChoiceTrivia');
      case 'quick':
        // Legacy mode (Quick Quiz feature removed); historical sessions still render.
        return 'Quick Quiz';
      default:
        return t('trivia');
    }
  };

  const getIcon = () => {
    if (session.category) {
      const iconColor = session.category.color_hex || primaryColor;
      return (
        <View
          style={{
            width: iconContainerSize,
            height: iconContainerSize,
            borderRadius: radius.sm,
            backgroundColor: `${iconColor}20`,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {getLucideIcon(session.category.icon, iconSizes.md, iconColor)}
        </View>
      );
    }

    // Same icon + hue map as the hub cards so history rows read as their mode.
    const IconComponent =
      session.trivia_mode === 'daily'
        ? Calendar
        : session.trivia_mode === 'quick'
          ? Zap
          : session.trivia_mode === 'true_false'
            ? CheckCircle
            : session.trivia_mode === 'multiple_choice'
              ? Grid
              : Shuffle;
    const iconColor =
      session.trivia_mode === 'true_false'
        ? isDark
          ? hexColors.dark.neonGreen
          : hexColors.light.neonGreen
        : session.trivia_mode === 'multiple_choice'
          ? isDark
            ? hexColors.dark.neonOrange
            : hexColors.light.neonOrange
          : primaryColor;

    return (
      <View
        style={{
          width: iconContainerSize,
          height: iconContainerSize,
          borderRadius: radius.sm,
          backgroundColor: `${iconColor}20`,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <IconComponent size={iconSizes.lg} color={iconColor} />
      </View>
    );
  };

  const hasResultData = session.question_ids && session.selected_answers;

  return (
    <Pressable
      onPress={hasResultData ? onPress : undefined}
      android_ripple={hasResultData ? androidRipple(isDark) : undefined}
      style={({ pressed }) => [
        perfShadowStyles.card,
        { borderRadius: radius.lg },
        // Clip the ripple to the rounded card — Android only: on iOS
        // overflow:'hidden' (masksToBounds) would kill the card shadow.
        Platform.OS === 'android' && { overflow: 'hidden' as const },
        Platform.OS === 'ios' && pressed && hasResultData && { opacity: 0.8 },
      ]}
      testID={testID}
    >
      <XStack
        backgroundColor={cardBg}
        borderRadius={radius.lg}
        padding={spacing.lg}
        alignItems="center"
        gap={spacing.sm}
      >
        {getIcon()}
        <YStack flex={1} gap={2}>
          <Text.Label fontFamily={FONT_FAMILIES.semibold} color={textColor}>
            {getDisplayName()}
          </Text.Label>
          <Text.Caption color={secondaryTextColor}>{getDateDisplay()}</Text.Caption>
        </YStack>
        <YStack alignItems="flex-end" gap={2}>
          <Text.Caption fontFamily={FONT_FAMILIES.semibold} color={feedback.color}>
            {feedback.text}
          </Text.Caption>
          <Text.Caption color={secondaryTextColor}>
            {t('score')}: {session.correct_answers}/{session.total_questions}
          </Text.Caption>
        </YStack>
        {hasResultData && <ChevronRight size={iconSizes.md} color={secondaryTextColor} />}
      </XStack>
    </Pressable>
  );
}

const perfShadowStyles = StyleSheet.create({
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  // The lifetime banner's glow — hub-hero shadow recipe; shadowColor is
  // overridden inline with the purple/primary blend.
  banner: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});

/**
 * Loading skeleton mirroring the loaded dashboard from the same tokens, so
 * the swap to real data doesn't shift anything (the profile screen's skeleton
 * grammar). The lifetime banner renders its REAL gradient frame — both stops
 * derive from the theme, known before the fetch — with translucent shimmer
 * marks on top; the quiet cards below shimmer in the border tone.
 */
function PerformanceSkeleton({ isDark }: { isDark: boolean }) {
  const { spacing, radius, iconSizes, typography, media } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  const { lineHeight } = typography;

  // Banner frame — the exact LifetimeBanner recipe (stops, glow, circles).
  const gradStart = darkenColor(colors.neonPurple, 0.22);
  const gradEnd = darkenColor(colors.primary, 0.3);
  const contrastColor = getContrastColor(gradStart);
  const onDark = contrastColor === '#FFFFFF';
  const markColor = onDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.32)';
  const hairline = onDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  const circleA = onDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const circleB = onDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)';
  const s = media.topicCardSize * 0.7;
  const glowColor = blendHexColors(colors.neonPurple, colors.primary, 0.5);

  const bannerCell = (key: number) => (
    <YStack
      key={key}
      flex={1}
      gap={spacing.sm}
      paddingVertical={spacing.sm}
      paddingHorizontal={spacing.sm}
    >
      <ShimmerPlaceholder
        width={iconSizes.xl}
        height={iconSizes.xl}
        borderRadius={iconSizes.xl / 2}
        color={markColor}
      />
      {/* The real cell stacks Title flush over Tiny (no gap), so these marks
          plus the visual gap must sum to lineHeight.title + lineHeight.tiny —
          anything more and the banner shrinks when data lands. */}
      <YStack gap={spacing.xs}>
        <ShimmerPlaceholder
          width="55%"
          height={lineHeight.title - spacing.xs}
          color={markColor}
        />
        <ShimmerPlaceholder width="75%" height={lineHeight.tiny} color={markColor} />
      </YStack>
    </YStack>
  );

  const vHairline = (
    <YStack width={1} alignSelf="stretch" marginVertical={spacing.xs} backgroundColor={hairline} />
  );

  // 7-day strip: fixed height pattern (no randomness — stable re-renders).
  const stripHeight = spacing.xl + spacing.md;
  const barFractions = [0.45, 0.7, 0.35, 1, 0.55, 0.8, 0.6];

  const modeRow = (key: number) => (
    <XStack key={key} alignItems="center" gap={spacing.sm}>
      <ShimmerPlaceholder width={iconSizes.xl} height={iconSizes.xl} borderRadius={radius.sm} />
      {/* The real row stacks label flush over the games count, and the count
          keeps the CAPTION line box even at tiny fontSize — so the count mark
          is lineHeight.caption minus the one gap this column adds, keeping the
          row at the loaded height (the second gap stands in for the rail's
          marginTop). */}
      <YStack flex={1} gap={spacing.xs}>
        <ShimmerPlaceholder width="45%" height={lineHeight.label} />
        <ShimmerPlaceholder width="30%" height={lineHeight.caption - spacing.xs} />
        <ShimmerPlaceholder width="100%" height={spacing.xs} borderRadius={radius.full} />
      </YStack>
      <YStack alignItems="flex-end" gap={spacing.xs}>
        <ShimmerPlaceholder width={44} height={lineHeight.label} />
        <ShimmerPlaceholder width={32} height={lineHeight.caption - spacing.xs} />
      </YStack>
    </XStack>
  );

  const categoryRow = (key: number) => (
    <YStack key={key} gap={spacing.xs}>
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap={spacing.sm}>
          <ShimmerPlaceholder
            width={typography.fontSize.title}
            height={typography.fontSize.title}
            borderRadius={4}
          />
          <ShimmerPlaceholder width={110} height={lineHeight.label} />
        </XStack>
        <ShimmerPlaceholder width={64} height={lineHeight.caption} />
      </XStack>
      <ShimmerPlaceholder width="100%" height={spacing.sm} borderRadius={spacing.sm / 2} />
    </YStack>
  );

  const iconContainerSize = media.topicCardSize * 0.5;
  const sessionRow = (key: number) => (
    <View key={key} style={[perfShadowStyles.card, { borderRadius: radius.lg }]}>
      <XStack
        backgroundColor={colors.cardBackground}
        borderRadius={radius.lg}
        padding={spacing.lg}
        alignItems="center"
        gap={spacing.sm}
      >
        <ShimmerPlaceholder
          width={iconContainerSize}
          height={iconContainerSize}
          borderRadius={radius.sm}
        />
        <YStack flex={1} gap={spacing.xs}>
          <ShimmerPlaceholder width="50%" height={lineHeight.label} />
          <ShimmerPlaceholder width="35%" height={lineHeight.caption} />
        </YStack>
        <YStack alignItems="flex-end" gap={spacing.xs}>
          <ShimmerPlaceholder width={72} height={lineHeight.caption} />
          <ShimmerPlaceholder width={56} height={lineHeight.caption} />
        </YStack>
      </XStack>
    </View>
  );

  return (
    <YStack marginVertical={spacing.lg} gap={spacing.xl}>
      {/* Lifetime banner */}
      <View style={[perfShadowStyles.banner, { borderRadius: radius.xl, shadowColor: glowColor }]}>
        <LinearGradient
          colors={[gradStart, gradEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.xl, overflow: 'hidden' }}
        >
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
          <YStack padding={spacing.lg} gap={spacing.sm}>
            <ShimmerPlaceholder width={96} height={lineHeight.caption} color={markColor} />
            <YStack>
              <XStack>
                {bannerCell(0)}
                {vHairline}
                {bannerCell(1)}
              </XStack>
              <View style={{ height: 1, backgroundColor: hairline, marginVertical: spacing.xs }} />
              <XStack>
                {bannerCell(2)}
                {vHairline}
                {bannerCell(3)}
              </XStack>
            </YStack>
          </YStack>
        </LinearGradient>
      </View>

      {/* Trailing week activity */}
      <PerfCard isDark={isDark}>
        <YStack gap={spacing.md}>
          <XStack alignItems="center" justifyContent="space-between">
            <ShimmerPlaceholder width={90} height={lineHeight.tiny} />
            {/* +4: the real this-week pill wraps its caption in paddingVertical
                2, and the pill is what sets the loaded header row's height. */}
            <ShimmerPlaceholder
              width={72}
              height={lineHeight.caption + 4}
              borderRadius={radius.full}
            />
          </XStack>
          <XStack gap={spacing.sm} alignItems="flex-end">
            {barFractions.map((fraction, index) => (
              <YStack key={index} flex={1} alignItems="center" gap={spacing.xs}>
                <ShimmerPlaceholder
                  width="55%"
                  height={stripHeight * fraction}
                  borderRadius={radius.full}
                />
                <ShimmerPlaceholder width={spacing.md} height={lineHeight.tiny} />
              </YStack>
            ))}
          </XStack>
        </YStack>
      </PerfCard>

      {/* Per-mode breakdown */}
      <YStack gap={spacing.md}>
        <ShimmerPlaceholder width={120} height={lineHeight.title} />
        <PerfCard isDark={isDark}>
          <YStack gap={spacing.lg}>{[0, 1, 2, 3].map(modeRow)}</YStack>
        </PerfCard>
      </YStack>

      {/* Accuracy by category */}
      <View>
        <YStack marginBottom={spacing.md} gap={spacing.xs}>
          <ShimmerPlaceholder width={180} height={lineHeight.title} />
          <ShimmerPlaceholder width="70%" height={lineHeight.caption} />
        </YStack>
        <PerfCard isDark={isDark}>
          <YStack gap={spacing.lg}>
            {Array.from({ length: DISPLAY_LIMITS.MAX_CATEGORIES }, (_, i) => categoryRow(i))}
          </YStack>
        </PerfCard>
      </View>

      {/* Achievements */}
      <PerfCard isDark={isDark}>
        <YStack gap={spacing.md}>
          <XStack alignItems="center" justifyContent="space-between">
            <XStack alignItems="center" gap={spacing.sm}>
              <ShimmerPlaceholder width={iconSizes.sm} height={iconSizes.sm} borderRadius={4} />
              <ShimmerPlaceholder width={110} height={lineHeight.label} />
            </XStack>
            <ShimmerPlaceholder width={80} height={lineHeight.caption} />
          </XStack>
          <XStack gap={spacing.xs}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <ShimmerPlaceholder
                key={i}
                width={iconSizes.xl}
                height={iconSizes.xl}
                borderRadius={iconSizes.xl / 2}
              />
            ))}
          </XStack>
        </YStack>
      </PerfCard>

      {/* Recent tests */}
      <View>
        <XStack alignItems="center" marginBottom={spacing.md}>
          <ShimmerPlaceholder width={140} height={lineHeight.title} />
        </XStack>
        <YStack gap={spacing.md}>
          {Array.from({ length: DISPLAY_LIMITS.MAX_ACTIVITIES }, (_, i) => sessionRow(i))}
        </YStack>
      </View>
    </YStack>
  );
}

/**
 * Skeleton reveal heuristic (the Suspense "just-noticeable delay" pair).
 * The dashboard reads local SQLite, which usually lands in a few dozen ms —
 * painting the skeleton immediately and swapping it out two frames later
 * reads as a flash on every open. So: loads faster than DELAY show no
 * loader at all (the push transition covers the gap and the content
 * entrance plays as the screen settles), and once the skeleton IS shown it
 * stays up for MIN_VISIBLE so a load landing just past the delay doesn't
 * flash skeleton→content within a few frames either.
 */
const SKELETON_DELAY_MS = 300;
const SKELETON_MIN_VISIBLE_MS = 500;

export default function PerformanceScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const isDark = theme === 'dark';
  const { iconSizes, spacing } = useResponsive();
  const bannerInset = useTabBarBannerInset();

  const [loading, setLoading] = useState(true);
  // What the loading window shows: 'blank' → (only if slow) 'skeleton' →
  // 'content'. Never regresses; 'content' is only reachable once loading is
  // false, so the dashboard always renders real data.
  const [phase, setPhase] = useState<'blank' | 'skeleton' | 'content'>('blank');
  const skeletonShownAtRef = React.useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<TriviaStats | null>(null);
  const [lifetime, setLifetime] = useState<{ perfectGames: number; totalPlaySeconds: number }>({
    perfectGames: 0,
    totalPlaySeconds: 0,
  });
  const [modeBreakdown, setModeBreakdown] = useState<ModeBreakdownRow[]>([]);
  const [categories, setCategories] = useState<CategoryWithProgress[]>([]);
  const [weeklyActivity, setWeeklyActivity] = useState<{ date: string; count: number }[]>([]);
  const [recentSessions, setRecentSessions] = useState<TriviaSessionWithCategory[]>([]);
  const [totalSessionsCount, setTotalSessionsCount] = useState(0);
  const [selectedSession, setSelectedSession] = useState<TriviaSessionWithCategory | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [earnedBadgeIds, setEarnedBadgeIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);

        const [
          statsData,
          lifetimeData,
          modeData,
          categoriesData,
          activityData,
          sessionsData,
          earnedBadges,
        ] = await Promise.all([
          triviaService.getOverallStats(),
          triviaService.getLifetimeExtras(),
          triviaService.getModeBreakdown(),
          // Play-history categories (all modes), NOT the interest selection —
          // stats must not vanish when the user trims their interests.
          triviaService.getCategoryAccuracy(locale),
          triviaService.getWeeklyActivity(),
          triviaService.getRecentSessions(DISPLAY_LIMITS.MAX_ACTIVITIES),
          getEarnedBadges(),
        ]);

        setStats(statsData);
        setLifetime(lifetimeData);
        setModeBreakdown(modeData);
        setCategories(categoriesData);
        setWeeklyActivity(activityData);
        setRecentSessions(sessionsData);
        setTotalSessionsCount(statsData.testsTaken);
        setEarnedBadgeIds(new Set(earnedBadges.map((b) => b.badge_id)));
      } catch (error) {
        console.error('Error loading performance data:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [locale]
  );

  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.TRIVIA_PERFORMANCE);
      loadData();
    }, [loadData])
  );

  // Drives the reveal phase (see SKELETON_DELAY_MS). Branching on phase, not
  // loading, is what prevents the flash frames: a fast load goes blank →
  // content without ever mounting the skeleton, and a load that lands while
  // the skeleton is up keeps rendering it until MIN_VISIBLE elapses — the
  // dashboard never mounts for a frame just to be replaced.
  useEffect(() => {
    if (loading) {
      if (phase !== 'blank') return;
      const timer = setTimeout(() => {
        skeletonShownAtRef.current = Date.now();
        setPhase('skeleton');
      }, SKELETON_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (phase === 'skeleton') {
      const remaining = SKELETON_MIN_VISIBLE_MS - (Date.now() - skeletonShownAtRef.current);
      if (remaining <= 0) {
        setPhase('content');
        return;
      }
      const timer = setTimeout(() => setPhase('content'), remaining);
      return () => clearTimeout(timer);
    }
    if (phase === 'blank') setPhase('content');
  }, [loading, phase]);

  // Auto-open session results when navigated with sessionId param
  const autoOpenedRef = React.useRef(false);
  React.useEffect(() => {
    if (params.sessionId && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      handleSessionClick(Number(params.sessionId));
    }
  }, [params.sessionId]);

  // Handle session click to show results
  const handleSessionClick = useCallback(
    async (sessionId: number) => {
      try {
        setLoadingSession(true);
        const fullSession = await triviaService.getSessionById(sessionId, locale);
        if (fullSession && fullSession.questions && fullSession.answers) {
          setSelectedSession(fullSession);
          // Track viewing results from performance
          trackScreenView(Screens.TRIVIA_RESULTS);
          trackTriviaResultsView({
            mode: fullSession.trivia_mode as TriviaMode,
            sessionId: fullSession.id,
            categorySlug: fullSession.category_slug || undefined,
          });
        }
      } catch (error) {
        console.error('Error loading session:', error);
      } finally {
        setLoadingSession(false);
      }
    },
    [locale]
  );

  // Handle close results view
  const handleCloseResults = useCallback(() => {
    setSelectedSession(null);
  }, []);

  // The entrance theater (banner cells, week bars, mode rails) plays once per
  // screen VISIT, not per dashboard mount: peeking a session's results takes
  // the early-return branch below, which unmounts and later remounts the
  // whole dashboard subtree — without this latch every peek would replay the
  // full ~1s choreography.
  const introPlayedRef = React.useRef(false);
  const animateIntro = !introPlayedRef.current;

  // TriviaResults renders under the SAME native header as the rest of the
  // stack: keep the header, retitle it, and point its back chevron at the
  // results' close handler instead of popping the screen.
  const showingResults = !!(
    selectedSession &&
    selectedSession.questions &&
    selectedSession.answers
  );

  // Latch the intro after the dashboard's first real render (blank/skeleton
  // and results branches don't count — they never showed the theater). Keyed
  // on phase, NOT loading: loading flips false a cycle before the dashboard
  // mounts, and latching then would skip the choreography entirely.
  React.useEffect(() => {
    if (phase === 'content' && !showingResults) introPlayedRef.current = true;
  }, [phase, showingResults]);
  React.useEffect(() => {
    if (showingResults) {
      navigation.setOptions({
        title: t('testResults'),
        headerBackVisible: false,
        headerLeft: () => (
          <Pressable
            onPress={handleCloseResults}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID="trivia-results-header-back"
          >
            <ChevronLeft
              size={iconSizes.lg}
              color={isDark ? hexColors.dark.primary : hexColors.light.primary}
            />
          </Pressable>
        ),
      });
    } else {
      navigation.setOptions({
        title: t('triviaPerformance'),
        headerBackVisible: true,
        headerLeft: undefined,
      });
    }
  }, [navigation, showingResults, t, isDark, iconSizes.lg, handleCloseResults]);

  // Colors
  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const colors = isDark ? hexColors.dark : hexColors.light;
  const primaryColor = colors.primary;
  const accentColor = colors.accent;

  // Play time as "3h 24m" / "24m"; sub-minute play rounds up to 1m so any
  // real play never reads as zero.
  const formatPlayTime = (seconds: number) => {
    if (seconds <= 0) return t('durationMinutes', { minutes: 0 });
    const totalMinutes = Math.max(1, Math.round(seconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0
      ? t('durationHoursMinutes', { hours, minutes })
      : t('durationMinutes', { minutes: totalMinutes });
  };

  if (phase !== 'content') {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {phase === 'skeleton' && (
          <Animated.View
            entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
            style={{ flex: 1 }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              overScrollMode="never"
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={{ paddingBottom: bannerInset }}
            >
              <ContentContainer>
                <PerformanceSkeleton isDark={isDark} />
              </ContentContainer>
            </ScrollView>
          </Animated.View>
        )}
      </View>
    );
  }

  // Show results view for selected session
  if (selectedSession && selectedSession.questions && selectedSession.answers) {
    const wrongCount = selectedSession.total_questions - selectedSession.correct_answers;

    // Format date/time for subtitle
    const formatSessionDateTime = (dateString: string) => {
      const date = new Date(dateString);
      const dateStr = date.toLocaleDateString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const timeStr = date.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dateStr} • ${timeStr}`;
    };

    return (
      <TriviaResults
        correctAnswers={selectedSession.correct_answers}
        totalQuestions={selectedSession.total_questions}
        wrongCount={wrongCount}
        unansweredCount={0}
        timeExpired={false}
        elapsedTime={selectedSession.elapsed_time || 0}
        bestStreak={selectedSession.best_streak || 0}
        questions={selectedSession.questions}
        answers={selectedSession.answers}
        onClose={handleCloseResults}
        isDark={isDark}
        t={t}
        customTitle={t('testResults')}
        customSubtitle={formatSessionDateTime(selectedSession.completed_at)}
        triviaModeBadge={getTriviaModeBadge({
          mode: selectedSession.trivia_mode,
          categoryName: selectedSession.category?.name,
          categoryIcon: selectedSession.category?.icon,
          categoryColor: selectedSession.category?.color_hex,
          isDark,
          t,
        })}
        showBackButton={false}
        underNavigationHeader
        showReturnButton={false}
        // Inside the tabs the persistent tab-bar banner already covers the
        // bottom, so don't render a second one here (was a double banner);
        // reserve its height so the insights row clears it.
        showBanner={false}
        contentBottomInset={bannerInset}
        unavailableQuestionIds={selectedSession.unavailableQuestionIds}
        hideTimeAndStreak={selectedSession.trivia_mode === 'quick'}
      />
    );
  }

  // Top categories by accuracy across ALL play (already answered > 0).
  const displayCategories = [...categories]
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, DISPLAY_LIMITS.MAX_CATEGORIES);

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        contentContainerStyle={{ paddingBottom: bannerInset }}
      >
        <ContentContainer>
          <YStack marginVertical={spacing.lg} gap={spacing.xl}>
            {/* Lifetime band — the numbers the hub hero does NOT carry. The
                hero (accuracy ring / quizzes / streak / rank) stays the
                at-a-glance card; this screen is the deep dive. One gradient
                banner (the screen's single loud surface), all-contrast. */}
            <Animated.View
              entering={FadeIn.delay(50).duration(400).springify()}
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <LifetimeBanner
                answered={stats?.totalAnswered ?? 0}
                perfectGames={lifetime.perfectGames}
                bestStreak={stats?.bestStreak ?? 0}
                timePlayed={formatPlayTime(lifetime.totalPlaySeconds)}
                isDark={isDark}
                animateIntro={animateIntro}
                t={t}
              />
            </Animated.View>

            {/* Trailing week activity */}
            <Animated.View
              entering={FadeIn.delay(100).duration(400).springify()}
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <WeeklyActivityCard
                weeklyActivity={weeklyActivity}
                testsThisWeek={stats?.testsThisWeek ?? 0}
                isDark={isDark}
                animateIntro={animateIntro}
                t={t}
              />
            </Animated.View>

            {/* Per-mode breakdown */}
            {modeBreakdown.length > 0 && (
              <Animated.View
                entering={FadeIn.delay(150).duration(400).springify()}
                needsOffscreenAlphaCompositing={Platform.OS === 'android'}
              >
                <YStack gap={spacing.md}>
                  <Text.Title color={textColor}>{t('byMode')}</Text.Title>
                  <ModeBreakdownCard
                    rows={modeBreakdown}
                    isDark={isDark}
                    animateIntro={animateIntro}
                    t={t}
                  />
                </YStack>
              </Animated.View>
            )}

            {/* Accuracy by Category */}
            {displayCategories.length > 0 && (
              <Animated.View
                entering={FadeIn.delay(200).duration(400).springify()}
                needsOffscreenAlphaCompositing={Platform.OS === 'android'}
              >
                <YStack marginBottom={spacing.md} gap={spacing.xs}>
                  <XStack alignItems="center" justifyContent="space-between">
                    <Text.Title color={textColor} flex={1}>
                      {t('accuracyByCategory')}
                    </Text.Title>
                    {categories.length > displayCategories.length && (
                      <ViewAllButton
                        onPress={() => router.push('/(tabs)/trivia/categories')}
                        label={t('viewAll')}
                        color={primaryColor}
                      />
                    )}
                  </XStack>
                  <Text.Caption
                    color={isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
                    opacity={0.9}
                  >
                    {t('accuracyByCategorySubtitle')}
                  </Text.Caption>
                </YStack>

                <PerfCard
                  isDark={isDark}
                  onPress={() => router.push('/(tabs)/trivia/categories')}
                >
                  <YStack gap={spacing.lg}>
                    {displayCategories.map((category) => (
                      <CategoryProgressBar
                        key={category.slug}
                        category={category}
                        isDark={isDark}
                      />
                    ))}
                  </YStack>
                </PerfCard>
              </Animated.View>
            )}

            {/* Achievements Card */}
            <Animated.View
              entering={FadeIn.delay(250).duration(400).springify()}
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <PerfCard isDark={isDark} onPress={() => router.push('/badges')}>
                <YStack gap={spacing.md}>
                  <XStack alignItems="center" justifyContent="space-between">
                    <XStack alignItems="center" gap={spacing.sm}>
                      <Award size={iconSizes.sm} color={accentColor} />
                      <Text.Label fontFamily={FONT_FAMILIES.semibold} color={textColor}>
                        {t('achievements')}
                      </Text.Label>
                    </XStack>
                    <XStack alignItems="center" gap={spacing.xs}>
                      <Text.Caption
                        color={
                          isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary
                        }
                      >
                        {t('badgesEarnedCount', {
                          earned: String(
                            BADGE_DEFINITIONS.filter(
                              (b) => b.category === 'quiz' && earnedBadgeIds.has(b.id)
                            ).length
                          ),
                          total: String(
                            BADGE_DEFINITIONS.filter((b) => b.category === 'quiz').length
                          ),
                        })}
                      </Text.Caption>
                      <ChevronRight
                        size={iconSizes.sm}
                        color={
                          isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary
                        }
                      />
                    </XStack>
                  </XStack>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    overScrollMode="never"
                    contentContainerStyle={{ gap: spacing.xs }}
                  >
                    {BADGE_DEFINITIONS.filter((b) => b.category === 'quiz')
                      .sort((a, b) => {
                        const aEarned = earnedBadgeIds.has(a.id);
                        const bEarned = earnedBadgeIds.has(b.id);
                        if (aEarned && !bEarned) return -1;
                        if (!aEarned && bEarned) return 1;
                        return 0;
                      })
                      .map((badge) => (
                        <BadgeIcon
                          key={badge.id}
                          badgeId={badge.id}
                          size={iconSizes.xl}
                          isUnlocked={earnedBadgeIds.has(badge.id)}
                        />
                      ))}
                  </ScrollView>
                </YStack>
              </PerfCard>
            </Animated.View>

            {/* Recent Trivia */}
            {recentSessions.length > 0 && (
              <View>
                <XStack
                  alignItems="center"
                  justifyContent="space-between"
                  marginBottom={spacing.md}
                >
                  <Text.Title color={textColor}>{t('recentTests')}</Text.Title>
                  {totalSessionsCount > DISPLAY_LIMITS.MAX_ACTIVITIES && (
                    <ViewAllButton
                      onPress={() => router.push('/(tabs)/trivia/history')}
                      label={t('viewAll')}
                      color={primaryColor}
                    />
                  )}
                </XStack>

                <YStack gap={spacing.md}>
                  {recentSessions.map((session, index) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      isDark={isDark}
                      t={t}
                      dateFormat="relative"
                      onPress={() => handleSessionClick(session.id)}
                      testID={`trivia-session-${index}`}
                    />
                  ))}
                </YStack>
              </View>
            )}
          </YStack>
        </ContentContainer>
      </ScrollView>

      {/* Loading overlay for session fetch */}
      {loadingSession && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
      )}
    </View>
  );
}
