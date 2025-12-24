import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { 
  ScrollView, 
  RefreshControl, 
  ActivityIndicator,
  Pressable,
  View,
} from 'react-native';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { Brain, Flame, Sparkles, ArrowRight } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { tokens } from '../../src/theme/tokens';
import {
  ScreenContainer,
  ScreenHeader,
  ContentContainer,
  LoadingContainer,
  useIconColor,
} from '../../src/components';
import { FONT_FAMILIES } from '../../src/components/Typography';
import {
  TriviaStatsHero,
  TriviaGridCard,
  TriviaIntroModal,
} from '../../src/components/trivia';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { trackScreenView, Screens } from '../../src/services/analytics';
import { onPreferenceFeedRefresh } from '../../src/services/preferences';
import * as triviaService from '../../src/services/trivia';
import type { CategoryWithProgress } from '../../src/services/trivia';
import { useResponsive } from '../../src/utils/useResponsive';

// Styled Text components
const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

// Grid styled components
const TriviaGrid = styled(View, {
  gap: tokens.space.md,
});

const TriviaRow = styled(XStack, {
  gap: tokens.space.md,
});


export default function TriviaScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const isDark = theme === 'dark';
  const iconColor = useIconColor();
  const { isTablet } = useResponsive();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
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

  const loadTriviaData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      
      const [streak, dailyCount, dailyCompleted, mixedCount, stats, categories] = await Promise.all([
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
  }, [locale]);

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
    const remainingQuestions = Math.min(category.total - category.mastered, triviaService.CATEGORY_TRIVIA_QUESTIONS);
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
      router.push(`/trivia/game?type=category&categorySlug=${triviaInfo.categorySlug}&categoryName=${encodeURIComponent(triviaInfo.categoryName || '')}`);
    }
  };


  // Loading state
  if (loading) {
    return (
      <ScreenContainer edges={["top"]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }


  // Hub view (main trivia screen)
  // Check if there are any questions available (daily, mixed, or any category with questions)
  const hasCategoryQuestions = categoriesWithProgress.some(cat => cat.total > 0);
  const hasQuestions = dailyQuestionsCount > 0 || mixedQuestionsCount > 0 || hasCategoryQuestions;
  // Show categories section if user has selected categories (even if no questions yet)
  const hasCategories = categoriesWithProgress.length > 0;
  
  // Colors for empty state
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const primaryLightColor = isDark ? tokens.color.dark.primaryLight : tokens.color.light.primaryLight;
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const purpleColor = isDark ? tokens.color.dark.neonPurple : tokens.color.light.neonPurple;
  const orangeColor = isDark ? tokens.color.dark.neonOrange : tokens.color.light.neonOrange;

  // Streak badge for header (only show when streak > 0)
  const streakBadge = dailyStreak > 0 ? (
    <XStack alignItems="center" gap={4}>
      <Flame size={18} color={orangeColor} />
      <Text 
        fontSize={16} 
        fontWeight="600" 
        color={orangeColor}
        fontFamily={FONT_FAMILIES.semibold}
      >
        {dailyStreak}
      </Text>
    </XStack>
  ) : undefined;

  // Helper to chunk categories into rows
  const chunkCategories = (categories: CategoryWithProgress[], size: number) => {
    const chunks: CategoryWithProgress[][] = [];
    for (let i = 0; i < categories.length; i += size) {
      chunks.push(categories.slice(i, i + size));
    }
    return chunks;
  };

  // On tablets, show 4 categories per row; on phones, show 2
  const categoriesPerRow = isTablet ? 4 : 2;
  const categoryRows = chunkCategories(categoriesWithProgress, categoriesPerRow);

  return (
    <ScreenContainer edges={["top"]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <YStack flex={1}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadTriviaData(true)} />
          }
        >
          <Animated.View entering={FadeIn.duration(300)}>
            <ScreenHeader
              icon={<Brain size={28} color={iconColor} />}
              title={t('trivia')}
              rightElement={streakBadge}
            />
          </Animated.View>
          
          <ContentContainer gap={tokens.space.lg} paddingBottom={tokens.space.md}>
            {/* Always show Stats */}
            <Animated.View entering={FadeInDown.delay(50).duration(300)}>
              <TriviaStatsHero
                stats={overallStats}
                categories={categoriesWithProgress}
                isDark={isDark}
                t={t}
                onPress={() => router.push('/(tabs)/trivia/performance')}
              />
            </Animated.View>
            
            {(hasQuestions || hasCategories) ? (
              <>
                {/* Section title */}
                <Animated.View entering={FadeInDown.delay(100).duration(300)}>
                  <Text
                    fontSize={17}
                    color={textColor}
                    fontFamily={FONT_FAMILIES.semibold}
                    marginTop={tokens.space.sm}
                  >
                    {t('triviaGameModes')}
                  </Text>
                </Animated.View>
                <TriviaGrid>
                  {/* First row: Daily Trivia + Mixed Trivia */}
                  <Animated.View entering={FadeInDown.delay(150).duration(300)}>
                    <TriviaRow>
                      <TriviaGridCard
                        type="daily"
                        title={t('dailyTrivia')}
                        subtitle={isDailyCompleted 
                          ? t('dailyTriviaCompleted')
                          : dailyQuestionsCount > 0 
                            ? t('triviaQuestionsCount', { count: Math.min(dailyQuestionsCount, triviaService.DAILY_TRIVIA_QUESTIONS) })
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
                    </TriviaRow>
                  </Animated.View>
                  
                  {/* Category rows */}
                  {categoryRows.map((row, rowIndex) => (
                    <Animated.View key={`row-${rowIndex}`} entering={FadeInDown.delay(200 + rowIndex * 50).duration(300)}>
                      <TriviaRow>
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
                        {row.length < categoriesPerRow && (
                          Array.from({ length: categoriesPerRow - row.length }).map((_, i) => (
                            <View key={`spacer-${i}`} style={{ flex: 1 }} />
                          ))
                        )}
                      </TriviaRow>
                    </Animated.View>
                  ))}
                </TriviaGrid>
              </>
            ) : (
              /* Engaging Empty State */
              <Animated.View entering={FadeInDown.duration(400).delay(200)}>
                <YStack
                  backgroundColor={cardBg}
                  borderRadius={tokens.radius.lg}
                  padding={tokens.space.xl}
                  alignItems="center"
                  gap={tokens.space.lg}
                >
                  {/* Animated Icon */}
                  <YStack
                    width={80}
                    height={80}
                    borderRadius={40}
                    backgroundColor={primaryLightColor}
                    justifyContent="center"
                    alignItems="center"
                  >
                    <Sparkles size={40} color={purpleColor} />
                  </YStack>
                  
                  {/* Title & Description */}
                  <YStack alignItems="center" gap={tokens.space.sm}>
                    <Text
                      fontSize={20}
                      fontWeight="700"
                      color={textColor}
                      textAlign="center"
                      fontFamily={FONT_FAMILIES.bold}
                    >
                      {t('triviaEmptyTitle')}
                    </Text>
                    <Text
                      fontSize={15}
                      color={secondaryTextColor}
                      textAlign="center"
                      lineHeight={22}
                    >
                      {t('triviaEmptyDescription')}
                    </Text>
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
                      paddingVertical={tokens.space.md}
                      paddingHorizontal={tokens.space.xl}
                      borderRadius={tokens.radius.md}
                      justifyContent="center"
                      alignItems="center"
                      gap={tokens.space.sm}
                    >
                      <Text
                        color="#FFFFFF"
                        fontSize={15}
                        fontWeight="600"
                        fontFamily={FONT_FAMILIES.semibold}
                      >
                        {t('startExploring')}
                      </Text>
                      <ArrowRight size={18} color="#FFFFFF" />
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

