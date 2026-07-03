import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

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
  Flame,
  Gamepad2,
  Grid,
  Shuffle,
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

import type { TriviaMode } from '../../../src/services/analytics';
import type {
  CategoryWithProgress,
  TriviaSessionWithCategory,
  TriviaStats,
} from '../../../src/services/trivia';

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
  const scale = useRef(new RNAnimated.Value(1)).current;

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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Card-toned accuracy dial: quiet track in the border tone, primary arc,
 * headline number in the middle. Same 900ms ease the hub hero's ring uses so
 * the two dials feel like one system across screens.
 */
function AccuracyDial({
  percentage,
  size,
  strokeWidth,
  trackColor,
  progressColor,
  children,
}: {
  percentage: number;
  size: number;
  strokeWidth: number;
  trackColor: string;
  progressColor: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(percentage, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [percentage, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - (progress.value / 100) * circumference,
  }));

  return (
    <YStack alignItems="center" justifyContent="center">
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
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
            animatedProps={animatedProps}
            rotation="-90"
            origin={`${center}, ${center}`}
          />
        )}
      </Svg>
      <YStack
        position="absolute"
        alignItems="center"
        justifyContent="center"
        width={size - strokeWidth * 2}
      >
        {children}
      </YStack>
    </YStack>
  );
}

// One overview stat line: tinted icon plate + value + label/micro stack.
function OverviewRow({
  icon,
  color,
  value,
  label,
  micro,
  isDark,
}: {
  icon: React.ReactNode;
  color: string;
  value: string | number;
  label: string;
  micro?: string | null;
  isDark: boolean;
}) {
  const { spacing, radius, iconSizes, typography } = useResponsive();
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const mutedColor = isDark ? hexColors.dark.textMuted : hexColors.light.textMuted;
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
        {icon}
      </View>
      <YStack
        height={typography.lineHeight.title}
        minWidth={typography.fontSize.title * 1.3}
        justifyContent="center"
      >
        <Text.Title color={textColor} fontFamily={FONT_FAMILIES.bold} numberOfLines={1}>
          {value}
        </Text.Title>
      </YStack>
      <YStack flex={1} justifyContent="center">
        <Text.Tiny
          color={mutedColor}
          textTransform="uppercase"
          letterSpacing={0.8}
          fontFamily={FONT_FAMILIES.semibold}
          numberOfLines={1}
        >
          {label}
        </Text.Tiny>
        {micro ? (
          <Text.Tiny color={mutedColor} fontFamily={FONT_FAMILIES.medium} numberOfLines={1}>
            {micro}
          </Text.Tiny>
        ) : null}
      </YStack>
    </XStack>
  );
}

/**
 * The performance overview: accuracy dial + the three stats that matter
 * (quizzes, correct, streak) + a 7-day activity strip. Replaced the old
 * Tests/Correct/Answered card grid, which buried accuracy (the headline
 * metric) and duplicated "answered" vs "correct" without adding signal —
 * the dial's denominator line now carries answered.
 */
