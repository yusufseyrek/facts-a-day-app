import React, { useCallback, useState } from 'react';
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
import Animated, { FadeIn } from 'react-native-reanimated';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
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
  HelpCircle,
  Shuffle,
  Tag,
  Zap,
} from '../../../src/components/icons';
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
import { hexToRgba } from '../../../src/utils/colors';
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
  fillRow = false,
}: {
  children: React.ReactNode;
  isDark: boolean;
  padding?: number;
  onPress?: () => void;
  /** flex:1 for cards sharing a horizontal row (the stat tiles). Standalone
   * cards must NOT flex — flexBasis:0 collapses them inside auto-height
   * parents. */
  fillRow?: boolean;
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
        style={({ pressed }) => [
          ...frameStyle,
          { opacity: pressed ? 0.7 : 1 },
          fillRow && { flex: 1 },
        ]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={[...frameStyle, fillRow && { flex: 1 }]}>{body}</View>;
}

/**
 * One lifetime stat tile: tinted icon plate, headline value, quiet uppercase
 * label. Four of these form the top band — lifetime numbers the hub hero does
 * NOT show (the hero owns accuracy/quizzes/streak/rank; duplicating them here
 * was the old screen's failure mode).
 */
function StatTile({
  icon,
  color,
  value,
  label,
  isDark,
}: {
  icon: React.ReactNode;
  color: string;
  value: string | number;
  label: string;
  isDark: boolean;
}) {
  const { spacing, radius, iconSizes, typography } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  return (
    <PerfCard isDark={isDark} padding={spacing.md} fillRow>
      <YStack gap={spacing.sm}>
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
          {icon}
        </View>
        <YStack>
          <Text.Title color={colors.text} fontFamily={FONT_FAMILIES.bold} numberOfLines={1}>
            {value}
          </Text.Title>
          <Text.Tiny
            color={colors.textMuted}
            textTransform="uppercase"
            letterSpacing={0.8}
            fontFamily={FONT_FAMILIES.semibold}
            numberOfLines={1}
            fontSize={typography.fontSize.tiny}
          >
            {label}
          </Text.Tiny>
        </YStack>
      </YStack>
    </PerfCard>
  );
}

/** The trailing-week activity card: quiet label + this-week delta over the
 * 7-day bar strip (carried over from the old overview card). */
function WeeklyActivityCard({
  weeklyActivity,
  testsThisWeek,
  isDark,
  t,
}: {
  weeklyActivity: { date: string; count: number }[];
  testsThisWeek: number;
  isDark: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}) {
  const { spacing, radius, typography } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  const maxDayCount = Math.max(1, ...weeklyActivity.map((d) => d.count));
  const stripHeight = spacing.xl + spacing.md;

  // Localized single-letter weekday markers under the activity bars.
  const dayInitial = (isoDate: string) => {
    const d = new Date(`${isoDate}T12:00:00`);
    return d.toLocaleDateString(undefined, { weekday: 'narrow' });
  };

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
            <Text.Caption color={colors.primary} fontFamily={FONT_FAMILIES.semibold}>
              {t('thisWeek', { count: testsThisWeek })}
            </Text.Caption>
          )}
        </XStack>
        <XStack gap={spacing.sm} alignItems="flex-end">
          {weeklyActivity.map((day) => {
            const active = day.count > 0;
            const barHeight = active
              ? Math.max(stripHeight * 0.3, (day.count / maxDayCount) * stripHeight)
              : spacing.xs;
            return (
              <YStack key={day.date} flex={1} alignItems="center" gap={spacing.xs}>
                <View
                  style={{
                    width: '55%',
                    height: barHeight,
                    borderRadius: radius.full,
                    backgroundColor: active ? colors.primary : colors.border,
                  }}
                />
                <Text.Tiny
                  color={colors.textMuted}
                  fontSize={typography.fontSize.tiny}
                  maxFontSizeMultiplier={1}
                >
                  {dayInitial(day.date)}
                </Text.Tiny>
              </YStack>
            );
          })}
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

/** Per-mode play volume + accuracy rows. */
function ModeBreakdownCard({
  rows,
  isDark,
  t,
}: {
  rows: ModeBreakdownRow[];
  isDark: boolean;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}) {
  const { spacing, radius, iconSizes, typography } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  return (
    <PerfCard isDark={isDark}>
      <YStack gap={spacing.lg}>
        {rows.map((row) => {
          const { Icon, color } = modeVisual(row.mode, isDark);
          return (
            <XStack key={row.mode} alignItems="center" gap={spacing.sm}>
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
                <Text.Label
                  color={colors.text}
                  fontFamily={FONT_FAMILIES.medium}
                  numberOfLines={1}
                >
                  {t(MODE_LABEL_KEY[row.mode])}
                </Text.Label>
                <Text.Caption color={colors.textMuted} fontSize={typography.fontSize.tiny}>
                  {t('leaderboardGamesCount', { count: String(row.games) })}
                </Text.Caption>
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
        })}
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
});

export default function PerformanceScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const isDark = theme === 'dark';
  const { iconSizes, spacing, radius } = useResponsive();
  const bannerInset = useTabBarBannerInset();

  const [loading, setLoading] = useState(true);
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

  // TriviaResults renders under the SAME native header as the rest of the
  // stack: keep the header, retitle it, and point its back chevron at the
  // results' close handler instead of popping the screen.
  const showingResults = !!(
    selectedSession &&
    selectedSession.questions &&
    selectedSession.answers
  );
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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <YStack flex={1} justifyContent="center" alignItems="center">
          <ActivityIndicator size="large" color={primaryColor} />
        </YStack>
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
                at-a-glance card; this screen is the deep dive, so repeating
                the dial here was dropped. */}
            <Animated.View
              entering={FadeIn.delay(50).duration(400).springify()}
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <YStack gap={spacing.md}>
                <XStack gap={spacing.md}>
                  <StatTile
                    icon={<HelpCircle size={iconSizes.xs} color={primaryColor} />}
                    color={primaryColor}
                    value={stats?.totalAnswered ?? 0}
                    label={t('answered')}
                    isDark={isDark}
                  />
                  <StatTile
                    icon={<Award size={iconSizes.xs} color={colors.warning} />}
                    color={colors.warning}
                    value={lifetime.perfectGames}
                    label={t('perfectGames')}
                    isDark={isDark}
                  />
                </XStack>
                <XStack gap={spacing.md}>
                  <StatTile
                    icon={<Flame size={iconSizes.xs} color={colors.neonOrange} />}
                    color={colors.neonOrange}
                    value={stats?.bestStreak ?? 0}
                    label={t('dayStreak')}
                    isDark={isDark}
                  />
                  <StatTile
                    icon={<Clock size={iconSizes.xs} color={colors.neonPurple} />}
                    color={colors.neonPurple}
                    value={formatPlayTime(lifetime.totalPlaySeconds)}
                    label={t('timePlayed')}
                    isDark={isDark}
                  />
                </XStack>
              </YStack>
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
                  <ModeBreakdownCard rows={modeBreakdown} isDark={isDark} t={t} />
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
