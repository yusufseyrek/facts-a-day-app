import React, { useCallback, useRef, useState } from 'react';
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
import Animated, { FadeIn, FadeInDown, FadeInUp, SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFocusEffect } from '@react-navigation/native';
import {
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  GraduationCap,
  Hash,
  Shuffle,
  Trophy,
} from '@tamagui/lucide-icons';
import { getEarnedBadges } from '../../src/services/badges';
import { BADGE_DEFINITIONS } from '../../src/config/badges';
import { BadgeIcon } from '../../src/components/badges/BadgeIcon';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { ContentContainer } from '../../src/components';
import { InlineNativeAd } from '../../src/components/ads/InlineNativeAd';
import { getTriviaModeBadge, TriviaResults } from '../../src/components/trivia';
import { FONT_FAMILIES, Text } from '../../src/components/Typography';
import { DISPLAY_LIMITS } from '../../src/config/app';
import { useTranslation } from '../../src/i18n';
import { Screens, trackScreenView, trackTriviaResultsView } from '../../src/services/analytics';
import * as triviaService from '../../src/services/trivia';
import { hexColors, useTheme } from '../../src/theme';
import { getLucideIcon } from '../../src/utils/iconMapper';
import { useResponsive } from '../../src/utils/useResponsive';

import type { TriviaMode } from '../../src/services/analytics';
import type {
  CategoryWithProgress,
  TriviaSessionWithCategory,
  TriviaStats,
} from '../../src/services/trivia';

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