function PerformanceOverview({
  stats,
  weeklyActivity,
  isDark,
  t,
}: {
  stats: TriviaStats | null;
  weeklyActivity: { date: string; count: number }[];
  isDark: boolean;
  t: (key: any, params?: any) => string;
}) {
  const { spacing, radius, iconSizes, borderWidths, typography } = useResponsive();
  const colors = isDark ? hexColors.dark : hexColors.light;
  const cardBg = colors.cardBackground;
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  const accuracy = stats?.accuracy ?? 0;
  const maxDayCount = Math.max(1, ...weeklyActivity.map((d) => d.count));
  const stripHeight = spacing.xl + spacing.sm;

  // Localized single-letter weekday markers under the activity bars.
  const dayInitial = (isoDate: string) => {
    const d = new Date(`${isoDate}T12:00:00`);
    return d.toLocaleDateString(undefined, { weekday: 'narrow' });
  };

  return (
    <View
      style={[
        perfShadowStyles.card,
        { borderRadius: radius.lg },
        useGlass && {
          overflow: 'hidden' as const,
          borderWidth: 1,
          borderColor: colors.border,
        },
      ]}
    >
      {useGlass && (
        <GlassSurface
          variant="glass"
          isDark={isDark}
          tint={cardBg}
          glassTint={hexToRgba(cardBg, isDark ? 0.6 : 0.65)}
          borderRadius={radius.lg}
          style={absoluteFillObject}
        />
      )}
      <YStack
        backgroundColor={useGlass ? 'transparent' : cardBg}
        borderRadius={radius.lg}
        padding={spacing.lg}
        gap={spacing.lg}
      >
        <XStack alignItems="center" gap={spacing.md}>
          {/* Dial half */}
          <YStack flex={1} alignItems="center" gap={spacing.sm}>
            <AccuracyDial
              percentage={accuracy}
              size={iconSizes.heroXl}
              strokeWidth={borderWidths.extraHeavy}
              trackColor={colors.border}
              progressColor={colors.primary}
            >
              <XStack alignItems="baseline">
                <Text.Display color={colors.text} numberOfLines={1}>
                  {accuracy}
                </Text.Display>
                <Text.Caption fontFamily={FONT_FAMILIES.semibold} color={colors.textMuted}>
                  %
                </Text.Caption>
              </XStack>
            </AccuracyDial>
            <YStack alignItems="center">
              <Text.Tiny
                color={colors.textMuted}
                textTransform="uppercase"
                letterSpacing={0.8}
                fontFamily={FONT_FAMILIES.semibold}
              >
                {t('accuracy')}
              </Text.Tiny>
              <Text.Tiny color={colors.textMuted} fontFamily={FONT_FAMILIES.medium}>
                {`${stats?.totalCorrect ?? 0} / ${stats?.totalAnswered ?? 0}`}
              </Text.Tiny>
            </YStack>
          </YStack>

          {/* Structural hairline between the halves */}
          <YStack
            width={1}
            alignSelf="stretch"
            marginVertical={spacing.xs}
            backgroundColor={colors.border}
          />

          {/* Stat rows half */}
          <YStack flex={1.2} gap={spacing.md}>
            <OverviewRow
              icon={<Gamepad2 size={iconSizes.xs} color={colors.neonPurple} />}
              color={colors.neonPurple}
              value={stats?.testsTaken ?? 0}
              label={t('quizzes')}
              micro={stats?.testsThisWeek ? t('thisWeek', { count: stats.testsThisWeek }) : null}
              isDark={isDark}
            />
            <OverviewRow
              icon={<CheckCircle size={iconSizes.xs} color={colors.success} />}
              color={colors.success}
              value={stats?.totalCorrect ?? 0}
              label={t('correct')}
              micro={stats?.correctToday ? t('todayCount', { count: stats.correctToday }) : null}
              isDark={isDark}
            />
            <OverviewRow
              icon={<Flame size={iconSizes.xs} color={colors.neonOrange} />}
              color={colors.neonOrange}
              value={stats?.currentStreak ?? 0}
              label={t('dayStreak')}
              micro={t('best', { count: stats?.bestStreak ?? 0 })}
              isDark={isDark}
            />
          </YStack>
        </XStack>

        {/* 7-day activity strip */}
        <YStack gap={spacing.sm}>
          <View
            style={{
              height: borderWidths.hairline,
              backgroundColor: colors.border,
            }}
          />
          <Text.Tiny
            color={colors.textMuted}
            textTransform="uppercase"
            letterSpacing={0.8}
            fontFamily={FONT_FAMILIES.semibold}
          >
            {t('last7Days')}
          </Text.Tiny>
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
      </YStack>
    </View>
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

        const [statsData, categoriesData, activityData, sessionsData, earnedBadges] =
          await Promise.all([
            triviaService.getOverallStats(),
            triviaService.getCategoriesWithProgress(locale),
            triviaService.getWeeklyActivity(),
            triviaService.getRecentSessions(DISPLAY_LIMITS.MAX_ACTIVITIES),
            getEarnedBadges(),
          ]);

        setStats(statsData);
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
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const accentColor = isDark ? hexColors.dark.accent : hexColors.light.accent;

  // iOS 26 Liquid Glass for the stat cards in this plain ScrollView (cards go
  // transparent, glass tinted with the card color shows through). Opaque cards
  // everywhere else are untouched.
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const glassTint = hexToRgba(cardBg, isDark ? 0.6 : 0.65);

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

  // Top categories by accuracy, from category-mode play history. `answered`
  // (not the old `total`, which zeroed when the local question mirror was
  // removed and kept this section permanently hidden) decides visibility —
  // a 0% category with real answers is signal, not noise.
  const displayCategories = categories
    .filter((c) => c.answered > 0)
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
            {/* Overview — no section label: it read as a stray fixed subtitle
                directly under the native large title. */}
            <Animated.View
              entering={FadeIn.delay(50).duration(400).springify()}
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <PerformanceOverview
                stats={stats}
                weeklyActivity={weeklyActivity}
                isDark={isDark}
                t={t}
              />
            </Animated.View>

            {/* Achievements Card */}
            <Animated.View
              entering={FadeIn.delay(100).duration(400).springify()}
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <Pressable
                onPress={() => router.push('/badges')}
                style={({ pressed }) => [
                  perfShadowStyles.card,
                  { borderRadius: radius.lg },
                  { opacity: pressed ? 0.7 : 1 },
                  useGlass && {
                    overflow: 'hidden' as const,
                    borderWidth: 1,
                    borderColor: isDark ? hexColors.dark.border : hexColors.light.border,
                  },
                ]}
              >
                {useGlass && (
                  <GlassSurface
                    variant="glass"
                    isDark={isDark}
                    tint={cardBg}
                    glassTint={glassTint}
                    borderRadius={radius.lg}
                    style={absoluteFillObject}
                  />
                )}
                <YStack
                  backgroundColor={useGlass ? 'transparent' : cardBg}
                  borderRadius={radius.lg}
                  padding={spacing.lg}
                  gap={spacing.md}
                >
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
              </Pressable>
            </Animated.View>

            {/* Accuracy by Category */}
            {displayCategories.length > 0 && (
              <View>
                <YStack marginBottom={spacing.md} gap={spacing.xs}>
                  <XStack alignItems="center" justifyContent="space-between">
                    <Text.Title color={textColor} flex={1}>
                      {t('accuracyByCategory')}
                    </Text.Title>
                  </XStack>
                  <Text.Caption
                    color={isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
                    opacity={0.9}
                  >
                    {t('accuracyByCategorySubtitle')}
                  </Text.Caption>
                </YStack>

                <Pressable
                  onPress={() => router.push('/(tabs)/trivia/categories')}
                  style={({ pressed }) => [
                    perfShadowStyles.card,
                    { borderRadius: radius.lg },
                    { opacity: pressed ? 0.7 : 1 },
                    useGlass && {
                      overflow: 'hidden' as const,
                      borderWidth: 1,
                      borderColor: isDark ? hexColors.dark.border : hexColors.light.border,
                    },
                  ]}
                >
                  {useGlass && (
                    <GlassSurface
                      variant="glass"
                      isDark={isDark}
                      tint={cardBg}
                      glassTint={glassTint}
                      style={absoluteFillObject}
                    />
                  )}
                  <YStack
                    backgroundColor={useGlass ? 'transparent' : cardBg}
                    borderRadius={radius.lg}
                    padding={spacing.lg}
                    gap={spacing.lg}
                  >
                    {displayCategories.map((category) => (
                      <CategoryProgressBar
                        key={category.slug}
                        category={category}
                        isDark={isDark}
                      />
                    ))}
                  </YStack>
                </Pressable>
              </View>
            )}

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
