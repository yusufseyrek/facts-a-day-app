import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { BackHandler, View } from 'react-native';
import { YStack } from 'tamagui';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { tokens } from '../../src/theme/tokens';
import { BodyText } from '../../src/components/Typography';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { 
  trackScreenView, 
  Screens, 
  trackTriviaStart, 
  trackTriviaComplete, 
  trackTriviaExit,
  TriviaMode,
} from '../../src/services/analytics';
import { TriviaResults, TriviaGameView, TriviaExitModal, getTriviaModeBadge } from '../../src/components/trivia';
import * as triviaService from '../../src/services/trivia';
import { useResponsive } from '../../src/utils/useResponsive';
import { TIME_PER_QUESTION } from '../../src/services/trivia';
import type { QuestionWithFact } from '../../src/services/database';
import { showTriviaResultsInterstitial } from '../../src/services/adManager';

interface TriviaGameState {
  questions: QuestionWithFact[];
  currentQuestionIndex: number;
  answers: Record<number, string>; // questionId -> selected answer
  isFinished: boolean;
  timeExpired: boolean;
  totalTime: number; // Initial total time for the quiz
}

export default function TriviaGameScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const { typography: typo } = useResponsive();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ 
    type: string; 
    categorySlug?: string;
    categoryName?: string;
  }>();
  const isDark = theme === 'dark';
  
  const [loading, setLoading] = useState(true);
  const [showingAd, setShowingAd] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showUnansweredModal, setShowUnansweredModal] = useState(false);
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [gameState, setGameState] = useState<TriviaGameState>({
    questions: [],
    currentQuestionIndex: 0,
    answers: {},
    isFinished: false,
    timeExpired: false,
    totalTime: 0,
  });
  
  // Timer state
  const [timeRemaining, setTimeRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Animation values
  const progressWidth = useSharedValue(0);
  const questionKey = useRef(0);
  
  // Store shuffled answers per question to keep them consistent when navigating back
  const shuffledAnswersMap = useRef<Record<number, string[]>>({});
  
  // Get current question
  const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
  
  // Get or create shuffled answers for current question
  const shuffledAnswers = useMemo(() => {
    if (!currentQuestion) return [];
    
    // If we already shuffled this question's answers, return the cached version
    if (shuffledAnswersMap.current[currentQuestion.id]) {
      return shuffledAnswersMap.current[currentQuestion.id];
    }
    
    // Shuffle and cache for this question
    const shuffled = triviaService.getShuffledAnswers(currentQuestion);
    shuffledAnswersMap.current[currentQuestion.id] = shuffled;
    return shuffled;
  }, [currentQuestion?.id]);
  
  // Colors
  const bgColor = isDark ? tokens.color.dark.background : tokens.color.light.background;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  
  // Get trivia title based on type
  const getTriviaTitle = useCallback(() => {
    switch (params.type) {
      case 'daily':
        return t('dailyTrivia');
      case 'mixed':
        return t('mixedTrivia');
      case 'category':
        return t('categoryTrivia');
      default:
        return t('trivia');
    }
  }, [params.type, t]);
  
  // Load questions on mount
  useEffect(() => {
    loadQuestions();
    trackScreenView(Screens.TRIVIA_GAME);
  }, []);
  
  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExitConfirm();
      return true;
    });
    return () => backHandler.remove();
  }, [gameState.isFinished]);
  
  // Timer effect
  useEffect(() => {
    if (loading || gameState.isFinished) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Time's up!
          clearInterval(timerRef.current!);
          timerRef.current = null;
          handleTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [loading, gameState.isFinished, gameState.currentQuestionIndex]);
  
  // Update progress bar animation
  useEffect(() => {
    if (gameState.questions.length > 0) {
      const progress = ((gameState.currentQuestionIndex + 1) / gameState.questions.length) * 100;
      progressWidth.value = withTiming(progress, { duration: 300 });
    }
  }, [gameState.currentQuestionIndex, gameState.questions.length]);
  
  const loadQuestions = async () => {
    try {
      setLoading(true);
      let questions: QuestionWithFact[] = [];
      
      if (params.type === 'daily') {
        questions = await triviaService.getDailyTriviaQuestions(locale);
      } else if (params.type === 'mixed') {
        questions = await triviaService.getMixedTriviaQuestions(locale);
      } else if (params.type === 'category' && params.categorySlug) {
        questions = await triviaService.getCategoryTriviaQuestions(params.categorySlug, locale);
      }
      
      if (questions.length === 0) {
        router.back();
        return;
      }
      
      // Calculate total time based on question count (using average time per question)
      const totalTime = questions.length * TIME_PER_QUESTION.average;
      setTimeRemaining(totalTime);
      
      setGameState(prev => ({
        ...prev,
        questions,
        totalTime,
      }));
      setLoading(false);
      
      // Track trivia start
      const triviaMode: TriviaMode = params.type === 'daily' ? 'daily' : 
                                      params.type === 'category' ? 'category' : 'mixed';
      trackTriviaStart({
        mode: triviaMode,
        questionCount: questions.length,
        categorySlug: params.categorySlug,
      });
    } catch (error) {
      console.error('Error loading trivia questions:', error);
      router.back();
    }
  };
  
  const handleTimeExpired = useCallback(async () => {
    // Show interstitial ad before showing results
    setShowingAd(true);
    await showTriviaResultsInterstitial();
    setShowingAd(false);
    
    // Calculate results for session save including best streak
    let correctCount = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    
    for (const question of gameState.questions) {
      const selectedAnswer = gameState.answers[question.id];
      const isCorrect = question.question_type === 'true_false'
        ? selectedAnswer?.toLowerCase() === question.correct_answer?.toLowerCase()
        : selectedAnswer === question.correct_answer;
      if (isCorrect) {
        correctCount++;
        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }
    
    // Determine trivia mode for session saving
    const triviaMode = params.type === 'daily' ? 'daily' : 
                       params.type === 'category' ? 'category' : 'mixed';
    
    // Time expired means all time was used
    const elapsedTime = gameState.totalTime;
    
    // Save session result first to get session ID
    const sessionId = await triviaService.saveSessionResult(
      triviaMode,
      gameState.questions.length,
      correctCount,
      params.categorySlug || undefined,
      elapsedTime,
      bestStreak,
      gameState.questions,
      gameState.answers
    );
    
    // Record each answer with session ID
    for (const question of gameState.questions) {
      const selectedAnswer = gameState.answers[question.id];
      if (selectedAnswer) {
        const isCorrect = question.question_type === 'true_false'
          ? selectedAnswer?.toLowerCase() === question.correct_answer?.toLowerCase()
          : selectedAnswer === question.correct_answer;
        await triviaService.recordAnswer(question.id, isCorrect, triviaMode, sessionId);
      }
    }
    
    // Save daily progress if applicable
    if (params.type === 'daily') {
      await triviaService.saveDailyProgress(gameState.questions.length, correctCount);
    }
    
    // Track trivia completion and results screen
    trackTriviaComplete({
      mode: triviaMode,
      questionCount: gameState.questions.length,
      correctCount,
      elapsedTime,
      bestStreak,
      timeExpired: true,
      categorySlug: params.categorySlug,
    });
    trackScreenView(Screens.TRIVIA_RESULTS);
    
    setGameState(prev => ({
      ...prev,
      isFinished: true,
      timeExpired: true,
    }));
  }, [gameState.questions, gameState.answers, gameState.totalTime, params.type, params.categorySlug]);
  
  const handleExitConfirm = () => {
    if (gameState.isFinished) {
      router.back();
      return;
    }
    
    // Show custom exit modal instead of native Alert for better testability
    setShowExitModal(true);
  };
  
  const handleExitCancel = () => {
    setShowExitModal(false);
  };
  
  const handleExitConfirmed = () => {
    setShowExitModal(false);
    // Track trivia exit
    const triviaMode: TriviaMode = params.type === 'daily' ? 'daily' : 
                                   params.type === 'category' ? 'category' : 'mixed';
    const answeredCount = Object.keys(gameState.answers).length;
    trackTriviaExit({
      mode: triviaMode,
      questionsAnswered: answeredCount,
      totalQuestions: gameState.questions.length,
      categorySlug: params.categorySlug,
    });
    router.back();
  };
  
  const handleUnansweredCancel = () => {
    setShowUnansweredModal(false);
  };
  
  const handleUnansweredContinue = () => {
    setShowUnansweredModal(false);
    finishQuiz();
  };
  
  const handleAnswerSelect = (answer: string) => {
    if (!currentQuestion) return;
    setGameState(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [currentQuestion.id]: answer,
      },
    }));
  };
  
  const handleNextQuestion = () => {
    const nextIndex = gameState.currentQuestionIndex + 1;
    
    if (nextIndex >= gameState.questions.length) {
      // Check if all questions are answered
      const unansweredCount = gameState.questions.filter(
        q => !gameState.answers[q.id]
      ).length;
      
      if (unansweredCount > 0) {
        // Show custom unanswered modal
        setUnansweredCount(unansweredCount);
        setShowUnansweredModal(true);
      } else {
        // All questions answered - finish quiz
        finishQuiz();
      }
    } else {
      questionKey.current += 1;
      setGameState(prev => ({
        ...prev,
        currentQuestionIndex: nextIndex,
      }));
    }
  };
  
  const handlePrevQuestion = () => {
    if (gameState.currentQuestionIndex <= 0) return;
    questionKey.current += 1;
    setGameState(prev => ({
      ...prev,
      currentQuestionIndex: prev.currentQuestionIndex - 1,
    }));
  };
  
  const finishQuiz = async () => {
    // Show interstitial ad before showing results
    setShowingAd(true);
    await showTriviaResultsInterstitial();
    setShowingAd(false);
    
    // Calculate results including best streak
    let correctCount = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    const wrongIds: number[] = [];
    
    for (const question of gameState.questions) {
      const selectedAnswer = gameState.answers[question.id];
      // Case-insensitive comparison for true/false questions
      const isCorrect = question.question_type === 'true_false'
        ? selectedAnswer?.toLowerCase() === question.correct_answer?.toLowerCase()
        : selectedAnswer === question.correct_answer;
      
      if (isCorrect) {
        correctCount++;
        currentStreak++;
        if (currentStreak > bestStreak) {
          bestStreak = currentStreak;
        }
      } else {
        wrongIds.push(question.id);
        currentStreak = 0;
      }
    }
    
    // Determine trivia mode for session saving
    const triviaMode = params.type === 'daily' ? 'daily' : 
                       params.type === 'category' ? 'category' : 'mixed';
    
    // Calculate elapsed time
    const elapsedTime = gameState.totalTime - timeRemaining;
    
    try {
      // Save session result first to get the session ID
      const sessionId = await triviaService.saveSessionResult(
        triviaMode,
        gameState.questions.length,
        correctCount,
        params.categorySlug || undefined,
        elapsedTime,
        bestStreak,
        gameState.questions,
        gameState.answers
      );
      
      // Record each answer with session ID
      for (const question of gameState.questions) {
        const selectedAnswer = gameState.answers[question.id];
        if (selectedAnswer) {
          const isCorrect = question.question_type === 'true_false'
            ? selectedAnswer?.toLowerCase() === question.correct_answer?.toLowerCase()
            : selectedAnswer === question.correct_answer;
          await triviaService.recordAnswer(
            question.id,
            isCorrect,
            triviaMode,
            sessionId
          );
        }
      }
      
      // Save daily progress if applicable
      if (params.type === 'daily') {
        await triviaService.saveDailyProgress(
          gameState.questions.length,
          correctCount
        );
      }
      
      // Track trivia completion and results screen
      trackTriviaComplete({
        mode: triviaMode,
        questionCount: gameState.questions.length,
        correctCount,
        elapsedTime,
        bestStreak,
        timeExpired: false,
        categorySlug: params.categorySlug,
      });
      trackScreenView(Screens.TRIVIA_RESULTS);
    } catch (error) {
      console.error('Error saving trivia results:', error);
      // Still show results even if saving fails
    }
    
    // Always set isFinished to true to show results
    setGameState(prev => ({ 
      ...prev, 
      isFinished: true,
    }));
  };
  
  const handleClose = () => {
    router.back();
  };
  
  // Loading state
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <YStack flex={1} justifyContent="center" alignItems="center">
          <BodyText color={secondaryTextColor}>
            {t('loading') || 'Loading...'}
          </BodyText>
        </YStack>
      </View>
    );
  }
  
  // Calculate results for display
  const calculateResults = () => {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    
    for (const question of gameState.questions) {
      const selectedAnswer = gameState.answers[question.id];
      // Case-insensitive comparison for true/false questions
      const isCorrect = question.question_type === 'true_false'
        ? selectedAnswer?.toLowerCase() === question.correct_answer?.toLowerCase()
        : selectedAnswer === question.correct_answer;
      
      if (!selectedAnswer) {
        unanswered++;
        currentStreak = 0;
      } else if (isCorrect) {
        correct++;
        currentStreak++;
        if (currentStreak > bestStreak) {
          bestStreak = currentStreak;
        }
      } else {
        wrong++;
        currentStreak = 0;
      }
    }
    
    // Calculate elapsed time
    const elapsedTime = gameState.totalTime - timeRemaining;
    
    return { correct, wrong, unanswered, bestStreak, elapsedTime };
  };
  
  // Results view
  if (gameState.isFinished) {
    const results = calculateResults();
    
    return (
      <TriviaResults
        correctAnswers={results.correct}
        totalQuestions={gameState.questions.length}
        wrongCount={results.wrong}
        unansweredCount={results.unanswered}
        timeExpired={gameState.timeExpired}
        elapsedTime={results.elapsedTime}
        bestStreak={results.bestStreak}
        questions={gameState.questions}
        answers={gameState.answers}
        onClose={handleClose}
        isDark={isDark}
        t={t}
        triviaModeBadge={getTriviaModeBadge({
          mode: params.type || 'mixed',
          categoryName: params.categoryName,
          isDark,
          t,
        })}
      />
    );
  }
  
  // Game view
  if (!currentQuestion) {
    return null;
  }
  
  // Get selected answer for current question
  const selectedAnswer = currentQuestion ? gameState.answers[currentQuestion.id] || null : null;
  
  return (
    <>
      <TriviaGameView
        currentQuestion={currentQuestion}
        currentQuestionIndex={gameState.currentQuestionIndex}
        totalQuestions={gameState.questions.length}
        shuffledAnswers={shuffledAnswers}
        selectedAnswer={selectedAnswer}
        timeRemaining={timeRemaining}
        questionKey={questionKey.current}
        progressWidth={progressWidth}
        triviaTitle={getTriviaTitle()}
        isLoadingResults={showingAd}
        onAnswerSelect={handleAnswerSelect}
        onNextQuestion={handleNextQuestion}
        onPrevQuestion={handlePrevQuestion}
        onExit={handleExitConfirm}
        isDark={isDark}
        t={t}
      />
      <TriviaExitModal
        visible={showExitModal}
        onCancel={handleExitCancel}
        onExit={handleExitConfirmed}
        isDark={isDark}
        title={t('exitTrivia') || 'Exit Quiz'}
        message={t('exitTriviaConfirm') || 'Are you sure you want to exit? Your progress will be lost.'}
        cancelText={t('cancel') || 'Cancel'}
        exitText={t('exit') || 'Exit'}
      />
      <TriviaExitModal
        visible={showUnansweredModal}
        onCancel={handleUnansweredCancel}
        onExit={handleUnansweredContinue}
        isDark={isDark}
        title={t('unansweredQuestions') || 'Unanswered Questions'}
        message={t('unansweredQuestionsMessage', { count: unansweredCount }) || `You haven't answered ${unansweredCount} question(s). Continue anyway?`}
        cancelText={t('goBack') || 'Go Back'}
        exitText={t('continueAnyway') || 'Continue'}
      />
    </>
  );
}
