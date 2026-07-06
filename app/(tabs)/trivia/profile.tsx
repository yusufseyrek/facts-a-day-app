import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Button, ContentContainer } from '../../../src/components';
import { AvatarDisc } from '../../../src/components/AvatarDisc';
import { BadgeDetailSheet } from '../../../src/components/badges/BadgeDetailSheet';
import { BadgeIcon } from '../../../src/components/badges/BadgeIcon';
import { StarRating } from '../../../src/components/badges/StarRating';
import { GlassSurface } from '../../../src/components/GlassSurface';
import {
  Award,
  Check,
  Flame,
  Pencil,
  Trophy,
  User,
  WifiOff,
  Zap,
} from '../../../src/components/icons';
import { ScreenNameModal } from '../../../src/components/ScreenNameModal';
import { ShimmerPlaceholder } from '../../../src/components/ShimmerPlaceholder';
import { XStack, YStack } from '../../../src/components/Stacks';
import { FONT_FAMILIES, Text } from '../../../src/components/Typography';
import { LAYOUT } from '../../../src/config/app';
import { BADGE_DEFINITIONS, STAR_COLORS } from '../../../src/config/badges';
import { useTranslation } from '../../../src/i18n';
import { Screens, trackBadgeDetailView, trackScreenView } from '../../../src/services/analytics';
import * as api from '../../../src/services/api';
import { type BadgeWithStatus, getAllBadgesWithStatus } from '../../../src/services/badges';
import { useTabBarBannerInset } from '../../../src/services/tabBarBannerInset';
import * as userService from '../../../src/services/user';
import { hexColors, useTheme } from '../../../src/theme';
import { avatarColor, darkenColor, getContrastColor, hexToRgba } from '../../../src/utils/colors';
import { countryFlagEmoji } from '../../../src/utils/countryFlag';
import { getLucideIcon } from '../../../src/utils/iconMapper';
import { absoluteFillObject, androidRipple } from '../../../src/utils/styles';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { BadgeDefinition } from '../../../src/config/badges';
import type { TranslationKeys } from '../../../src/i18n/translations';
import type { TriviaProfileResponse, TriviaProfileStats } from '../../../src/services/api';

/**
 * Public/own trivia profile. Everything visible here is server-computed from
 * submitted results, so any claimed screen name resolves — including your own.
 * Badges for OTHER players are derived from the server aggregates through the
 * same thresholds the local badge system uses (BADGE_DEFINITIONS); your own
 * profile shows the locally-earned stars instead (they include master_scholar,
 * which needs per-question attempt history that never syncs).
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Server aggregate feeding each quiz badge (public profiles). master_scholar
 * is deliberately absent — no server analogue. */
const PUBLIC_BADGE_METRICS: Record<string, (s: TriviaProfileStats) => number> = {
  quiz_starter: (s) => s.games,
  sharp_mind: (s) => s.correct,
  perfectionist: (s) => s.perfect_games,
  quick_thinker: (s) => s.quick_games,
  category_ace: (s) => s.ace_categories,
  endurance: (s) => s.answered,
  streak_champion: (s) => s.best_streak,
};

/** BadgeWithStatus synthesized from the server aggregates, so public badges
 * ride the same star/glow pipeline as locally-earned ones. earned_at is
 * unknowable from aggregates — these statuses must never open the detail
 * sheet (it renders the earned date). */
function publicBadgeStatus(def: BadgeDefinition, stats: TriviaProfileStats): BadgeWithStatus {
  const value = PUBLIC_BADGE_METRICS[def.id]?.(stats) ?? 0;
  const next = def.stars.find((s) => value < s.threshold);
  return {
    definition: def,
    earnedStars: def.stars
      .filter((s) => value >= s.threshold)
      .map((s) => ({ star: s.star, earned_at: '' })),
    currentProgress: value,
    nextStar: next?.star ?? null,
    nextThreshold: next?.threshold ?? null,
  };
}

