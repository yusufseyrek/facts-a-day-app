import React, { useState, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { 
  ScrollView, 
  RefreshControl, 
  ActivityIndicator,
  Pressable,
  View,
  Animated as RNAnimated,
} from 'react-native';
import { YStack, XStack } from 'tamagui';
import { 
  Gamepad2, 
  Trophy, 
  CheckCircle,
  Calendar,
  Shuffle,
  Hash,
  ChevronLeft,
  ChevronRight,
} from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeInUp, SlideInRight } from 'react-native-reanimated';
import { hexColors } from '../../src/theme';
import { Text, FONT_FAMILIES } from '../../src/components/Typography';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { getLucideIcon } from '../../src/utils/iconMapper';
import { useResponsive } from '../../src/utils/useResponsive';
import * as triviaService from '../../src/services/trivia';
import { TriviaResults, getTriviaModeBadge } from '../../src/components/trivia';
import type { TriviaStats, CategoryWithProgress, TriviaSessionWithCategory } from '../../src/services/trivia';
import { trackScreenView, Screens, trackTriviaResultsView, TriviaMode } from '../../src/services/analytics';
import { DISPLAY_LIMITS } from '../../src/config/app';

// Back Button with press animation
function BackButton({ 
  onPress, 
  primaryColor 
}: { 
  onPress: () => void; 
  primaryColor: string;
}) {
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
  iconColor,
  iconBgColor,
  label,
  value,
  subtitle,
  isDark,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBgColor: string;
  label: string;
  value: string | number;
  subtitle?: string;
  isDark: boolean;
}) {
  const { typography, spacing, radius, iconSizes } = useResponsive();
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const subtitleColor = isDark ? hexColors.dark.neonGreen : hexColors.light.success;
  const iconContainerSize = iconSizes.lg;

  return (
    <YStack
      flex={1}
      backgroundColor={cardBg}
      borderRadius={radius.lg}
      padding={spacing.lg}
      gap={spacing.sm}
    >
      <XStack alignItems="center" gap={spacing.sm}>
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
        <Text.Caption
          color={isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
          fontFamily={FONT_FAMILIES.medium}
        >
          {label}
        </Text.Caption>
      </XStack>
      <Text.Display
        color={textColor}
      >
        {value}
      </Text.Display>
      {subtitle && (
        <Text.Caption
          color={subtitleColor}
          fontFamily={FONT_FAMILIES.medium}
        >
          {subtitle}
        </Text.Caption>
      )}
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
  const { typography, spacing, radius } = useResponsive();
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const trackColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const progressColor = category.color_hex || (isDark ? hexColors.dark.primary : hexColors.light.primary);
  const percentage = category.accuracy;
  const barHeight = spacing.sm;

  return (
    <YStack gap={spacing.xs}>
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap={spacing.sm}>
          {getLucideIcon(category.icon, typography.fontSize.title, progressColor)}
          <Text.Label
            color={textColor}
            fontFamily={FONT_FAMILIES.medium}
          >
            {category.name}
          </Text.Label>
        </XStack>
        <Text.Caption
          color={textColor}
          fontFamily={FONT_FAMILIES.semibold}
        >
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
  const { typography, iconSizes, spacing, radius, media } = useResponsive();
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const warningColor = '#F59E0B';
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const iconContainerSize = media.topicCardSize * 0.5;

  const scorePercentage = session.total_questions > 0 
    ? (session.correct_answers / session.total_questions) * 100 
    : 0;

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
        pressed && hasResultData && { opacity: 0.8 }
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
          <Text.Label
            fontFamily={FONT_FAMILIES.semibold}
            color={textColor}
          >
            {getDisplayName()}
          </Text.Label>
          <Text.Caption
            color={secondaryTextColor}
          >
            {getDateDisplay()}
          </Text.Caption>
        </YStack>
        <YStack alignItems="flex-end" gap={2}>
          <Text.Caption
            fontFamily={FONT_FAMILIES.semibold}
            color={feedback.color}
          >
            {feedback.text}
          </Text.Caption>
          <Text.Caption
            color={secondaryTextColor}
          >
            {t('score')}: {session.correct_answers}/{session.total_questions}
          </Text.Caption>
        </YStack>
        {hasResultData && (
          <ChevronRight size={iconSizes.md} color={secondaryTextColor} />
        )}
      </XStack>
    </Pressable>
  );
}

export default function PerformanceScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';
  const { isTablet, typography, iconSizes, spacing, radius, media } = useResponsive();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<TriviaStats | null>(null);
  const [categories, setCategories] = useState<CategoryWithProgress[]>([]);
  const [recentSessions, setRecentSessions] = useState<TriviaSessionWithCategory[]>([]);
  const [totalSessionsCount, setTotalSessionsCount] = useState(0);
  const [selectedSession, setSelectedSession] = useState<TriviaSessionWithCategory | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      
      const [statsData, categoriesData, sessionsData] = await Promise.all([
        triviaService.getOverallStats(),
        triviaService.getCategoriesWithProgress(locale),
        triviaService.getRecentSessions(DISPLAY_LIMITS.MAX_ACTIVITIES),
      ]);
      
      setStats(statsData);
      setCategories(categoriesData);
      setRecentSessions(sessionsData);
      setTotalSessionsCount(statsData.testsTaken);
    } catch (error) {
      console.error('Error loading performance data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [locale]);

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
        year: 'numeric'
      });
      const timeStr = date.toLocaleTimeString(locale, { 
        hour: '2-digit', 
        minute: '2-digit' 
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
    .filter(c => c.total > 0 && c.accuracy > 0)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, DISPLAY_LIMITS.MAX_CATEGORIES);
  
  // All categories with accuracy > 0, sorted high to low (for modal)
  const allCategoriesWithAccuracy = categories
    .filter(c => c.total > 0 && c.accuracy > 0)
    .sort((a, b) => b.accuracy - a.accuracy);

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Header */}
      <Animated.View entering={FadeInUp.duration(400).springify()}>
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
          
          <Text.Title
            color={textColor}
          >
            {t('triviaPerformance')}
          </Text.Title>
          
          {/* Empty spacer to balance the header */}
          <View style={{ width: media.topicCardSize * 0.45, height: media.topicCardSize * 0.45 }} />
        </XStack>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />
        }
      >
        <YStack padding={spacing.lg} gap={spacing.xl}>
          {/* Core Metrics */}
          <Animated.View entering={FadeIn.delay(50).duration(400).springify()}>
            <Text.Title
              color={textColor}
              marginBottom={spacing.md}
            >
              {t('coreMetrics')}
            </Text.Title>
            
            {isTablet ? (
              /* Tablet: All 4 metrics in a single row */
              <XStack gap={spacing.md}>
                <MetricCard
                  icon={<Gamepad2 size={iconSizes.sm} color={purpleColor} />}
                  iconColor={purpleColor}
                  iconBgColor={`${purpleColor}20`}
                  label={t('tests')}
                  value={stats?.testsTaken || 0}
                  subtitle={stats?.testsThisWeek ? t('thisWeek', { count: stats.testsThisWeek }) : undefined}
                  isDark={isDark}
                />
                <MetricCard
                  icon={<CheckCircle size={iconSizes.sm} color={successColor} />}
                  iconColor={successColor}
                  iconBgColor={`${successColor}20`}
                  label={t('correct')}
                  value={stats?.totalCorrect || 0}
                  subtitle={stats?.correctToday ? t('todayCount', { count: stats.correctToday }) : undefined}
                  isDark={isDark}
                />
                <MetricCard
                  icon={<Hash size={iconSizes.sm} color={primaryColor} />}
                  iconColor={primaryColor}
                  iconBgColor={`${primaryColor}20`}
                  label={t('answered')}
                  value={stats?.totalAnswered || 0}
                  isDark={isDark}
                />
                <MetricCard
                  icon={<Trophy size={iconSizes.sm} color={accentColor} />}
                  iconColor={accentColor}
                  iconBgColor={`${accentColor}20`}
                  label={t('mastered')}
                  value={stats?.totalMastered || 0}
                  subtitle={stats?.masteredToday ? t('todayCount', { count: stats.masteredToday }) : undefined}
                  isDark={isDark}
                />
              </XStack>
            ) : (
              /* Phone: 2 rows of 2 metrics */
              <YStack gap={spacing.md}>
                {/* Row 1: Tests & Correct */}
                <XStack gap={spacing.md}>
                  <MetricCard
                    icon={<Gamepad2 size={iconSizes.sm} color={purpleColor} />}
                    iconColor={purpleColor}
                    iconBgColor={`${purpleColor}20`}
                    label={t('tests')}
                    value={stats?.testsTaken || 0}
                    subtitle={stats?.testsThisWeek ? t('thisWeek', { count: stats.testsThisWeek }) : undefined}
                    isDark={isDark}
                  />
                  <MetricCard
                    icon={<CheckCircle size={iconSizes.sm} color={successColor} />}
                    iconColor={successColor}
                    iconBgColor={`${successColor}20`}
                    label={t('correct')}
                    value={stats?.totalCorrect || 0}
                    subtitle={stats?.correctToday ? t('todayCount', { count: stats.correctToday }) : undefined}
                    isDark={isDark}
                  />
                </XStack>
                
                {/* Row 2: Answered & Mastered */}
                <XStack gap={spacing.md}>
                  <MetricCard
                    icon={<Hash size={iconSizes.sm} color={primaryColor} />}
                    iconColor={primaryColor}
                    iconBgColor={`${primaryColor}20`}
                    label={t('answered')}
                    value={stats?.totalAnswered || 0}
                    isDark={isDark}
                  />
                  <MetricCard
                    icon={<Trophy size={iconSizes.sm} color={accentColor} />}
                    iconColor={accentColor}
                    iconBgColor={`${accentColor}20`}
                    label={t('mastered')}
                    value={stats?.totalMastered || 0}
                    subtitle={stats?.masteredToday ? t('todayCount', { count: stats.masteredToday }) : undefined}
                    isDark={isDark}
                  />
                </XStack>
              </YStack>
            )}
          </Animated.View>

          {/* Accuracy by Category */}
          {displayCategories.length > 0 && (
            <Animated.View entering={SlideInRight.delay(75).duration(400).springify()}>
              <YStack marginBottom={spacing.md} gap={spacing.xs}>
                <XStack alignItems="center" justifyContent="space-between">
                  <Text.Title
                    color={textColor}
                  >
                    {t('accuracyByCategory')}
                  </Text.Title>
                  {allCategoriesWithAccuracy.length > DISPLAY_LIMITS.MAX_CATEGORIES && (
                    <Pressable onPress={() => router.push('/(tabs)/trivia/categories')}>
                      <Text.Caption
                        fontFamily={FONT_FAMILIES.semibold}
                        color={primaryColor}
                      >
                        {t('viewAll')}
                      </Text.Caption>
                    </Pressable>
                  )}
                </XStack>
                <Text.Caption
                  color={isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
                  opacity={0.9}
                >
                  {t('accuracyByCategorySubtitle')}
                </Text.Caption>
              </YStack>
              
              <YStack
                backgroundColor={cardBg}
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
            </Animated.View>
          )}

          {/* Recent Trivia */}
          {recentSessions.length > 0 && (
            <Animated.View entering={SlideInRight.delay(100).duration(400).springify()}>
              <XStack alignItems="center" justifyContent="space-between" marginBottom={spacing.md}>
                <Text.Title
                  color={textColor}
                >
                  {t('recentTests')}
                </Text.Title>
                {totalSessionsCount > DISPLAY_LIMITS.MAX_ACTIVITIES && (
                  <Pressable onPress={() => router.push('/(tabs)/trivia/history')}>
                    <Text.Caption
                      fontFamily={FONT_FAMILIES.semibold}
                      color={primaryColor}
                    >
                      {t('viewAll')}
                    </Text.Caption>
                  </Pressable>
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
            </Animated.View>
          )}
        </YStack>
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