// Back Button with press animation
function BackButton({ onPress, primaryColor }: { onPress: () => void; primaryColor: string }) {
  const { iconSizes, media } = useResponsive();
  const scale = useRef(new RNAnimated.Value(1)).current;
  const buttonSize = media.topicCardSize * 0.45;

  const handlePressIn = () => {
    RNAnimated.spring(scale, {
      toValue: 0.9,
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
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      testID="trivia-performance-back-button"
    >
      <RNAnimated.View
        style={{
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: `${primaryColor}20`,
          justifyContent: 'center',
          alignItems: 'center',
          transform: [{ scale }],
        }}
      >
        <ChevronLeft size={iconSizes.lg} color={primaryColor} />
      </RNAnimated.View>
    </Pressable>
  );
}

// Metric Card Component
function MetricCard({
  icon,
  iconBgColor,
  label,
  value,
  subtitle,
  isDark,
}: {
  icon: React.ReactNode;
  iconBgColor: string;
  label: string;
  value: string | number;
  subtitle?: string;
  isDark: boolean;
}) {
  const { spacing, radius, iconSizes, isTablet } = useResponsive();
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const subtitleColor = isDark ? hexColors.dark.neonGreen : hexColors.light.success;
  const iconContainerSize = iconSizes.lg;

  const iconContainer = (
    <View
      style={{
        width: iconContainerSize,
        height: iconContainerSize,
        borderRadius: radius.sm * 0.75,
        backgroundColor: iconBgColor,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {icon}
    </View>
  );

  const labelText = isTablet ? (
    <Text.Label
      color={isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
      fontFamily={FONT_FAMILIES.medium}
    >
      {label}
    </Text.Label>
  ) : (
    <Text.Body
      color={isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
      fontFamily={FONT_FAMILIES.medium}
    >
      {label}
    </Text.Body>
  );

  return (
    <View style={[perfShadowStyles.card, { flex: 1, borderRadius: radius.lg }]}>
      <YStack
        flex={1}
        backgroundColor={cardBg}
        borderRadius={radius.lg}
        paddingHorizontal={spacing.xs}
        paddingVertical={spacing.sm}
        gap={spacing.xs}
        alignItems="center"
      >
        {isTablet ? (
          <YStack alignItems="center" gap={spacing.xs}>
            {iconContainer}
            {labelText}
          </YStack>
        ) : (
          <XStack alignItems="center" gap={spacing.sm}>
            {iconContainer}
            {labelText}
          </XStack>
        )}
        <Text.Title color={textColor} fontFamily={FONT_FAMILIES.semibold}>
          {value}
        </Text.Title>
        {subtitle && (
          <Text.Tiny color={subtitleColor} fontFamily={FONT_FAMILIES.medium}>
            {subtitle}
          </Text.Tiny>
        )}
      </YStack>
    </View>
  );
}

// Helper to chunk array into rows
const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

// Metrics Grid Component - responsive grid layout for metrics
function MetricsGrid({
  stats,
  isDark,
  t,
  iconSizes,
  spacing,
  primaryColor,
  accentColor,
  purpleColor,
  successColor,
  columnsPerRow,
}: {
  stats: TriviaStats | null;
  isDark: boolean;
  t: (key: any, params?: any) => string;
  iconSizes: { sm: number };
  spacing: { md: number };
  primaryColor: string;
  accentColor: string;
  purpleColor: string;
  successColor: string;
  columnsPerRow: number;
}) {
  const metricsData = [
    {
      Icon: Gamepad2,
      color: purpleColor,
      label: t('tests'),
      value: stats?.testsTaken || 0,
      subtitle: stats?.testsThisWeek ? t('thisWeek', { count: stats.testsThisWeek }) : undefined,
    },
    {
      Icon: CheckCircle,
      color: successColor,
      label: t('correct'),
      value: stats?.totalCorrect || 0,
      subtitle: stats?.correctToday ? t('todayCount', { count: stats.correctToday }) : undefined,
    },
    {
      Icon: Hash,
      color: primaryColor,
      label: t('answered'),
      value: stats?.totalAnswered || 0,
      subtitle: stats?.answeredThisWeek
        ? t('thisWeek', { count: stats.answeredThisWeek })
        : undefined,
    },
    {
      Icon: GraduationCap,
      color: accentColor,
      label: t('mastered'),
      value: stats?.totalMastered || 0,
      subtitle: stats?.masteredToday ? t('todayCount', { count: stats.masteredToday }) : undefined,
    },
  ];

  const metricRows = chunkArray(metricsData, columnsPerRow);

  return (
    <YStack gap={spacing.md}>
      {metricRows.map((row, rowIndex) => (
        <XStack key={rowIndex} gap={spacing.md}>
          {row.map((metric, index) => (
            <MetricCard
              key={index}
              icon={<metric.Icon size={iconSizes.sm} color={metric.color} />}
              iconBgColor={`${metric.color}20`}
              label={metric.label}
              value={metric.value}
              subtitle={metric.subtitle}
              isDark={isDark}
            />
          ))}
        </XStack>
      ))}
    </YStack>
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

  return (
    <YStack gap={spacing.xs}>
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap={spacing.sm}>
          {getLucideIcon(category.icon, typography.fontSize.title, progressColor)}
          <Text.Label color={textColor} fontFamily={FONT_FAMILIES.medium} w="50%">
            {category.name}
          </Text.Label>
        </XStack>
        <Text.Caption color={textColor} fontFamily={FONT_FAMILIES.semibold}>
          {percentage}%
        </Text.Caption>
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

    const IconComponent = session.trivia_mode === 'daily' ? Calendar : Shuffle;
    const iconColor = primaryColor;

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
      style={({ pressed }) => [
        perfShadowStyles.card,
        { borderRadius: radius.lg },
        pressed && hasResultData && { opacity: 0.8 },
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
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';
  const { config, iconSizes, spacing, radius, media } = useResponsive();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<TriviaStats | null>(null);
  const [categories, setCategories] = useState<CategoryWithProgress[]>([]);
  const [recentSessions, setRecentSessions] = useState<TriviaSessionWithCategory[]>([]);
  const [totalSessionsCount, setTotalSessionsCount] = useState(0);
  const [selectedSession, setSelectedSession] = useState<TriviaSessionWithCategory | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [earnedBadgeIds, setEarnedBadgeIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);

        const [statsData, categoriesData, sessionsData, earnedBadges] = await Promise.all([
          triviaService.getOverallStats(),
          triviaService.getCategoriesWithProgress(locale),
          triviaService.getRecentSessions(DISPLAY_LIMITS.MAX_ACTIVITIES),
          getEarnedBadges(),
        ]);

        setStats(statsData);
        setCategories(categoriesData);
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

  // Handle session click to show results
  const handleSessionClick = useCallback(async (sessionId: number) => {
    try {
      setLoadingSession(true);
      const fullSession = await triviaService.getSessionById(sessionId);
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
  }, []);

  // Handle close results view
  const handleCloseResults = useCallback(() => {
    setSelectedSession(null);
  }, []);

  // Colors
  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const accentColor = isDark ? hexColors.dark.accent : hexColors.light.accent;
  const purpleColor = isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top }}>
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
        showBackButton={true}
        showReturnButton={false}
        unavailableQuestionIds={selectedSession.unavailableQuestionIds}
      />
    );
  }

  // Take top 4 categories for display, sorted by accuracy high to low
  const displayCategories = categories
    .filter((c) => c.total > 0 && c.accuracy > 0)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, DISPLAY_LIMITS.MAX_CATEGORIES);

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(400).springify()}
        needsOffscreenAlphaCompositing={Platform.OS === 'android'}
      >
        <XStack
          paddingTop={insets.top + spacing.sm}
          paddingBottom={spacing.md}
          paddingHorizontal={spacing.lg}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor={isDark ? hexColors.dark.border : hexColors.light.border}
        >
          <BackButton onPress={() => router.back()} primaryColor={primaryColor} />

          <Text.Title color={textColor}>{t('triviaPerformance')}</Text.Title>

          {/* Empty spacer to balance the header */}
          <View style={{ width: media.topicCardSize * 0.45, height: media.topicCardSize * 0.45 }} />
        </XStack>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
      >
        <ContentContainer>
          <YStack padding={spacing.lg} gap={spacing.xl}>
          {/* Core Metrics */}
          <Animated.View
            entering={FadeIn.delay(50).duration(400).springify()}
            needsOffscreenAlphaCompositing={Platform.OS === 'android'}
          >
            <Text.Title color={textColor} marginBottom={spacing.md}>
              {t('coreMetrics')}
            </Text.Title>

            <MetricsGrid
              stats={stats}
              isDark={isDark}
              t={t}
              iconSizes={iconSizes}
              spacing={spacing}
              primaryColor={primaryColor}
              accentColor={accentColor}
              purpleColor={purpleColor}
              successColor={successColor}
              columnsPerRow={config.triviaCategoriesPerRow}
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
              ]}
            >
              <YStack
                backgroundColor={cardBg}
                borderRadius={radius.lg}
                padding={spacing.lg}
                gap={spacing.md}
              >
                <XStack alignItems="center" justifyContent="space-between">
                  <XStack alignItems="center" gap={spacing.sm}>
                    <Trophy size={iconSizes.sm} color={accentColor} />
                    <Text.Label fontFamily={FONT_FAMILIES.semibold} color={textColor}>
                      {t('achievements')}
                    </Text.Label>
                  </XStack>
                  <XStack alignItems="center" gap={spacing.xs}>
                    <Text.Caption
                      color={isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
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
                      color={isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
                    />
                  </XStack>
                </XStack>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
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

          {/* Native Ad */}
          <InlineNativeAd />

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
                ]}
              >
                <YStack
                  backgroundColor={cardBg}
                  borderRadius={radius.lg}
                  padding={spacing.lg}
                  gap={spacing.lg}
                >
                  {displayCategories.map((category) => (
                    <CategoryProgressBar key={category.slug} category={category} isDark={isDark} />
                  ))}
                </YStack>
              </Pressable>
            </View>
          )}

          {/* Recent Trivia */}
          {recentSessions.length > 0 && (
            <View>
              <XStack alignItems="center" justifyContent="space-between" marginBottom={spacing.md}>
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
