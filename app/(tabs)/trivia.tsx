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
import { Brain, Trophy, ChevronRight, Check, X, BookOpen, Flame, Sparkles, ArrowRight } from '@tamagui/lucide-icons';
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
import { BannerAd } from '../../src/components/ads/BannerAd';
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
import type { QuestionWithFact, FactWithRelations } from '../../src/services/database';
import type { CategoryWithProgress } from '../../src/services/trivia';

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

// Trivia Hub View (main screen)
type TriviaView = 'hub' | 'daily' | 'mixed' | 'results';

interface TriviaState {
  view: TriviaView;
  questions: QuestionWithFact[];
  currentQuestionIndex: number;
  correctAnswers: number;
  wrongQuestionIds: number[];
  selectedAnswer: string | null;
  showResult: boolean;
}

export default function TriviaScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const isDark = theme === 'dark';
  const iconColor = useIconColor();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Trivia stats
  const [dailyStreak, setDailyStreak] = useState(0);
  const [dailyQuestionsCount, setDailyQuestionsCount] = useState(0);
  const [isDailyCompleted, setIsDailyCompleted] = useState(false);
  const [mixedQuestionsCount, setMixedQuestionsCount] = useState(0);
  const [overallStats, setOverallStats] = useState<triviaService.TriviaStats | null>(null);
  const [categoriesWithProgress, setCategoriesWithProgress] = useState<CategoryWithProgress[]>([]);
  
  // Trivia game state
  const [triviaState, setTriviaState] = useState<TriviaState>({
    view: 'hub',
    questions: [],
    currentQuestionIndex: 0,
    correctAnswers: 0,
    wrongQuestionIds: [],
    selectedAnswer: null,
    showResult: false,
  });
  
  // Results state
  const [wrongFacts, setWrongFacts] = useState<FactWithRelations[]>([]);
  
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
      setTriviaState({
        view: 'hub',
        questions: [],
        currentQuestionIndex: 0,
        correctAnswers: 0,
        wrongQuestionIds: [],
        selectedAnswer: null,
        showResult: false,
      });
      setWrongFacts([]);
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

  const handleStartFromIntroModal = async () => {
    if (!pendingTrivia) return;
    
    setPendingTrivia(null);
    
    if (pendingTrivia.type === 'daily') {
      await startDailyTrivia();
    } else if (pendingTrivia.type === 'mixed') {
      await startMixedTrivia();
    } else if (pendingTrivia.type === 'category' && pendingTrivia.categorySlug) {
      await startCategoryTrivia(pendingTrivia.categorySlug);
    }
  };

  const startDailyTrivia = async () => {
    try {
      setLoading(true);
      const questions = await triviaService.getDailyTriviaQuestions(locale);
      
      if (questions.length === 0) {
        setLoading(false);
        return;
      }
      
      setTriviaState({
        view: 'daily',
        questions,
        currentQuestionIndex: 0,
        correctAnswers: 0,
        wrongQuestionIds: [],
        selectedAnswer: null,
        showResult: false,
      });
      setLoading(false);
    } catch (error) {
      console.error('Error starting daily trivia:', error);
      setLoading(false);
    }
  };

  const startMixedTrivia = async () => {
    try {
      setLoading(true);
      const questions = await triviaService.getMixedTriviaQuestions(locale);
      
      if (questions.length === 0) {
        setLoading(false);
        return;
      }
      
      setTriviaState({
        view: 'mixed',
        questions,
        currentQuestionIndex: 0,
        correctAnswers: 0,
        wrongQuestionIds: [],
        selectedAnswer: null,
        showResult: false,
      });
      setLoading(false);
    } catch (error) {
      console.error('Error starting mixed trivia:', error);
      setLoading(false);
    }
  };

  const startCategoryTrivia = async (categorySlug: string) => {
    try {
      setLoading(true);
      const questions = await triviaService.getCategoryTriviaQuestions(categorySlug, locale);
      
      if (questions.length === 0) {
        setLoading(false);
        return;
      }
      
      setTriviaState({
        view: 'mixed', // Use mixed view for category trivia (same UI)
        questions,
        currentQuestionIndex: 0,
        correctAnswers: 0,
        wrongQuestionIds: [],
        selectedAnswer: null,
        showResult: false,
      });
      setLoading(false);
    } catch (error) {
      console.error('Error starting category trivia:', error);
      setLoading(false);
    }
  };

  const handleAnswerSelect = async (answer: string) => {
    if (triviaState.showResult) return;
    
    const currentQuestion = triviaState.questions[triviaState.currentQuestionIndex];
    const isCorrect = answer === currentQuestion.correct_answer;
    
    await triviaService.recordAnswer(
      currentQuestion.id,
      isCorrect,
      triviaState.view === 'daily' ? 'daily' : 'mixed'
    );
    
    setTriviaState(prev => ({
      ...prev,
      selectedAnswer: answer,
      showResult: true,
      correctAnswers: isCorrect ? prev.correctAnswers + 1 : prev.correctAnswers,
      wrongQuestionIds: isCorrect 
        ? prev.wrongQuestionIds 
        : [...prev.wrongQuestionIds, currentQuestion.id],
    }));
  };

  const handleNextQuestion = async () => {
    const nextIndex = triviaState.currentQuestionIndex + 1;
    
    if (nextIndex >= triviaState.questions.length) {
      if (triviaState.view === 'daily') {
        await triviaService.saveDailyProgress(
          triviaState.questions.length,
          triviaState.correctAnswers
        );
      }
      
      if (triviaState.wrongQuestionIds.length > 0) {
        const facts = await triviaService.getFactsForWrongAnswers(triviaState.wrongQuestionIds);
        setWrongFacts(facts);
      } else {
        setWrongFacts([]);
      }
      
      setTriviaState(prev => ({ ...prev, view: 'results' }));
      await loadTriviaData();
    } else {
      setTriviaState(prev => ({
        ...prev,
        currentQuestionIndex: nextIndex,
        selectedAnswer: null,
        showResult: false,
      }));
    }
  };

  const handleBackToHub = () => {
    setTriviaState({
      view: 'hub',
      questions: [],
      currentQuestionIndex: 0,
      correctAnswers: 0,
      wrongQuestionIds: [],
      selectedAnswer: null,
      showResult: false,
    });
    setWrongFacts([]);
    loadTriviaData();
  };

  const navigateToFact = (factId: number) => {
    router.push(`/fact/${factId}?source=trivia`);
  };

  // Loading state
  if (loading && triviaState.view === 'hub') {
    return (
      <ScreenContainer edges={["top"]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  // Trivia game view
  if (triviaState.view === 'daily' || triviaState.view === 'mixed') {
    const currentQuestion = triviaState.questions[triviaState.currentQuestionIndex];
    const answers = triviaService.getShuffledAnswers(currentQuestion);
    const progress = ((triviaState.currentQuestionIndex + 1) / triviaState.questions.length) * 100;
    
    return (
      <ScreenContainer edges={["top"]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <ContentContainer style={{ paddingTop: tokens.space.xl }}>
            {/* Progress bar */}
            <YStack gap={tokens.space.sm}>
              <XStack justifyContent="space-between" alignItems="center">
                <Text 
                  color={isDark ? '$textSecondary' : tokens.color.light.textSecondary}
                  fontSize={14}
                >
                  {t('questionOf', { current: triviaState.currentQuestionIndex + 1, total: triviaState.questions.length })}
                </Text>
                <XStack alignItems="center" gap={tokens.space.xs}>
                  <Check size={16} color={isDark ? tokens.color.dark.success : tokens.color.light.success} />
                  <Text color={isDark ? tokens.color.dark.success : tokens.color.light.success} fontWeight="600">
                    {triviaState.correctAnswers}
                  </Text>
                </XStack>
              </XStack>
              <YStack 
                height={4} 
                borderRadius={2} 
                backgroundColor={isDark ? tokens.color.dark.border : tokens.color.light.border}
              >
                <YStack 
                  height={4} 
                  borderRadius={2} 
                  backgroundColor={isDark ? tokens.color.dark.primary : tokens.color.light.primary}
                  width={`${progress}%`}
                />
              </YStack>
            </YStack>
            
            {/* Question */}
            <YStack 
              backgroundColor={isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground}
              padding={tokens.space.xl}
              borderRadius={tokens.radius.md}
              marginTop={tokens.space.lg}
            >
              <Text
                color={isDark ? '$text' : tokens.color.light.text}
                fontSize={17}
                fontWeight="500"
                lineHeight={24}
              >
                {currentQuestion.question_text}
              </Text>
            </YStack>
            
            {/* Answers */}
            <YStack gap={tokens.space.sm} marginTop={tokens.space.lg}>
              {answers.map((answer, index) => {
                const isSelected = triviaState.selectedAnswer === answer;
                const isCorrect = answer === currentQuestion.correct_answer;
                const showCorrect = triviaState.showResult && isCorrect;
                const showWrong = triviaState.showResult && isSelected && !isCorrect;
                
                let bgColor: string = isDark ? tokens.color.dark.surface : tokens.color.light.surface;
                let borderColor: string = isDark ? tokens.color.dark.border : tokens.color.light.border;
                
                if (showCorrect) {
                  bgColor = isDark ? 'rgba(0, 255, 136, 0.1)' : 'rgba(16, 185, 129, 0.1)';
                  borderColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
                } else if (showWrong) {
                  bgColor = isDark ? 'rgba(255, 71, 87, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                  borderColor = isDark ? tokens.color.dark.error : tokens.color.light.error;
                } else if (isSelected) {
                  borderColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
                }
                
                return (
                  <Pressable
                    key={index}
                    onPress={() => handleAnswerSelect(answer)}
                    disabled={triviaState.showResult}
                  >
                    <XStack
                      backgroundColor={bgColor}
                      borderWidth={1}
                      borderColor={borderColor}
                      padding={tokens.space.md}
                      borderRadius={tokens.radius.md}
                      alignItems="center"
                      gap={tokens.space.sm}
                    >
                      {showCorrect && (
                        <Check size={18} color={isDark ? tokens.color.dark.success : tokens.color.light.success} />
                      )}
                      {showWrong && (
                        <X size={18} color={isDark ? tokens.color.dark.error : tokens.color.light.error} />
                      )}
                      <Text
                        flex={1}
                        color={isDark ? '$text' : tokens.color.light.text}
                        fontSize={15}
                      >
                        {answer}
                      </Text>
                    </XStack>
                  </Pressable>
                );
              })}
            </YStack>
            
            {/* Explanation */}
            {triviaState.showResult && currentQuestion.explanation && (
              <YStack
                backgroundColor={isDark ? tokens.color.dark.primaryLight : tokens.color.light.primaryLight}
                padding={tokens.space.md}
                borderRadius={tokens.radius.md}
                marginTop={tokens.space.md}
              >
                <Text
                  color={isDark ? '$textSecondary' : tokens.color.light.textSecondary}
                  fontSize={12}
                  fontWeight="600"
                  marginBottom={4}
                >
                  {t('explanation')}
                </Text>
                <Text
                  color={isDark ? '$text' : tokens.color.light.text}
                  fontSize={14}
                  lineHeight={20}
                >
                  {currentQuestion.explanation}
                </Text>
              </YStack>
            )}
            
            {/* Next button */}
            {triviaState.showResult && (
              <Pressable onPress={handleNextQuestion}>
                <XStack
                  backgroundColor={isDark ? tokens.color.dark.primary : tokens.color.light.primary}
                  padding={tokens.space.md}
                  borderRadius={tokens.radius.md}
                  justifyContent="center"
                  alignItems="center"
                  marginTop={tokens.space.lg}
                >
                  <Text color="#FFFFFF" fontSize={15} fontWeight="600">
                    {triviaState.currentQuestionIndex + 1 >= triviaState.questions.length 
                      ? t('seeResults') 
                      : t('nextQuestion')}
                  </Text>
                </XStack>
              </Pressable>
            )}
          </ContentContainer>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // Results view
  if (triviaState.view === 'results') {
    const accuracy = triviaState.questions.length > 0 
      ? Math.round((triviaState.correctAnswers / triviaState.questions.length) * 100)
      : 0;
    const isPerfect = triviaState.correctAnswers === triviaState.questions.length;
    
    return (
      <ScreenContainer edges={["top"]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <ContentContainer style={{ paddingTop: tokens.space.xl }}>
            {/* Results card */}
            <YStack
              backgroundColor={isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground}
              padding={tokens.space.xl}
              borderRadius={tokens.radius.md}
              alignItems="center"
            >
              <Trophy 
                size={40} 
                color={isPerfect 
                  ? (isDark ? tokens.color.dark.neonYellow : tokens.color.light.neonYellow)
                  : (isDark ? tokens.color.dark.primary : tokens.color.light.primary)
                } 
              />
              <Text
                color={isDark ? '$text' : tokens.color.light.text}
                fontSize={20}
                fontWeight="600"
                marginTop={tokens.space.md}
              >
                {isPerfect ? t('perfectScore') : t('triviaComplete')}
              </Text>
              <Text
                color={isDark ? '$textSecondary' : tokens.color.light.textSecondary}
                fontSize={15}
                marginTop={tokens.space.xs}
              >
                {t('youGotCorrect', { correct: triviaState.correctAnswers, total: triviaState.questions.length })}
              </Text>
              <XStack marginTop={tokens.space.lg} gap={tokens.space.xxl}>
                <YStack alignItems="center">
                  <Text
                    color={isDark ? tokens.color.dark.success : tokens.color.light.success}
                    fontSize={28}
                    fontWeight="bold"
                  >
                    {accuracy}%
                  </Text>
                  <Text
                    color={isDark ? '$textSecondary' : tokens.color.light.textSecondary}
                    fontSize={12}
                  >
                    {t('accuracy')}
                  </Text>
                </YStack>
                {dailyStreak > 0 && (
                  <YStack alignItems="center">
                    <XStack alignItems="center" gap={4}>
                      <Flame size={20} color={isDark ? tokens.color.dark.neonOrange : tokens.color.light.neonOrange} />
                      <Text
                        color={isDark ? tokens.color.dark.neonOrange : tokens.color.light.neonOrange}
                        fontSize={28}
                        fontWeight="bold"
                      >
                        {dailyStreak}
                      </Text>
                    </XStack>
                    <Text
                      color={isDark ? '$textSecondary' : tokens.color.light.textSecondary}
                      fontSize={12}
                    >
                      {t('dayStreak')}
                    </Text>
                  </YStack>
                )}
              </XStack>
            </YStack>
            
            {/* Wrong answers */}
            {wrongFacts.length > 0 && (
              <YStack marginTop={tokens.space.xl}>
                <XStack alignItems="center" gap={tokens.space.sm} marginBottom={tokens.space.sm}>
                  <BookOpen size={18} color={isDark ? '$textSecondary' : tokens.color.light.textSecondary} />
                  <Text
                    color={isDark ? '$text' : tokens.color.light.text}
                    fontSize={15}
                    fontWeight="600"
                  >
                    {t('reviewFacts')}
                  </Text>
                </XStack>
                <YStack gap={tokens.space.xs}>
                  {wrongFacts.map((fact) => (
                    <Pressable key={fact.id} onPress={() => navigateToFact(fact.id)}>
                      <XStack
                        backgroundColor={isDark ? tokens.color.dark.surface : tokens.color.light.surface}
                        padding={tokens.space.md}
                        borderRadius={tokens.radius.md}
                        alignItems="center"
                        gap={tokens.space.sm}
                      >
                        <Text
                          flex={1}
                          color={isDark ? '$text' : tokens.color.light.text}
                          fontSize={14}
                          numberOfLines={2}
                        >
                          {fact.title || fact.content.substring(0, 80)}
                        </Text>
                        <ChevronRight size={18} color={isDark ? '$textSecondary' : tokens.color.light.textSecondary} />
                      </XStack>
                    </Pressable>
                  ))}
                </YStack>
              </YStack>
            )}
            
            {/* Action buttons */}
            <YStack gap={tokens.space.sm} marginTop={tokens.space.xl}>
              <Pressable onPress={handleBackToHub}>
                <XStack
                  backgroundColor={isDark ? tokens.color.dark.primary : tokens.color.light.primary}
                  padding={tokens.space.md}
                  borderRadius={tokens.radius.md}
                  justifyContent="center"
                  alignItems="center"
                >
                  <Text color="#FFFFFF" fontSize={15} fontWeight="600">
                    {t('backToTrivia')}
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          </ContentContainer>
        </ScrollView>
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

  // Helper to chunk categories into rows of 2
  const chunkCategories = (categories: CategoryWithProgress[], size: number) => {
    const chunks: CategoryWithProgress[][] = [];
    for (let i = 0; i < categories.length; i += size) {
      chunks.push(categories.slice(i, i + size));
    }
    return chunks;
  };

  const categoryRows = chunkCategories(categoriesWithProgress, 2);

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
          <ScreenHeader
            icon={<Brain size={28} color={iconColor} />}
            title={t('trivia')}
            rightElement={streakBadge}
          />
          
          <ContentContainer gap={tokens.space.lg}>
            {/* Always show Stats */}
            <TriviaStatsHero
              stats={overallStats}
              categories={categoriesWithProgress}
              isDark={isDark}
              t={t}
            />
            
            {(hasQuestions || hasCategories) ? (
              <Animated.View entering={FadeIn.duration(300)}>
                {/* Section title */}
                <Text
                  fontSize={17}
                  color={textColor}
                  fontFamily={FONT_FAMILIES.semibold}
                  marginBottom={tokens.space.md}
                  marginTop={tokens.space.sm}
                >
                  {t('triviaGameModes')}
                </Text>
                <TriviaGrid>
                  {/* First row: Daily Trivia + Mixed Trivia */}
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
                    />
                    <TriviaGridCard
                      type="mixed"
                      title={t('mixedTrivia')}
                      subtitle={t('mixedTriviaDescription')}
                      isDisabled={mixedQuestionsCount === 0}
                      isDark={isDark}
                      onPress={showMixedTriviaIntro}
                    />
                  </TriviaRow>
                  
                  {/* Category rows */}
                  {categoryRows.map((row, rowIndex) => (
                    <TriviaRow key={`row-${rowIndex}`}>
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
                      {/* Add empty spacer if odd number of categories in last row */}
                      {row.length === 1 && (
                        <View style={{ flex: 1 }} />
                      )}
                    </TriviaRow>
                  ))}
                </TriviaGrid>
              </Animated.View>
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
        <BannerAd position="trivia" />
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