function formatScore(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Olympic medal accents for top-three standings — the leaderboard's rank
 * language, so a podium finish reads identically on both screens. */
const MEDAL_COLORS = ['#F5C518', '#B8C4CE', '#CD7F32'] as const;

function medalFor(rank: number): string | null {
  return rank >= 1 && rank <= 3 ? MEDAL_COLORS[rank - 1] : null;
}

// Circular accuracy dial in the player's accent hue: dotted watch-face track,
// frosted inner disc, translucent under-stroke standing in for glow (no SVG
// blur on RN), sheen-gradient arc and a comet-tip dot on the leading edge.
// Same construction as the hub hero's ring so the two dials read as one
// instrument family.
function AccuracyRing({
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
          <SvgLinearGradient id="profileRingSheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={progressColor} stopOpacity="1" />
            <Stop offset="100%" stopColor={progressColor} stopOpacity="0.62" />
          </SvgLinearGradient>
        </Defs>
        {/* Frosted inner disc gives the center value its own plate. */}
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
              stroke="url(#profileRingSheen)"
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
      {/* Center content, width-bound to the inner diameter */}
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

// One stat line of the hero's support column: frosted icon plate tightly
// coupled to its value + label/micro stack (hub-hero StatRow grammar).
function HeroStatRow({
  icon,
  plateBg,
  value,
  label,
  micro,
  valueMuted = false,
  contrastColor,
}: {
  icon: ReactNode;
  plateBg: string;
  value: number | string;
  label: string;
  micro?: string;
  valueMuted?: boolean;
  contrastColor: string;
}) {
  const { typography, iconSizes, spacing } = useResponsive();
  return (
    <XStack alignItems="center" gap={spacing.sm}>
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
        {micro !== undefined && (
          <Text.Tiny
            color={contrastColor}
            opacity={0.5}
            fontFamily={FONT_FAMILIES.medium}
            numberOfLines={1}
            flexShrink={1}
          >
            {micro}
          </Text.Tiny>
        )}
      </YStack>
    </XStack>
  );
}

/**
 * Card scaffold for the utility blocks below the hero: shadow + rounded card
 * fill, with the iOS 26 Liquid Glass backing when available — the same
 * treatment the performance screen's cards carry.
 */
function GlassCard({
  children,
  isDark,
  padding,
}: {
  children: ReactNode;
  isDark: boolean;
  padding?: number;
}) {
  const { spacing, radius, borderWidths } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  return (
    <View
      style={[
        profileShadow.card,
        // Hairline border on EVERY path (the leaderboard card's treatment,
        // and what this screen's own skeleton already draws) — shadow alone
        // let the white cards wash into the light background. overflow stays
        // glass-only: clipping the non-glass frame would kill the iOS shadow.
        {
          borderRadius: radius.lg,
          borderWidth: borderWidths.hairline,
          borderColor: colors.border,
        },
        useGlass && { overflow: 'hidden' as const },
      ]}
    >
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
    </View>
  );
}

/** One cell of the lifetime strip under the hero: tinted square plate inline
 * with the headline figure, quiet uppercase label on its own full-width row
 * (two lines, per the lifetime banner's rationale — "PERFEKTE QUIZZE" must
 * wrap, not truncate). The two cells share ONE hairline-partitioned card so
 * the band reads as a hero footer, not two floating half-empty tiles. */
function BandCell({
  icon,
  hue,
  value,
  fraction,
  label,
  valueMuted = false,
  isDark,
}: {
  icon: ReactNode;
  hue: string;
  value: string;
  /** Baseline denominator rendered as " / N" beside the figure (the
   * leaderboard's score-fraction grammar). */
  fraction?: string;
  label: string;
  /** Dormant-value cue, same device as the hero's zero streak. */
  valueMuted?: boolean;
  isDark: boolean;
}) {
  const { spacing, radius, iconSizes, typography } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  return (
    <YStack
      flex={1}
      gap={spacing.xs}
      paddingVertical={spacing.sm}
      paddingHorizontal={spacing.sm}
      accessible
      accessibilityLabel={`${label}: ${value}${fraction ? ` / ${fraction}` : ''}`}
    >
      <XStack alignItems="center" gap={spacing.sm}>
        <YStack
          width={iconSizes.xl}
          height={iconSizes.xl}
          borderRadius={radius.sm}
          backgroundColor={`${hue}20`}
          justifyContent="center"
          alignItems="center"
        >
          {icon}
        </YStack>
        {/* flexShrink+minWidth bound the figure to the half-width cell —
            Yoga's flexShrink:0 default would let a five-digit lifetime count
            run past the card edge instead of ellipsizing. */}
        <YStack
          height={typography.lineHeight.title}
          justifyContent="center"
          flexShrink={1}
          minWidth={0}
        >
          <XStack alignItems="baseline">
            <Text.Title
              color={colors.text}
              fontFamily={FONT_FAMILIES.bold}
              opacity={valueMuted ? 0.55 : 1}
              numberOfLines={1}
              flexShrink={1}
            >
              {value}
            </Text.Title>
            {fraction !== undefined && (
              <Text.Caption color={colors.textMuted} fontSize={typography.fontSize.tiny}>
                {` / ${fraction}`}
              </Text.Caption>
            )}
          </XStack>
        </YStack>
      </XStack>
      <Text.Tiny
        color={colors.textMuted}
        textTransform="uppercase"
        letterSpacing={0.8}
        fontFamily={FONT_FAMILIES.semibold}
        numberOfLines={2}
      >
        {label}
      </Text.Tiny>
    </YStack>
  );
}

/**
 * One most-played-category row: the established plate/name/figures anatomy
 * plus the performance screen's thin animated gradient accuracy RAIL in the
 * category's hue (ModeRow anatomy verbatim — thin + gradient + animated,
 * where flat sm-height bars are that screen's OTHER block's language). A real
 * component, not an inline map body: the sweep needs hooks per row. The fill
 * sweep is latched to the screen's intro — it plays on the fast
 * blank→content path only, never after the skeleton or on a locale refetch.
 */
function CategoryRow({
  cat,
  meta,
  index,
  isDark,
  animateIntro,
  t,
}: {
  cat: TriviaProfileResponse['top_categories'][number];
  meta?: { name: string; icon: string | null; color_hex: string | null };
  index: number;
  isDark: boolean;
  animateIntro: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}) {
  const { spacing, radius, iconSizes, typography } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  const catColor = meta?.color_hex || colors.primary;
  const accuracy = cat.answered > 0 ? Math.round((cat.correct / cat.answered) * 100) : 0;
  const hasFill = accuracy > 0;

  // Latched at mount: a later prop flip must not re-trigger the theater.
  const shouldAnimate = useRef(animateIntro).current;
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
      // Third arg: reduce-motion must skip the stagger too, not just the tween.
      ReduceMotion.System
    );
  }, [shouldAnimate, hasFill, index, fill]);

  // Width stays the static percent and only scaleX animates, so the
  // gradient's endpoint hue is correct at every frame of the sweep.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  return (
    <XStack alignItems="center" gap={spacing.sm}>
      <YStack
        width={iconSizes.xl}
        height={iconSizes.xl}
        borderRadius={radius.sm}
        backgroundColor={`${catColor}20`}
        justifyContent="center"
        alignItems="center"
      >
        {getLucideIcon(meta?.icon ?? undefined, iconSizes.xs, catColor)}
      </YStack>
      <YStack flex={1}>
        <Text.Label color={colors.text} fontFamily={FONT_FAMILIES.medium} numberOfLines={1}>
          {meta?.name ?? cat.category_slug}
        </Text.Label>
        <Text.Caption color={colors.textMuted} fontSize={typography.fontSize.tiny}>
          {t('leaderboardGamesCount', { count: String(cat.games) })}
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
                  width: `${accuracy}%`,
                  borderRadius: radius.full,
                  overflow: 'hidden',
                  transformOrigin: 'left',
                },
                fillStyle,
              ]}
            >
              <LinearGradient
                colors={[catColor, darkenColor(catColor, 0.22)]}
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
          {`${accuracy}%`}
        </Text.Label>
        <Text.Caption color={colors.textMuted} fontSize={typography.fontSize.tiny}>
          {`${formatScore(cat.correct)}/${formatScore(cat.answered)}`}
        </Text.Caption>
      </YStack>
    </XStack>
  );
}

