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
import { styled, Text as TamaguiText } from '@tamagui/core';
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
import { tokens } from '../../src/theme/tokens';
import { FONT_FAMILIES } from '../../src/components/Typography';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { getLucideIcon } from '../../src/utils/iconMapper';
import { useResponsive } from '../../src/utils/useResponsive';
import * as triviaService from '../../src/services/trivia';
import { TriviaResults, getTriviaModeBadge } from '../../src/components/trivia';
import type { TriviaStats, CategoryWithProgress, TriviaSessionWithCategory } from '../../src/services/trivia';
import { trackScreenView, Screens, trackTriviaResultsView, TriviaMode } from '../../src/services/analytics';

const MAX_DISPLAY_CATEGORIES = 3;
const MAX_DISPLAY_ACTIVITIES = 3;

// Styled Text components
const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

// Back Button with press animation
function BackButton({ 
  onPress, 
  primaryColor 
}: { 
  onPress: () => void; 
  primaryColor: string;
}) {
  const scale = useRef(new RNAnimated.Value(1)).current;

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
    >
      <RNAnimated.View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: `${primaryColor}20`,
          justifyContent: 'center',
          alignItems: 'center',
          transform: [{ scale }],
        }}
      >
        <ChevronLeft size={24} color={primaryColor} />
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
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const subtitleColor = isDark ? tokens.color.dark.neonGreen : tokens.color.light.success;

  return (
    <YStack
      flex={1}
      backgroundColor={cardBg}
      borderRadius={tokens.radius.lg}
      padding={tokens.space.lg}
      gap={tokens.space.sm}
    >
      <XStack alignItems="center" gap={tokens.space.sm}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            backgroundColor: iconBgColor,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {icon}
        </View>
        <Text
          fontSize={14}
          color={isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary}
          fontFamily={FONT_FAMILIES.medium}
        >
          {label}
        </Text>
      </XStack>
      <Text
        fontSize={32}
        fontFamily={FONT_FAMILIES.bold}
        color={textColor}
      >
        {value}
      </Text>
      {subtitle && (
        <Text
          fontSize={13}
          color={subtitleColor}
          fontFamily={FONT_FAMILIES.medium}
        >
          {subtitle}
        </Text>
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
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const trackColor = isDark ? tokens.color.dark.border : tokens.color.light.border;
  const progressColor = category.color_hex || (isDark ? tokens.color.dark.primary : tokens.color.light.primary);
  // Use accuracy (correct/answered) instead of mastered/total
  const percentage = category.accuracy;

  return (
    <YStack gap={tokens.space.xs}>
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap={tokens.space.sm}>
          {getLucideIcon(category.icon, 18, progressColor)}
          <Text
            fontSize={15}
            color={textColor}
            fontFamily={FONT_FAMILIES.medium}
          >
            {category.name}
          </Text>
        </XStack>
        <Text
          fontSize={14}
          color={textColor}
          fontFamily={FONT_FAMILIES.semibold}
        >
          {percentage}%
        </Text>
      </XStack>
      <View
        style={{
          width: '100%',
          height: 8,
          backgroundColor: trackColor,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: progressColor,
            borderRadius: 4,
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
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const warningColor = '#F59E0B';
  const errorColor = isDark ? tokens.color.dark.error : tokens.color.light.error;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;

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
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: `${iconColor}20`,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {getLucideIcon(session.category.icon, 22, iconColor)}
        </View>
      );
    }
    
    const IconComponent = session.trivia_mode === 'daily' ? Calendar : Shuffle;
    const iconColor = primaryColor;
    
    return (
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: `${iconColor}20`,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <IconComponent size={22} color={iconColor} />
      </View>
    );
  };

  const hasResultData = session.questions_json && session.answers_json;

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
        borderRadius={tokens.radius.lg}
        padding={tokens.space.lg}
        alignItems="center"
        gap={tokens.space.sm}
      >
        {getIcon()}
        <YStack flex={1} gap={2}>
          <Text
            fontSize={16}
            fontFamily={FONT_FAMILIES.semibold}
            color={textColor}
          >
            {getDisplayName()}
          </Text>
          <Text
            fontSize={13}
            color={secondaryTextColor}
          >
            {getDateDisplay()}
          </Text>
        </YStack>
        <YStack alignItems="flex-end" gap={2}>
          <Text
            fontSize={14}
            fontFamily={FONT_FAMILIES.semibold}
            color={feedback.color}
          >
            {feedback.text}
          </Text>
          <Text
            fontSize={13}
            color={secondaryTextColor}
          >
            {t('score')}: {session.correct_answers}/{session.total_questions}
          </Text>
        </YStack>
        {hasResultData && (
          <ChevronRight size={20} color={secondaryTextColor} />
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
  const { isTablet } = useResponsive();

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
        triviaService.getRecentSessions(MAX_DISPLAY_ACTIVITIES),
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
  const bgColor = isDark ? tokens.color.dark.background : tokens.color.light.background;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const accentColor = isDark ? tokens.color.dark.accent : tokens.color.light.accent;
  const purpleColor = isDark ? tokens.color.dark.neonPurple : tokens.color.light.neonPurple;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;

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
      />
    );
  }

  // Take top 4 categories for display, sorted by accuracy high to low
  const displayCategories = categories
    .filter(c => c.total > 0 && c.accuracy > 0)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, MAX_DISPLAY_CATEGORIES);
  
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
          paddingTop={insets.top + tokens.space.sm}
          paddingBottom={tokens.space.md}
          paddingHorizontal={tokens.space.lg}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor={isDark ? tokens.color.dark.border : tokens.color.light.border}
        >
          <BackButton onPress={() => router.back()} primaryColor={primaryColor} />
          
          <Text
            fontSize={20}
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
          >
            {t('triviaPerformance')}
          </Text>
          
          {/* Empty spacer to balance the header */}
          <View style={{ width: 36, height: 36 }} />
        </XStack>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />
        }
      >
        <YStack padding={tokens.space.lg} gap={tokens.space.xl}>
          {/* Core Metrics */}
          <Animated.View entering={FadeIn.delay(50).duration(400).springify()}>
            <Text
              fontSize={18}
              fontFamily={FONT_FAMILIES.bold}
              color={textColor}
              marginBottom={tokens.space.md}
            >
              {t('coreMetrics')}
            </Text>
            
            {isTablet ? (
              /* Tablet: All 4 metrics in a single row */
              <XStack gap={tokens.space.md}>
                <MetricCard
                  icon={<Gamepad2 size={16} color={purpleColor} />}
                  iconColor={purpleColor}
                  iconBgColor={`${purpleColor}20`}
                  label={t('tests')}
                  value={stats?.testsTaken || 0}
                  subtitle={stats?.testsThisWeek ? t('thisWeek', { count: stats.testsThisWeek }) : undefined}
                  isDark={isDark}
                />
                <MetricCard
                  icon={<CheckCircle size={16} color={successColor} />}
                  iconColor={successColor}
                  iconBgColor={`${successColor}20`}
                  label={t('correct')}
                  value={stats?.totalCorrect || 0}
                  subtitle={stats?.correctToday ? t('todayCount', { count: stats.correctToday }) : undefined}
                  isDark={isDark}
                />
                <MetricCard
                  icon={<Hash size={16} color={primaryColor} />}
                  iconColor={primaryColor}
                  iconBgColor={`${primaryColor}20`}
                  label={t('answered')}
                  value={stats?.totalAnswered || 0}
                  isDark={isDark}
                />
                <MetricCard
                  icon={<Trophy size={16} color={accentColor} />}
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
              <YStack gap={tokens.space.md}>
                {/* Row 1: Tests & Correct */}
                <XStack gap={tokens.space.md}>
                  <MetricCard
                    icon={<Gamepad2 size={16} color={purpleColor} />}
                    iconColor={purpleColor}
                    iconBgColor={`${purpleColor}20`}
                    label={t('tests')}
                    value={stats?.testsTaken || 0}
                    subtitle={stats?.testsThisWeek ? t('thisWeek', { count: stats.testsThisWeek }) : undefined}
                    isDark={isDark}
                  />
                  <MetricCard
                    icon={<CheckCircle size={16} color={successColor} />}
                    iconColor={successColor}
                    iconBgColor={`${successColor}20`}
                    label={t('correct')}
                    value={stats?.totalCorrect || 0}
                    subtitle={stats?.correctToday ? t('todayCount', { count: stats.correctToday }) : undefined}
                    isDark={isDark}
                  />
                </XStack>
                
                {/* Row 2: Answered & Mastered */}
                <XStack gap={tokens.space.md}>
                  <MetricCard
                    icon={<Hash size={16} color={primaryColor} />}
                    iconColor={primaryColor}
                    iconBgColor={`${primaryColor}20`}
                    label={t('answered')}
                    value={stats?.totalAnswered || 0}
                    isDark={isDark}
                  />
                  <MetricCard
                    icon={<Trophy size={16} color={accentColor} />}
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
              <YStack marginBottom={tokens.space.md} gap={tokens.space.xs}>
                <XStack alignItems="center" justifyContent="space-between">
                  <Text
                    fontSize={18}
                    fontFamily={FONT_FAMILIES.bold}
                    color={textColor}
                  >
                    {t('accuracyByCategory')}
                  </Text>
                  {allCategoriesWithAccuracy.length > MAX_DISPLAY_CATEGORIES && (
                    <Pressable onPress={() => router.push('/(tabs)/trivia/categories')}>
                      <Text
                        fontSize={14}
                        fontFamily={FONT_FAMILIES.semibold}
                        color={primaryColor}
                      >
                        {t('viewAll')}
                      </Text>
                    </Pressable>
                  )}
                </XStack>
                <Text
                  fontSize={14}
                  fontFamily={FONT_FAMILIES.regular}
                  color={isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary}
                  opacity={0.9}
                >
                  {t('accuracyByCategorySubtitle')}
                </Text>
              </YStack>
              
              <YStack
                backgroundColor={cardBg}
                borderRadius={tokens.radius.lg}
                padding={tokens.space.lg}
                gap={tokens.space.lg}
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
              <XStack alignItems="center" justifyContent="space-between" marginBottom={tokens.space.md}>
                <Text
                  fontSize={18}
                  fontFamily={FONT_FAMILIES.bold}
                  color={textColor}
                >
                  {t('recentTests')}
                </Text>
                {totalSessionsCount > MAX_DISPLAY_ACTIVITIES && (
                  <Pressable onPress={() => router.push('/(tabs)/trivia/history')}>
                    <Text
                      fontSize={14}
                      fontFamily={FONT_FAMILIES.semibold}
                      color={primaryColor}
                    >
                      {t('viewAll')}
                    </Text>
                  </Pressable>
                )}
              </XStack>
              
              <YStack gap={tokens.space.md}>
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
