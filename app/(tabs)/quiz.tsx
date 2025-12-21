import React, { useState, useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { 
  ScrollView, 
  RefreshControl, 
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { Brain, Trophy, ChevronRight, Check, X, BookOpen, Flame } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { tokens } from '../../src/theme/tokens';
import {
  H2,
  EmptyState,
  ScreenContainer,
  ScreenHeader,
  ContentContainer,
  LoadingContainer,
  useIconColor,
} from '../../src/components';
import { FONT_FAMILIES } from '../../src/components/Typography';
import { BannerAd } from '../../src/components/ads/BannerAd';
import {
  QuizStatsHero,
  DailyChallengeCard,
  CategoryQuestCard,
} from '../../src/components/quiz';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { trackScreenView, Screens } from '../../src/services/analytics';
import { onPreferenceFeedRefresh } from '../../src/services/preferences';
import * as quizService from '../../src/services/quiz';
import type { QuestionWithFact, FactWithRelations } from '../../src/services/database';

// Styled Text components
const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

// Quiz Hub View (main screen)
type QuizView = 'hub' | 'daily' | 'category' | 'results';

interface QuizState {
  view: QuizView;
  currentCategorySlug?: string;
  currentCategoryName?: string;
  questions: QuestionWithFact[];
  currentQuestionIndex: number;
  correctAnswers: number;
  wrongQuestionIds: number[];
  selectedAnswer: string | null;
  showResult: boolean;
}

export default function QuizScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const isDark = theme === 'dark';
  const iconColor = useIconColor();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Quiz stats
  const [dailyStreak, setDailyStreak] = useState(0);
  const [dailyQuestionsCount, setDailyQuestionsCount] = useState(0);
  const [isDailyCompleted, setIsDailyCompleted] = useState(false);
  const [categories, setCategories] = useState<quizService.CategoryWithProgress[]>([]);
  const [overallStats, setOverallStats] = useState<quizService.QuizStats | null>(null);
  
  // Quiz game state
  const [quizState, setQuizState] = useState<QuizState>({
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

  const loadQuizData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      
      const [streak, dailyCount, dailyCompleted, cats, stats] = await Promise.all([
        quizService.getDailyStreak(),
        quizService.getDailyQuizQuestionsCount(locale),
        quizService.isDailyQuizCompleted(),
        quizService.getCategoriesWithProgress(locale),
        quizService.getOverallStats(),
      ]);
      
      setDailyStreak(streak);
      setDailyQuestionsCount(dailyCount);
      setIsDailyCompleted(dailyCompleted);
      setCategories(cats);
      setOverallStats(stats);
    } catch (error) {
      console.error('Error loading quiz data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [locale]);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.QUIZ || 'Quiz');
      loadQuizData();
    }, [loadQuizData])
  );

  useEffect(() => {
    const unsubscribe = onPreferenceFeedRefresh(() => {
      setQuizState({
        view: 'hub',
        questions: [],
        currentQuestionIndex: 0,
        correctAnswers: 0,
        wrongQuestionIds: [],
        selectedAnswer: null,
        showResult: false,
      });
      setWrongFacts([]);
      loadQuizData();
    });

    return () => unsubscribe();
  }, [loadQuizData]);

  const startDailyQuiz = async () => {
    try {
      setLoading(true);
      const questions = await quizService.getDailyQuizQuestions(locale);
      
      if (questions.length === 0) {
        setLoading(false);
        return;
      }
      
      setQuizState({
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
      console.error('Error starting daily quiz:', error);
      setLoading(false);
    }
  };

  const startCategoryQuiz = async (categorySlug: string, categoryName: string) => {
    try {
      setLoading(true);
      const questions = await quizService.getCategoryQuizQuestions(categorySlug, locale);
      
      if (questions.length === 0) {
        setLoading(false);
        return;
      }
      
      setQuizState({
        view: 'category',
        currentCategorySlug: categorySlug,
        currentCategoryName: categoryName,
        questions,
        currentQuestionIndex: 0,
        correctAnswers: 0,
        wrongQuestionIds: [],
        selectedAnswer: null,
        showResult: false,
      });
      setLoading(false);
    } catch (error) {
      console.error('Error starting category quiz:', error);
      setLoading(false);
    }
  };

  const handleAnswerSelect = async (answer: string) => {
    if (quizState.showResult) return;
    
    const currentQuestion = quizState.questions[quizState.currentQuestionIndex];
    const isCorrect = answer === currentQuestion.correct_answer;
    
    await quizService.recordAnswer(
      currentQuestion.id,
      isCorrect,
      quizState.view === 'daily' ? 'daily' : 'category'
    );
    
    setQuizState(prev => ({
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
    const nextIndex = quizState.currentQuestionIndex + 1;
    
    if (nextIndex >= quizState.questions.length) {
      if (quizState.view === 'daily') {
        await quizService.saveDailyProgress(
          quizState.questions.length,
          quizState.correctAnswers
        );
      }
      
      if (quizState.wrongQuestionIds.length > 0) {
        const facts = await quizService.getFactsForWrongAnswers(quizState.wrongQuestionIds);
        setWrongFacts(facts);
      } else {
        setWrongFacts([]);
      }
      
      setQuizState(prev => ({ ...prev, view: 'results' }));
      await loadQuizData();
    } else {
      setQuizState(prev => ({
        ...prev,
        currentQuestionIndex: nextIndex,
        selectedAnswer: null,
        showResult: false,
      }));
    }
  };

  const handleBackToHub = () => {
    setQuizState({
      view: 'hub',
      questions: [],
      currentQuestionIndex: 0,
      correctAnswers: 0,
      wrongQuestionIds: [],
      selectedAnswer: null,
      showResult: false,
    });
    setWrongFacts([]);
    loadQuizData();
  };

  const handleContinueCategoryQuiz = async () => {
    if (quizState.currentCategorySlug && quizState.currentCategoryName) {
      await startCategoryQuiz(quizState.currentCategorySlug, quizState.currentCategoryName);
    }
  };

  const navigateToFact = (factId: number) => {
    router.push(`/fact/${factId}?source=quiz`);
  };

  // Loading state
  if (loading && quizState.view === 'hub') {
    return (
      <ScreenContainer edges={["top"]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  // Quiz game view
  if (quizState.view === 'daily' || quizState.view === 'category') {
    const currentQuestion = quizState.questions[quizState.currentQuestionIndex];
    const answers = quizService.getShuffledAnswers(currentQuestion);
    const progress = ((quizState.currentQuestionIndex + 1) / quizState.questions.length) * 100;
    
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
                  {t('questionOf', { current: quizState.currentQuestionIndex + 1, total: quizState.questions.length })}
                </Text>
                <XStack alignItems="center" gap={tokens.space.xs}>
                  <Check size={16} color={isDark ? tokens.color.dark.success : tokens.color.light.success} />
                  <Text color={isDark ? tokens.color.dark.success : tokens.color.light.success} fontWeight="600">
                    {quizState.correctAnswers}
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
                const isSelected = quizState.selectedAnswer === answer;
                const isCorrect = answer === currentQuestion.correct_answer;
                const showCorrect = quizState.showResult && isCorrect;
                const showWrong = quizState.showResult && isSelected && !isCorrect;
                
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
                    disabled={quizState.showResult}
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
            {quizState.showResult && currentQuestion.explanation && (
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
            {quizState.showResult && (
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
                    {quizState.currentQuestionIndex + 1 >= quizState.questions.length 
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
  if (quizState.view === 'results') {
    const accuracy = quizState.questions.length > 0 
      ? Math.round((quizState.correctAnswers / quizState.questions.length) * 100)
      : 0;
    const isPerfect = quizState.correctAnswers === quizState.questions.length;
    
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
                {isPerfect ? t('perfectScore') : t('quizComplete')}
              </Text>
              <Text
                color={isDark ? '$textSecondary' : tokens.color.light.textSecondary}
                fontSize={15}
                marginTop={tokens.space.xs}
              >
                {t('youGotCorrect', { correct: quizState.correctAnswers, total: quizState.questions.length })}
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
              {quizState.currentCategorySlug && (
                <Pressable onPress={handleContinueCategoryQuiz}>
                  <XStack
                    backgroundColor={isDark ? tokens.color.dark.primary : tokens.color.light.primary}
                    padding={tokens.space.md}
                    borderRadius={tokens.radius.md}
                    justifyContent="center"
                    alignItems="center"
                  >
                    <Text color="#FFFFFF" fontSize={15} fontWeight="600">
                      {t('continueQuiz')}
                    </Text>
                  </XStack>
                </Pressable>
              )}
              <Pressable onPress={handleBackToHub}>
                <XStack
                  backgroundColor={isDark ? tokens.color.dark.surface : tokens.color.light.surface}
                  borderWidth={1}
                  borderColor={isDark ? tokens.color.dark.border : tokens.color.light.border}
                  padding={tokens.space.md}
                  borderRadius={tokens.radius.md}
                  justifyContent="center"
                  alignItems="center"
                >
                  <Text 
                    color={isDark ? '$text' : tokens.color.light.text} 
                    fontSize={15} 
                    fontWeight="600"
                  >
                    {t('backToQuiz')}
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          </ContentContainer>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // Hub view (main quiz screen)
  const hasQuestions = categories.some(c => c.total > 0);

  if (!hasQuestions && dailyQuestionsCount === 0) {
    return (
      <ScreenContainer edges={["top"]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <EmptyState
          title={t('noQuestionsYet')}
          description={t('noQuestionsYetDescription')}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top"]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <YStack flex={1}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadQuizData(true)} />
          }
        >
          <ScreenHeader
            icon={<Brain size={28} color={iconColor} />}
            title={t('quiz')}
          />
          
          <ContentContainer gap={tokens.space.md}>
            {/* Stats row */}
            <QuizStatsHero
              stats={overallStats}
              streak={dailyStreak}
              isDark={isDark}
              t={t}
            />
            
            {/* Daily Quiz */}
            {dailyQuestionsCount > 0 && (
              <DailyChallengeCard
                questionsCount={dailyQuestionsCount}
                isCompleted={isDailyCompleted}
                streak={dailyStreak}
                isDark={isDark}
                onPress={startDailyQuiz}
                t={t}
              />
            )}
            
            {/* Category Quiz Section */}
            {categories.length > 0 && (
              <YStack marginTop={tokens.space.sm}>
                <YStack marginBottom={tokens.space.sm}><H2>{t('categoryQuiz')}</H2></YStack>
                <YStack gap={tokens.space.sm}>
                  {categories.map((category, index) => (
                    <CategoryQuestCard
                      key={category.slug}
                      category={category}
                      isDark={isDark}
                      onPress={() => startCategoryQuiz(category.slug, category.name)}
                      index={index}
                    />
                  ))}
                </YStack>
              </YStack>
            )}
          </ContentContainer>
        </ScrollView>
        <BannerAd position="quiz" />
      </YStack>
    </ScreenContainer>
  );
}