/** Loading skeleton mirroring the loaded layout from the same tokens, so the
 * swap to real data doesn't shift anything. The hero frame renders the REAL
 * accent gradient (the accent derives from the requested screen name, known
 * before the fetch) — only the per-player marks shimmer on top. */
function ProfileSkeleton({ accent, isDark }: { accent: string; isDark: boolean }) {
  const { spacing, radius, media, typography, iconSizes, borderWidths } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  const contrastColor = getContrastColor(accent);
  const onDark = contrastColor === '#FFFFFF';
  const markColor = onDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.32)';
  const circleA = onDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const circleB = onDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)';
  const hairline = onDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  const { lineHeight } = typography;
  const discSize = media.topicCardSize * 0.5;
  const s = media.topicCardSize * 0.7;

  return (
    <YStack marginVertical={spacing.lg} gap={spacing.xl}>
      <View style={[profileGlow.card, { borderRadius: radius.xl, shadowColor: accent }]}>
        <LinearGradient
          colors={[accent, darkenColor(accent, 0.22)]}
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
          <YStack padding={spacing.lg} gap={spacing.lg}>
            <XStack alignItems="center" gap={spacing.md}>
              <ShimmerPlaceholder
                width={discSize}
                height={discSize}
                borderRadius={discSize / 2}
                color={markColor}
              />
              {/* flex:1 (the loaded identity column's own prop) — without it
                  this stack is auto-width and the percent marks resolve to 0. */}
              <YStack flex={1} gap={spacing.xs}>
                <ShimmerPlaceholder width="55%" height={lineHeight.title} color={markColor} />
                <ShimmerPlaceholder width="40%" height={lineHeight.caption} color={markColor} />
              </YStack>
            </XStack>
            <View style={{ height: 1, backgroundColor: hairline }} />
            <XStack alignItems="center" gap={spacing.md}>
              <YStack flex={1} alignItems="center">
                <ShimmerPlaceholder
                  width={iconSizes.heroXl}
                  height={iconSizes.heroXl}
                  borderRadius={iconSizes.heroXl / 2}
                  color={markColor}
                />
              </YStack>
              <YStack width={1} alignSelf="stretch" backgroundColor={hairline} />
              <YStack flex={1} gap={spacing.md}>
                {[0, 1].map((i) => (
                  <XStack key={i} alignItems="center" gap={spacing.sm}>
                    <ShimmerPlaceholder
                      width={iconSizes.xl}
                      height={iconSizes.xl}
                      borderRadius={iconSizes.xl / 2}
                      color={markColor}
                    />
                    <ShimmerPlaceholder width="60%" height={lineHeight.label} color={markColor} />
                  </XStack>
                ))}
              </YStack>
            </XStack>
          </YStack>
        </LinearGradient>
      </View>

      {/* Lifetime strip: one hairline-partitioned card, cell = plate inline
          with the value mark, label mark on its own row (BandCell anatomy). */}
      <YStack
        backgroundColor={colors.cardBackground}
        borderRadius={radius.lg}
        borderWidth={borderWidths.hairline}
        borderColor={colors.border}
        padding={spacing.md}
      >
        <XStack alignItems="stretch">
          {[0, 1].map((i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <YStack
                  width={borderWidths.hairline}
                  alignSelf="stretch"
                  marginVertical={spacing.xs}
                  backgroundColor={colors.border}
                />
              )}
              <YStack
                flex={1}
                gap={spacing.xs}
                paddingVertical={spacing.sm}
                paddingHorizontal={spacing.sm}
              >
                <XStack alignItems="center" gap={spacing.sm}>
                  <ShimmerPlaceholder
                    width={iconSizes.xl}
                    height={iconSizes.xl}
                    borderRadius={radius.sm}
                  />
                  <ShimmerPlaceholder width="45%" height={lineHeight.title} />
                </XStack>
                <ShimmerPlaceholder width="70%" height={lineHeight.tiny} />
              </YStack>
            </React.Fragment>
          ))}
        </XStack>
      </YStack>

      {/* Standing card: header mark + the loaded card's own row metrics
          (xs card padding, plate/label/right-stack rows, inset dividers). */}
      <YStack gap={spacing.md}>
        <ShimmerPlaceholder width={120} height={lineHeight.title} />
        <YStack
          backgroundColor={colors.cardBackground}
          borderRadius={radius.lg}
          borderWidth={borderWidths.hairline}
          borderColor={colors.border}
          padding={spacing.xs}
        >
          {[0, 1, 2].map((i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <View
                  style={{
                    height: borderWidths.hairline,
                    backgroundColor: colors.border,
                    marginHorizontal: spacing.md,
                  }}
                />
              )}
              <XStack
                alignItems="center"
                gap={spacing.sm}
                paddingVertical={spacing.sm}
                paddingHorizontal={spacing.md}
              >
                <ShimmerPlaceholder
                  width={iconSizes.xl}
                  height={iconSizes.xl}
                  borderRadius={radius.sm}
                />
                <ShimmerPlaceholder width="40%" height={lineHeight.label} />
                <View style={{ flex: 1 }} />
                <YStack alignItems="flex-end" gap={2}>
                  <ShimmerPlaceholder width={44} height={lineHeight.label} />
                  <ShimmerPlaceholder width={56} height={lineHeight.tiny} />
                </YStack>
              </XStack>
            </React.Fragment>
          ))}
        </YStack>
      </YStack>
    </YStack>
  );
}

