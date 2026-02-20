import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useFocusEffect } from '@react-navigation/native';
import { ArrowRight, Brain, Gamepad2, Sparkles } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import {
  ContentContainer,
  LoadingContainer,
  ScreenContainer,
  ScreenHeader,
  useIconColor,
} from '../../src/components';
import { InlineNativeAd } from '../../src/components/ads/InlineNativeAd';
import { TriviaGridCard, TriviaIntroModal, TriviaStatsHero } from '../../src/components/trivia';
import { FONT_FAMILIES, Text } from '../../src/components/Typography';
import { useScrollToTopHandler } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import { Screens, trackScreenView } from '../../src/services/analytics';
import { onPreferenceFeedRefresh } from '../../src/services/preferences';
import * as triviaService from '../../src/services/trivia';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { CategoryWithProgress } from '../../src/services/trivia';

export default function TriviaScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const isDark = theme === 'dark';
  const iconColor = useIconColor();
  const { isTablet, typography, config, iconSizes, spacing, radius } = useResponsive();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Scroll to top handler
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);
  useScrollToTopHandler('trivia', scrollToTop);

  // Trivia stats
  const [dailyStreak, setDailyStreak] = useState(0);
  const [dailyQuestionsCount, setDailyQuestionsCount] = useState(0);
  const [isDailyCompleted, setIsDailyCompleted] = useState(false);
  const [mixedQuestionsCount, setMixedQuestionsCount] = useState(0);
  const [overallStats, setOverallStats] = useState<triviaService.TriviaStats | null>(null);
  const [categoriesWithProgress, setCategoriesWithProgress] = useState<CategoryWithProgress[]>([]);

  // Pending trivia modal state
  const [pendingTrivia, setPendingTrivia] = useState<{
    type: 'daily' | 'mixed' | 'category';
    categorySlug?: string;
    categoryName?: string;
    categoryDescription?: string;
    categoryIcon?: string;
    categoryColor?: string;
    questionCount: number;
    masteredCount: number;
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
  } | null>(null);

  // Keep last valid data for smooth close animation
  const lastPendingTriviaRef = useRef(pendingTrivia);
  if (pendingTrivia !== null) {
    lastPendingTriviaRef.current = pendingTrivia;
  }
  const modalData = pendingTrivia ?? lastPendingTriviaRef.current;

  const loadTriviaData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);

        const [streak, dailyCount, dailyCompleted, mixedCount, stats, categories] =
          await Promise.all([
            triviaService.getDailyStreak(),
            triviaService.getDailyTriviaQuestionsCount(locale),
            triviaService.isDailyTriviaCompleted(),
            triviaService.getMixedTriviaQuestionsCount(locale),
            triviaService.getOverallStats(),
            triviaService.getCategoriesWithProgress(locale),
          ]);

        setDailyStreak(streak);
        setDailyQuestionsCount(dailyCount);
        setIsDailyCompleted(dailyCompleted);
        setMixedQuestionsCount(mixedCount);
        setOverallStats(stats);
        setCategoriesWithProgress(categories);
      } catch (error) {
        console.error('Error loading trivia data:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [locale]
  );

  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.TRIVIA || 'Trivia');
      loadTriviaData();
    }, [loadTriviaData])
  );

  useEffect(() => {
    const unsubscribe = onPreferenceFeedRefresh(() => {
      loadTriviaData();
    });

    return () => unsubscribe();
  }, [loadTriviaData]);

  // Show intro modal before starting trivia
  const showDailyTriviaIntro = () => {
    setPendingTrivia({
      type: 'daily',
      questionCount: Math.min(dailyQuestionsCount, triviaService.DAILY_TRIVIA_QUESTIONS),
      masteredCount: 0,
      totalQuestions: dailyQuestionsCount,
      answeredCount: 0,
      correctCount: 0,
    });
  };

  const showMixedTriviaIntro = () => {
    setPendingTrivia({
      type: 'mixed',
      questionCount: Math.min(mixedQuestionsCount, triviaService.MIXED_TRIVIA_QUESTIONS),
      masteredCount: overallStats?.totalMastered || 0,
      totalQuestions: mixedQuestionsCount,
      answeredCount: overallStats?.totalAnswered || 0,
      correctCount: overallStats?.totalCorrect || 0,
    });
  };

  const showCategoryTriviaIntro = (category: CategoryWithProgress) => {
    // Each session uses category trivia questions limit
    const remainingQuestions = Math.min(
      category.total - category.mastered,
      triviaService.CATEGORY_TRIVIA_QUESTIONS
    );
    setPendingTrivia({
      type: 'category',
      categorySlug: category.slug,
      categoryName: category.name,
      categoryDescription: category.description || undefined,
      categoryIcon: category.icon || undefined,
      categoryColor: category.color_hex || undefined,
      questionCount: remainingQuestions,
      masteredCount: category.mastered,
      totalQuestions: category.total,
      answeredCount: category.answered,
      correctCount: category.correct,
    });
  };

  const handleCloseIntroModal = () => {
    setPendingTrivia(null);
  };

  const handleStartFromIntroModal = () => {
    if (!pendingTrivia) return;

    const triviaInfo = pendingTrivia;
    setPendingTrivia(null);

    // Navigate to the new trivia game screen
    if (triviaInfo.type === 'daily') {
      router.push('/trivia/game?type=daily');
    } else if (triviaInfo.type === 'mixed') {
      router.push('/trivia/game?type=mixed');
    } else if (triviaInfo.type === 'category' && triviaInfo.categorySlug) {
      router.push(
        `/trivia/game?type=category&categorySlug=${triviaInfo.categorySlug}&categoryName=${encodeURIComponent(triviaInfo.categoryName || '')}`
      );
    }
  };

  // Loading state
  if (loading) {
    return (
      <ScreenContainer edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={hexColors.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  // Hub view (main trivia screen)
  // Check if there are any questions available (daily, mixed, or any category with questions)
  const hasCategoryQuestions = categoriesWithProgress.some((cat) => cat.total > 0);
  const hasQuestions = dailyQuestionsCount > 0 || mixedQuestionsCount > 0 || hasCategoryQuestions;
  // Show categories section if user has selected categories (even if no questions yet)
  const hasCategories = categoriesWithProgress.length > 0;

  // Colors for empty state
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const primaryLightColor = isDark ? hexColors.dark.primaryLight : hexColors.light.primaryLight;
  const cardBg = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const purpleColor = isDark ? hexColors.dark.neonPurple : hexColors.light.neonPurple;


  // Streak badge for header
  const isStreakActive = dailyStreak > 0;
  const streakColor = isStreakActive ? '#8B5CF6' : secondaryTextColor;
  const streakBadge = (
    <Pressable onPress={() => router.push('/badges')} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <XStack
        alignItems="center"
        gap={spacing.xs}
        paddingHorizontal={spacing.sm}
        paddingVertical={spacing.xs}
        borderRadius={radius.md}
        backgroundColor={isStreakActive ? `${streakColor}15` : `${cardBg}20`}
      >
        <Gamepad2 size={iconSizes.sm} color={streakColor} />
        <Text.Label fontFamily={FONT_FAMILIES.semibold} color={streakColor}>
          {dailyStreak}
        </Text.Label>
      </XStack>
    </Pressable>
  );

  // Helper to chunk categories into rows
  const chunkCategories = (categories: CategoryWithProgress[], size: number) => {
    const chunks: CategoryWithProgress[][] = [];
    for (let i = 0; i < categories.length; i += size) {
      chunks.push(categories.slice(i, i + size));
    }
    return chunks;
  };

  // On tablets, show 4 categories per row; on phones, show 2
  const categoriesPerRow = config.triviaCategoriesPerRow;
  const categoryRows = chunkCategories(categoriesWithProgress, categoriesPerRow);

  return (
    <ScreenContainer edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <YStack flex={1}>
        <Animated.View
          entering={FadeIn.duration(300)}
          needsOffscreenAlphaCompositing={Platform.OS === 'android'}
        >
          <ScreenHeader
            icon={<Brain size={iconSizes.lg} color={iconColor} />}
            title={t('trivia')}
            rightElement={streakBadge}
          />
        </Animated.View>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadTriviaData(true)} />
          }
        >
          <ContentContainer paddingBottom={spacing.md}>
            {/* Always show Stats */}
            <Animated.View
              entering={FadeInDown.delay(50).duration(300)}
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}
            >
              <TriviaStatsHero
                stats={overallStats}
                categories={categoriesWithProgress}
                isDark={isDark}
                t={t}
                onPress={() => router.push('/(tabs)/trivia/performance')}
              />
            </Animated.View>

            {hasQuestions || hasCategories ? (
              <>
                {/* Section title */}
                <Animated.View
                  entering={FadeInDown.delay(100).duration(300)}
                  needsOffscreenAlphaCompositing={Platform.OS === 'android'}
                >
                  <Text.Body
                    color={textColor}
                    fontFamily={FONT_FAMILIES.semibold}
                    marginTop={spacing.xl}
                    marginBottom={spacing.sm}
                    marginLeft={spacing.sm}
                  >
                    {t('triviaGameModes')}
                  </Text.Body>
                </Animated.View>
                <View style={{ gap: spacing.md }}>
                  {/* First row: Daily Trivia + Mixed Trivia */}
                  <Animated.View
                    entering={FadeInDown.delay(150).duration(300)}
                    needsOffscreenAlphaCompositing={Platform.OS === 'android'}
                  >
                    <XStack gap={spacing.md}>
                      <TriviaGridCard
                        type="daily"
                        title={t('dailyTrivia')}
                        subtitle={
                          isDailyCompleted
                            ? t('dailyTriviaCompleted')
                            : dailyQuestionsCount > 0
                              ? t('triviaQuestionsCount', {
                                  count: Math.min(
                                    dailyQuestionsCount,
                                    triviaService.DAILY_TRIVIA_QUESTIONS
                                  ),
                                })
                              : t('noQuestionsYet')
                        }
                        isCompleted={isDailyCompleted}
                        isDisabled={dailyQuestionsCount === 0}
                        isDark={isDark}
                        onPress={showDailyTriviaIntro}
                        centerContent={isTablet}
                      />
                      <TriviaGridCard
                        type="mixed"
                        title={t('mixedTrivia')}
                        subtitle={t('mixedTriviaDescription')}
                        isDisabled={mixedQuestionsCount === 0}
                        isDark={isDark}
                        onPress={showMixedTriviaIntro}
                        centerContent={isTablet}
                      />
                    </XStack>
                  </Animated.View>

                  {/* Native Ad */}
                  <InlineNativeAd />

                  {/* Category rows */}
                  {categoryRows.map((row, rowIndex) => (
                    <Animated.View
                      key={`row-${rowIndex}`}
                      entering={FadeInDown.delay(200 + rowIndex * 50).duration(300)}
                      needsOffscreenAlphaCompositing={Platform.OS === 'android'}
                    >
                      <XStack gap={spacing.md}>
                        {row.map((category) => (
                          <TriviaGridCard
                            key={category.slug}
                            type="category"
                            title={category.name}
                            icon={category.icon || undefined}
                            colorHex={category.color_hex || undefined}
                            progress={{ mastered: category.mastered, total: category.total }}
                            isDisabled={category.isComplete || category.total === 0}
                            isDark={isDark}
                            onPress={() => showCategoryTriviaIntro(category)}
                          />
                        ))}
                        {/* Add empty spacers if the row is not full */}
                        {row.length < categoriesPerRow &&
                          Array.from({ length: categoriesPerRow - row.length }).map((_, i) => (
                            <View key={`spacer-${i}`} style={{ flex: 1 }} />
                          ))}
                      </XStack>
                    </Animated.View>
                  ))}
                </View>
              </>
            ) : (
              /* Engaging Empty State */
              <Animated.View
                entering={FadeInDown.duration(400).delay(200)}
                needsOffscreenAlphaCompositing={Platform.OS === 'android'}
              >
                <YStack
                  backgroundColor={cardBg}
                  borderRadius={radius.lg}
                  padding={spacing.xl}
                  alignItems="center"
                  gap={spacing.lg}
                >
                  {/* Animated Icon */}
                  <YStack
                    width={iconSizes.heroLg}
                    height={iconSizes.heroLg}
                    borderRadius={iconSizes.heroLg / 2}
                    backgroundColor={primaryLightColor}
                    justifyContent="center"
                    alignItems="center"
                  >
                    <Sparkles size={iconSizes.hero} color={purpleColor} />
                  </YStack>

                  {/* Title & Description */}
                  <YStack alignItems="center" gap={spacing.sm}>
                    <Text.Title color={textColor} textAlign="center">
                      {t('triviaEmptyTitle')}
                    </Text.Title>
                    <Text.Body color={secondaryTextColor} textAlign="center">
                      {t('triviaEmptyDescription')}
                    </Text.Body>
                  </YStack>

                  {/* CTA Button */}
                  <Pressable
                    onPress={() => router.push('/(tabs)/')}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.8 : 1,
                      width: '100%',
                    })}
                  >
                    <XStack
                      backgroundColor={primaryColor}
                      paddingVertical={spacing.md}
                      paddingHorizontal={spacing.xl}
                      borderRadius={radius.md}
                      justifyContent="center"
                      alignItems="center"
                      gap={spacing.sm}
                    >
                      <Text.Label color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                        {t('startExploring')}
                      </Text.Label>
                      <ArrowRight size={typography.fontSize.title} color="#FFFFFF" />
                    </XStack>
                  </Pressable>
                </YStack>
              </Animated.View>
            )}
          </ContentContainer>
        </ScrollView>
      </YStack>

      {/* Trivia Intro Modal */}
      <TriviaIntroModal
        visible={pendingTrivia !== null}
        onStart={handleStartFromIntroModal}
        onClose={handleCloseIntroModal}
        type={modalData?.type || 'daily'}
        categoryName={modalData?.categoryName}
        categoryDescription={modalData?.categoryDescription}
        categoryIcon={modalData?.categoryIcon}
        categoryColor={modalData?.categoryColor}
        questionCount={modalData?.questionCount || 0}
        masteredCount={modalData?.masteredCount}
        totalQuestions={modalData?.totalQuestions}
        answeredCount={modalData?.answeredCount}
        correctCount={modalData?.correctCount}
      />
    </ScreenContainer>
  );
}