/**
 * Skeleton reveal heuristic (the Suspense "just-noticeable delay" pair — the
 * performance screen's exact values). Loads faster than DELAY go blank →
 * content without ever mounting the skeleton (the push transition covers the
 * gap), and once the skeleton IS shown it stays up for MIN_VISIBLE so a
 * response landing just past the delay doesn't flash skeleton → content
 * within a few frames either.
 */
const SKELETON_DELAY_MS = 300;
const SKELETON_MIN_VISIBLE_MS = 500;

export default function TriviaProfileScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const params = useLocalSearchParams<{ name?: string }>();
  const isDark = theme === 'dark';
  const { spacing, radius, iconSizes, borderWidths, media, typography, config } = useResponsive();
  const bannerInset = useTabBarBannerInset();
  const colors = hexColors[theme];

  // Route param when viewing another player. Absent = own-profile mode (the
  // settings entry): the name resolves from the local identity at load time.
  const paramName = (params.name ?? '').trim();

  const [profile, setProfile] = useState<TriviaProfileResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Own-profile mode with no claimed identity: show the profile-setup state
  // instead of a player-lookup failure. False as soon as an identity exists.
  const [needsClaim, setNeedsClaim] = useState(false);
  // Non-404 load failure (network/server), rendered as a retry state — the
  // not-found copy ("no player with that name") would read as "your account
  // is gone" when the own-profile entry merely lost connectivity.
  const [loadFailed, setLoadFailed] = useState(false);
  // Resolved identity name in own-profile mode; only feeds the accent while
  // the fetch is in flight (the loaded hero derives from the response).
  const [ownName, setOwnName] = useState<string | null>(null);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  // What the loading window shows: 'blank' → (only if slow) 'skeleton' →
  // 'content'. Never regresses; 'content' is only reachable once loading is
  // false, so the loaded branch always renders real data.
  const [phase, setPhase] = useState<'blank' | 'skeleton' | 'content'>('blank');
  const skeletonShownAtRef = useRef(0);
  const [isSelf, setIsSelf] = useState(false);
  // Own profile: full local badge statuses (they include master_scholar, which
  // needs per-question attempt history that never syncs to the server).
  const [ownBadges, setOwnBadges] = useState<Map<string, BadgeWithStatus> | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithStatus | null>(null);
  const [badgeSheetVisible, setBadgeSheetVisible] = useState(false);
  const [categoryMeta, setCategoryMeta] = useState<
    Map<string, { name: string; icon: string | null; color_hex: string | null }>
  >(new Map());

  useEffect(() => {
    trackScreenView(Screens.TRIVIA_PROFILE);
  }, []);

  // Latest-wins guard: identity changes and locale refetches can overlap, and
  // a stale response committing last would show the previous name and flip
  // isSelf false. Only the newest load() invocation may write state.
  const loadSeqRef = useRef(0);
  // isSelf, readable from the identity-change listener without resubscribing.
  const isSelfRef = useRef(false);
  // A rename while this screen shows the renamed identity leaves a
  // param-routed name stale (the leaderboard pushes ?name=<you> for your own
  // row) — refetching the old name would 404 into "no player with that name".
  // The listener binds the screen to the identity's new name instead.
  const selfNameOverrideRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const fresh = () => seq === loadSeqRef.current;

    const identity = await userService.getProfile().catch(() => null);
    if (!fresh()) return;

    let target = selfNameOverrideRef.current ?? paramName;
    if (!target) {
      if (!identity) {
        setNeedsClaim(true);
        setProfile(null);
        setLoading(false);
        return;
      }
      target = identity.screenName;
    }
    if (identity) {
      setOwnName(identity.screenName);
      setNeedsClaim(false);
    }
    setLoading(true);
    setNotFound(false);
    setLoadFailed(false);
    try {
      const data = await api.getTriviaProfile(target);
      if (!fresh()) return;
      setProfile(data);
      const self =
        !!identity && identity.screenName.toLowerCase() === data.screen_name.toLowerCase();
      setIsSelf(self);
      isSelfRef.current = self;

      if (self) {
        const all = await getAllBadgesWithStatus().catch(() => [] as BadgeWithStatus[]);
        if (!fresh()) return;
        setOwnBadges(new Map(all.map((b) => [b.definition.id, b])));
      } else {
        setOwnBadges(null);
      }

      // Localized names/icons for the top-category slugs (cached metadata).
      if (data.top_categories.length > 0) {
        const metadata = await api.getMetadata(locale).catch(() => null);
        if (!fresh()) return;
        if (metadata) {
          setCategoryMeta(
            new Map(
              metadata.categories.map((c) => [
                c.slug,
                { name: c.name, icon: c.icon ?? null, color_hex: c.color_hex ?? null },
              ])
            )
          );
        }
      }
    } catch (error) {
      if (!fresh()) return;
      if ((error as { status?: number })?.status === 404) {
        setNotFound(true);
      } else {
        console.error('Error loading trivia profile:', error);
        setLoadFailed(true);
      }
    } finally {
      if (fresh()) setLoading(false);
    }
  }, [paramName, locale]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch whenever the identity changes — the claim/rename dialog on THIS
  // screen (saveIdentity emits before the dialog's onSaved fires) and edits
  // made on any other screen while this one sits in the stack. This is the
  // needsClaim → loaded transition and the rename/avatar refresh in one hook.
  useEffect(
    () =>
      userService.onIdentityChange((identity) => {
        if (!identity) {
          // Account deleted: drop any rename binding so own-profile mode
          // falls back to the setup state, not a 404 on the dead name.
          selfNameOverrideRef.current = null;
        } else if (isSelfRef.current) {
          selfNameOverrideRef.current = identity.screenName;
        }
        load();
      }),
    [load]
  );

  // Drives the reveal phase (see SKELETON_DELAY_MS). Branching on phase, not
  // loading, is what prevents the flash frames: a fast load goes blank →
  // content without ever mounting the skeleton, and a load that lands while
  // the skeleton is up keeps rendering it until MIN_VISIBLE elapses — the
  // loaded screen never mounts for a frame just to be replaced. Phase never
  // regresses, so a mid-visit reload (locale change) keeps the settled
  // content up instead of bouncing back through the skeleton.
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

  // Entrance choreography plays only on the fast path (blank → content, where
  // the push transition covers it). Once a skeleton was up its frames are
  // already painted — re-entering the hero from opacity 0 over an area the
  // skeleton had just drawn opaque was the load flash.
  const animateIntro = skeletonShownAtRef.current === 0;

  // The whole card family derives from ONE accent: gradient end, glow, text
  // contrast and plate alphas — the trivia tile signature.
  const accent = avatarColor(profile?.screen_name || paramName || ownName || '?', colors);
  const contrastColor = getContrastColor(accent);
  const onDark = contrastColor === '#FFFFFF';
  const plateBg = onDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)';
  const circleA = onDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const circleB = onDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)';
  // Hairline divider between hero halves; one step fainter than the deco
  // circles so it reads as structure, not decoration.
  const hairline = onDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  const discSize = media.topicCardSize * 0.5;
  // Deco-circle driver: identical to TriviaGridCard's iconContainerSize so the
  // corner texture matches the grid tiles.
  const s = media.topicCardSize * 0.7;

  // Quiz badges to display: public = the server-derivable subset; self = all.
  const quizBadges = useMemo(() => {
    const all = BADGE_DEFINITIONS.filter((b) => b.category === 'quiz');
    if (isSelf) return all;
    return all.filter((b) => PUBLIC_BADGE_METRICS[b.id] !== undefined);
  }, [isSelf]);

  const badgeStatusFor = useCallback(
    (def: BadgeDefinition): BadgeWithStatus => {
      if (isSelf && ownBadges?.has(def.id)) return ownBadges.get(def.id)!;
      if (profile) return publicBadgeStatus(def, profile.stats);
      return publicBadgeStatus(def, {} as TriviaProfileStats);
    },
    [isSelf, ownBadges, profile]
  );

  // The sheet shows locally-earned dates and progress, which only exist for
  // the viewer's own profile; public badges stay display-only. Gated on the
  // status being locally SOURCED, not just isSelf: if the local badge read
  // failed, badgeStatusFor fell back to a synthesized status whose empty
  // earned_at would render "Invalid Date" in the sheet.
  const openBadgeDetail = useCallback(
    (status: BadgeWithStatus) => {
      if (!isSelf || !ownBadges?.has(status.definition.id)) return;
      trackBadgeDetailView({
        badgeId: status.definition.id,
        category: status.definition.category,
        earnedStars: status.earnedStars.length,
      });
      setSelectedBadge(status);
      setBadgeSheetVisible(true);
    },
    [isSelf, ownBadges]
  );

  const windowRows: { key: 'today' | 'week' | 'all'; label: string }[] = [
    { key: 'today', label: t('today') },
    { key: 'week', label: t('leaderboardWeek') },
    { key: 'all', label: t('leaderboardAllTime') },
  ];

  // Gate on phase ALONE (performance.tsx's exact guard): 'content' is only
  // reachable once the first load completes, and a mid-visit refetch (locale
  // change re-runs load) must keep the settled content mounted — adding
  // `loading ||` here would blank the screen and replay every entrance.
  if (phase !== 'content') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
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
              contentContainerStyle={{ paddingBottom: bannerInset + spacing.xl }}
            >
              <ContentContainer>
                <ProfileSkeleton accent={accent} isDark={isDark} />
              </ContentContainer>
            </ScrollView>
          </Animated.View>
        )}
      </View>
    );
  }

  // Own profile before any name is claimed: a proper setup state with the
  // picker behind an explicit button (the settings row used to pop the dialog
  // straight over the list). After a claim, needsClaim drops with the reload
  // and the in-flight branch below covers the first fetch with the skeleton.
  if (needsClaim) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          padding={spacing.xl}
          gap={spacing.lg}
        >
          <YStack
            width={iconSizes.hero}
            height={iconSizes.hero}
            borderRadius={iconSizes.hero / 2}
            backgroundColor={`${colors.primary}15`}
            justifyContent="center"
            alignItems="center"
          >
            <User size={iconSizes.lg} color={colors.primary} />
          </YStack>
          <YStack alignItems="center" gap={spacing.sm} maxWidth={LAYOUT.MAX_CONTENT_WIDTH}>
            <Text.Headline textAlign="center">{t('profileSetupTitle')}</Text.Headline>
            <Text.Body textAlign="center" color="$textSecondary">
              {t('profileSetupDescription')}
            </Text.Body>
          </YStack>
          <YStack width="100%" maxWidth={280} marginTop={spacing.sm}>
            <Button onPress={() => setNameModalVisible(true)}>{t('screenNameTitle')}</Button>
          </YStack>
        </YStack>
        {/* The identity-change subscription reloads after a save; the dialog
            closes itself, so onSaved has nothing left to do. */}
        <ScreenNameModal
          visible={nameModalVisible}
          onClose={() => setNameModalVisible(false)}
          onSaved={() => {}}
          currentName={null}
          source="settings"
        />
      </View>
    );
  }

  // In-flight with nothing settled to show (the first fetch right after a
  // claim): phase reached 'content' long ago, so the phase machinery can't
  // cover this window — show the skeleton instead of flashing not-found.
  if (!profile && loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: bannerInset + spacing.xl }}
        >
          <ContentContainer>
            <ProfileSkeleton accent={accent} isDark={isDark} />
          </ContentContainer>
        </ScrollView>
      </View>
    );
  }

  // Network/server failure with no settled content: retry, not "no player".
  if (loadFailed && !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          padding={spacing.xl}
          gap={spacing.lg}
        >
          <YStack
            width={iconSizes.hero}
            height={iconSizes.hero}
            borderRadius={iconSizes.hero / 2}
            backgroundColor={`${colors.primary}15`}
            justifyContent="center"
            alignItems="center"
          >
            <WifiOff size={iconSizes.lg} color={colors.primary} />
          </YStack>
          <YStack alignItems="center" gap={spacing.sm} maxWidth={LAYOUT.MAX_CONTENT_WIDTH}>
            <Text.Body textAlign="center" color="$textSecondary">
              {t('profileLoadFailed')}
            </Text.Body>
          </YStack>
          <YStack width="100%" maxWidth={280}>
            <Button onPress={() => load()}>{t('tryAgain')}</Button>
          </YStack>
        </YStack>
      </View>
    );
  }

  if (notFound || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <YStack flex={1} justifyContent="center" alignItems="center" gap={spacing.md}>
          <YStack
            width={iconSizes.hero}
            height={iconSizes.hero}
            borderRadius={iconSizes.hero / 2}
            backgroundColor={`${colors.primary}15`}
            justifyContent="center"
            alignItems="center"
          >
            <Trophy size={iconSizes.lg} color={colors.primary} />
          </YStack>
          <Text.Label color="$textMuted">{t('profileNotFound')}</Text.Label>
        </YStack>
      </View>
    );
  }

  const { stats } = profile;
  const flag = countryFlagEmoji(profile.country_code);
  const earnedStarTotal = quizBadges.reduce(
    (sum, def) => sum + badgeStatusFor(def).earnedStars.length,
    0
  );

  // "YYYY-MM-DD" → localized long date. Parsed at midday so negative UTC
  // offsets can't shift the displayed day backwards; a raw new Date(isoDate)
  // parses as UTC midnight.
  const memberSinceDate = (() => {
    const d = new Date(`${profile.member_since}T12:00:00`);
    return Number.isNaN(d.getTime())
      ? profile.member_since
      : d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: bannerInset + spacing.xl }}
      >
        <ContentContainer>
          <YStack marginVertical={spacing.lg} gap={spacing.xl}>
            {/* Identity hero — the player's accent hue in the trivia gradient
                signature, promoted to the hub hero's full spec: layered deco
                circles, accent glow, and the accuracy dial beside the vitals. */}
            <Animated.View
              entering={
                animateIntro
                  ? FadeInDown.delay(50).duration(400).springify().reduceMotion(ReduceMotion.System)
                  : undefined
              }
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <View style={[profileGlow.card, { borderRadius: radius.xl, shadowColor: accent }]}>
                <LinearGradient
                  colors={[accent, darkenColor(accent, 0.22)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: radius.xl, overflow: 'hidden' }}
                >
                  {/* Layered decorative circles for depth (grid-card geometry) */}
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
                    {/* Identity row */}
                    <XStack alignItems="center" gap={spacing.md}>
                      <AvatarDisc
                        name={profile.screen_name}
                        avatar={profile.avatar}
                        color={accent}
                        size={discSize}
                        borderColor={plateBg}
                      />
                      <YStack flex={1} gap={2}>
                        <XStack alignItems="center" gap={spacing.sm}>
                          <Text.Title
                            color={contrastColor}
                            fontFamily={FONT_FAMILIES.bold}
                            numberOfLines={1}
                            flexShrink={1}
                          >
                            {`${flag ? `${flag} ` : ''}${profile.screen_name}`}
                          </Text.Title>
                          {isSelf && (
                            <XStack
                              paddingHorizontal={spacing.sm}
                              paddingVertical={2}
                              borderRadius={radius.full}
                              backgroundColor={plateBg}
                            >
                              <Text.Tiny color={contrastColor} fontFamily={FONT_FAMILIES.semibold}>
                                {t('leaderboardYou')}
                              </Text.Tiny>
                            </XStack>
                          )}
                        </XStack>
                        <Text.Caption color={contrastColor} opacity={0.8} numberOfLines={1}>
                          {t('memberSince', { date: memberSinceDate })}
                        </Text.Caption>
                      </YStack>
                      {/* Own profile: edit affordance in the hero's plate
                          tone, opening the claim/rename dialog prefilled. */}
                      {isSelf && (
                        <Pressable
                          onPress={() => setNameModalVisible(true)}
                          accessibilityRole="button"
                          accessibilityLabel={t('screenNameChangeTitle')}
                          hitSlop={spacing.xs}
                          style={({ pressed }) => ({
                            width: iconSizes.xl,
                            height: iconSizes.xl,
                            borderRadius: iconSizes.xl / 2,
                            backgroundColor: plateBg,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.7 : 1,
                            transform: [{ scale: pressed ? 0.92 : 1 }],
                          })}
                        >
                          <Pencil size={iconSizes.xs} color={contrastColor} />
                        </Pressable>
                      )}
                    </XStack>

                    {/* Structural hairline between identity and the dial row */}
                    <View style={{ height: 1, backgroundColor: hairline }} />

                    {/* Dial row: accuracy ring | hairline | vitals column */}
                    <XStack alignItems="center" gap={spacing.md}>
                      <YStack flex={1} alignItems="center" gap={spacing.sm}>
                        <AccuracyRing
                          percentage={stats.accuracy}
                          size={iconSizes.heroXl}
                          strokeWidth={borderWidths.extraHeavy}
                          progressColor={contrastColor}
                          trackColor={plateBg}
                          innerFill={circleA}
                        >
                          <XStack alignItems="baseline">
                            <Text.Display color={contrastColor} numberOfLines={1}>
                              {stats.accuracy}
                            </Text.Display>
                            <Text.Caption
                              fontFamily={FONT_FAMILIES.semibold}
                              color={contrastColor}
                              opacity={0.7}
                            >
                              %
                            </Text.Caption>
                          </XStack>
                        </AccuracyRing>
                        <Text.Tiny
                          color={contrastColor}
                          opacity={0.72}
                          textTransform="uppercase"
                          letterSpacing={1}
                          fontFamily={FONT_FAMILIES.semibold}
                          numberOfLines={1}
                        >
                          {t('accuracy')}
                        </Text.Tiny>
                      </YStack>

                      <YStack
                        width={1}
                        alignSelf="stretch"
                        marginVertical={spacing.xs}
                        backgroundColor={hairline}
                      />

                      <YStack flex={1} gap={spacing.md}>
                        <HeroStatRow
                          icon={<Zap size={iconSizes.xs} color={contrastColor} />}
                          plateBg={plateBg}
                          value={formatScore(stats.games)}
                          label={t('quizzes')}
                          contrastColor={contrastColor}
                        />
                        {/* Streak value muted at 0 as a dormant comeback cue */}
                        <HeroStatRow
                          icon={<Flame size={iconSizes.xs} color={contrastColor} />}
                          plateBg={plateBg}
                          value={stats.current_streak}
                          label={t('dayStreak')}
                          micro={t('best', { count: stats.best_streak })}
                          valueMuted={stats.current_streak === 0}
                          contrastColor={contrastColor}
                        />
                      </YStack>
                    </XStack>
                  </YStack>
                </LinearGradient>
              </View>
            </Animated.View>

            {/* Lifetime numbers the hero does NOT show, as one joined strip —
                a hero footer in the quiet-card register. Semantic hues stay on
                the plates only; the player accent remains hero-exclusive. */}
            <Animated.View
              entering={
                animateIntro
                  ? FadeInDown.delay(100)
                      .duration(400)
                      .springify()
                      .reduceMotion(ReduceMotion.System)
                  : undefined
              }
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <GlassCard isDark={isDark} padding={spacing.md}>
                <XStack alignItems="stretch">
                  <BandCell
                    icon={<Award size={iconSizes.xs} color={colors.warning} />}
                    hue={colors.warning}
                    value={formatScore(stats.perfect_games)}
                    label={t('perfectGames')}
                    valueMuted={stats.perfect_games === 0}
                    isDark={isDark}
                  />
                  <YStack
                    width={borderWidths.hairline}
                    alignSelf="stretch"
                    marginVertical={spacing.xs}
                    backgroundColor={colors.border}
                  />
                  <BandCell
                    icon={<Check size={iconSizes.xs} color={colors.neonGreen} />}
                    hue={colors.neonGreen}
                    value={formatScore(stats.correct)}
                    fraction={formatScore(stats.answered)}
                    label={t('correct')}
                    isDark={isDark}
                  />
                </XStack>
              </GlassCard>
            </Animated.View>

            {/* Standing per leaderboard window, in the board's medal language */}
            <Animated.View
              entering={
                animateIntro
                  ? FadeInDown.delay(150)
                      .duration(400)
                      .springify()
                      .reduceMotion(ReduceMotion.System)
                  : undefined
              }
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <YStack gap={spacing.md}>
                <Text.Title color={colors.text}>{t('leaderboard')}</Text.Title>
                <GlassCard isDark={isDark} padding={spacing.xs}>
                  {windowRows.map(({ key, label }, index) => {
                    const standing = profile.windows[key];
                    const medal = standing ? medalFor(standing.rank) : null;
                    return (
                      <React.Fragment key={key}>
                        {index > 0 && (
                          <View
                            style={{
                              height: borderWidths.hairline,
                              backgroundColor: colors.border,
                              marginHorizontal: spacing.md,
                            }}
                          />
                        )}
                        {/* Podium rows carry the board's you-row mechanism
                            transposed to the medal hue: flat tint on the inner
                            row (never the card frame) + bold label — tint and
                            bold travel together, as on the board. */}
                        <XStack
                          alignItems="center"
                          gap={spacing.sm}
                          paddingVertical={spacing.sm}
                          paddingHorizontal={spacing.md}
                          borderRadius={medal ? radius.md : undefined}
                          backgroundColor={medal ? hexToRgba(medal, 0.1) : undefined}
                        >
                          <YStack
                            width={iconSizes.xl}
                            height={iconSizes.xl}
                            borderRadius={radius.sm}
                            backgroundColor={
                              standing ? `${medal ?? colors.warning}20` : `${colors.textMuted}15`
                            }
                            justifyContent="center"
                            alignItems="center"
                          >
                            {/* Unranked keeps a full-strength muted trophy: a
                                half-opacity icon in a 10-alpha plate read as
                                broken, not merely empty. */}
                            <Trophy
                              size={iconSizes.xs}
                              color={standing ? (medal ?? colors.warning) : colors.textMuted}
                            />
                          </YStack>
                          <Text.Label
                            flex={1}
                            color={standing ? colors.text : colors.textSecondary}
                            fontFamily={medal ? FONT_FAMILIES.bold : FONT_FAMILIES.medium}
                          >
                            {label}
                          </Text.Label>
                          {standing ? (
                            <YStack alignItems="flex-end">
                              <Text.Label
                                color={medal ?? colors.text}
                                fontFamily={FONT_FAMILIES.bold}
                              >
                                {`#${standing.rank}`}
                              </Text.Label>
                              <Text.Caption
                                color={colors.textMuted}
                                fontSize={typography.fontSize.tiny}
                              >
                                {`${formatScore(standing.score)} / ${formatScore(standing.total_questions)}`}
                              </Text.Caption>
                            </YStack>
                          ) : (
                            <Text.Caption color={colors.textMuted}>
                              {t('profileNotRanked')}
                            </Text.Caption>
                          )}
                        </XStack>
                      </React.Fragment>
                    );
                  })}
                </GlassCard>
              </YStack>
            </Animated.View>

            {/* Most-played categories, each with the performance screen's
                animated accuracy rail (a bare % hid whether it meant 2
                answers or 200). */}
            {profile.top_categories.length > 0 && (
              <Animated.View
                entering={
                  animateIntro
                    ? FadeInDown.delay(200)
                        .duration(400)
                        .springify()
                        .reduceMotion(ReduceMotion.System)
                    : undefined
                }
                needsOffscreenAlphaCompositing={Platform.OS === 'android'}
              >
                <YStack gap={spacing.md}>
                  <Text.Title color={colors.text}>{t('profileTopCategories')}</Text.Title>
                  <GlassCard isDark={isDark}>
                    <YStack gap={spacing.lg}>
                      {profile.top_categories.map((cat, index) => (
                        <CategoryRow
                          key={cat.category_slug}
                          cat={cat}
                          meta={categoryMeta.get(cat.category_slug)}
                          index={index}
                          isDark={isDark}
                          animateIntro={animateIntro}
                          t={t}
                        />
                      ))}
                    </YStack>
                  </GlassCard>
                </YStack>
              </Animated.View>
            )}

            {/* Quiz achievements: gold glow scales with earned stars; own
                badges open the detail sheet (public ones have no earned dates
                or local progress to show). */}
            <Animated.View
              entering={
                animateIntro
                  ? FadeInDown.delay(250)
                      .duration(400)
                      .springify()
                      .reduceMotion(ReduceMotion.System)
                  : undefined
              }
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <YStack gap={spacing.md}>
                <XStack alignItems="center" justifyContent="space-between">
                  <Text.Title color={colors.text}>{t('achievements')}</Text.Title>
                  {/* Star-count pill in the badge family's gold (the weekly
                      activity card's header-pill anatomy). */}
                  <XStack
                    alignItems="center"
                    gap={spacing.xs}
                    paddingHorizontal={spacing.sm}
                    paddingVertical={2}
                    borderRadius={radius.full}
                    backgroundColor={hexToRgba(colors.warning, isDark ? 0.16 : 0.1)}
                    accessible
                    accessibilityLabel={`${t('achievements')}: ${earnedStarTotal}/${quizBadges.length * 3}`}
                  >
                    <StarRating earnedCount={1} totalStars={1} size={typography.fontSize.caption} />
                    <Text.Caption color={colors.warning} fontFamily={FONT_FAMILIES.semibold}>
                      {`${earnedStarTotal}/${quizBadges.length * 3}`}
                    </Text.Caption>
                  </XStack>
                </XStack>
                <GlassCard isDark={isDark}>
                  {/* Left-packed quarter-width cells: space-between punched a
                      hole mid-row when a public profile shows 7 badges. Row
                      gap xl keeps 3-star gold glows out of the next row. No
                      columnGap — 4 × 25% only fits without one. */}
                  <XStack flexWrap="wrap" rowGap={spacing.xl}>
                    {quizBadges.map((badge) => {
                      const status = badgeStatusFor(badge);
                      const stars = status.earnedStars.length;
                      // Mirrors openBadgeDetail's gate so the pressed
                      // affordance never plays on a tap that would no-op.
                      const opensSheet = isSelf && !!ownBadges?.has(badge.id);
                      return (
                        <Pressable
                          key={badge.id}
                          onPress={() => openBadgeDetail(status)}
                          disabled={!opensSheet}
                          android_ripple={opensSheet ? androidRipple(isDark) : undefined}
                          accessibilityRole="button"
                          accessibilityLabel={t('badgeStarsA11y', {
                            name: t(`badge_${badge.id}` as any),
                            count: stars,
                            total: 3,
                          })}
                          style={({ pressed }) => ({
                            width: `${100 / Math.min(4, config.triviaCategoriesPerRow * 2)}%`,
                            alignItems: 'center',
                            gap: spacing.xs,
                            paddingHorizontal: spacing.xs,
                            opacity: Platform.OS === 'ios' && pressed ? 0.85 : 1,
                            transform: [{ scale: Platform.OS === 'ios' && pressed ? 0.95 : 1 }],
                            // Ripple containment; Android-only because overflow
                            // clipping on iOS would cut the gold badge glow.
                            ...(Platform.OS === 'android' && {
                              borderRadius: radius.md,
                              overflow: 'hidden' as const,
                            }),
                          })}
                        >
                          {/* iOS-only glow by design: elevation on a
                              background-less View draws nothing on Android
                              (no outline), so it is deliberately absent. */}
                          <View
                            style={
                              stars > 0
                                ? {
                                    shadowColor: STAR_COLORS.filled,
                                    shadowOffset: { width: 0, height: 3 + stars * 3 },
                                    shadowOpacity: 0.3 + stars * 0.2,
                                    shadowRadius: 8 + stars * 6,
                                  }
                                : undefined
                            }
                          >
                            <BadgeIcon
                              badgeId={badge.id}
                              size={iconSizes.xxl}
                              isUnlocked={stars > 0}
                            />
                          </View>
                          <StarRating earnedCount={stars} size={typography.fontSize.tiny} />
                        </Pressable>
                      );
                    })}
                  </XStack>
                </GlassCard>
              </YStack>
            </Animated.View>
          </YStack>
        </ContentContainer>
      </ScrollView>

      <BadgeDetailSheet
        badge={selectedBadge}
        visible={badgeSheetVisible}
        onClose={() => setBadgeSheetVisible(false)}
      />

      {/* Rename/avatar edit for the hero's pencil. The identity-change
          subscription reloads after a save; the dialog closes itself, so
          onSaved has nothing left to do. */}
      {isSelf && (
        <ScreenNameModal
          visible={nameModalVisible}
          onClose={() => setNameModalVisible(false)}
          onSaved={() => {}}
          currentName={profile.screen_name}
          currentAvatar={profile.avatar}
          source="settings"
        />
      )}
    </View>
  );
}

const profileShadow = StyleSheet.create({
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
});

// Accent-colored glow (shadowColor overridden inline) so the hero reads as
// lit, not boxed — the hub hero / grid tile recipe.
const profileGlow = StyleSheet.create({
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});
