import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { YStack } from 'tamagui';

import { showRewardedAd } from '../../src/components/ads/RewardedAd';
import {
  getTriviaModeBadge,
  TriviaExitModal,
  TriviaGameView,
  TriviaNativeAdView,
  TriviaResults,
} from '../../src/components/trivia';
import { Text } from '../../src/components/Typography';
import { usePremium } from '../../src/contexts/PremiumContext';
import { useNativeAd } from '../../src/hooks/useNativeAd';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackRewardedAdResult,
  trackRewardedAdShown,
  trackScreenView,
  trackTriviaComplete,
  trackTriviaExit,
  trackTriviaHintClick,
  trackTriviaStart,
  trackTriviaViewFactClick,
} from '../../src/services/analytics';
import * as triviaService from '../../src/services/trivia';
import { TIME_PER_QUESTION } from '../../src/services/trivia';
import { NATIVE_ADS } from '../../src/config/app';
import { hexColors, useTheme } from '../../src/theme';

import type { TriviaMode } from '../../src/services/analytics';
import type { QuestionWithFact, TriviaSessionWithCategory } from '../../src/services/database';

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPremium } = usePremium();
  const params = useLocalSearchParams<{
    type: string;
    categorySlug?: string;
    categoryName?: string;
    sessionId?: string;
  }>();
  const isDark = theme === 'dark';
  const triviaMode: TriviaMode =
    params.type === 'daily'
      ? 'daily'
      : params.type === 'category'
        ? 'category'
        : params.type === 'quick'
          ? 'quick'
          : 'mixed';

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

  // Native ad state - show every N questions (or midpoint if fewer questions than interval)
  const questionCount = gameState.questions.length;
  const adInterval =
    questionCount > 0 && questionCount < NATIVE_ADS.TRIVIA_AD_QUESTION_INTERVAL
      ? Math.ceil(questionCount / 2)
      : NATIVE_ADS.TRIVIA_AD_QUESTION_INTERVAL;
  const [showingNativeAd, setShowingNativeAd] = useState(false);
  const [nativeAdShownIndices, setNativeAdShownIndices] = useState<Set<number>>(new Set());
  const [nativeAdRequestKey, setNativeAdRequestKey] = useState('trivia-0');
  const pendingAdNextIndex = useRef<number>(0);
  const { nativeAd } = useNativeAd({ aspectRatio: NativeMediaAspectRatio.PORTRAIT, requestKey: nativeAdRequestKey });

  // Ad navigation lock - block prev/next buttons briefly when native ad is shown
  const [adNavLocked, setAdNavLocked] = useState(false);
  const adNavLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hint state
  const [canUseExplanation, setCanUseExplanation] = useState(false);
  const [remainingHints, setRemainingHints] = useState(0);
  const [explanationShownForQuestion, setExplanationShownForQuestion] = useState<number | null>(
    null
  );
  const [adHintUsedForQuestions, setAdHintUsedForQuestions] = useState<Set<number>>(new Set());
  const [showingRewardedAd, setShowingRewardedAd] = useState(false);

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

  // Background image for current question
  const questionImageUri = currentQuestion?.fact?.image_url;

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
  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

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

  // Session review mode: load a saved session and show results directly
  const [reviewSession, setReviewSession] = useState<TriviaSessionWithCategory | null>(null);

  useEffect(() => {
    if (params.sessionId) {
      triviaService
        .getSessionById(Number(params.sessionId))
        .then((session) => {
          if (session) {
            setReviewSession(session);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error('[TriviaGame] Failed to load session for review:', err);
          setLoading(false);
        });
      return;
    }
    loadQuestions();
    checkHintAvailability();
    trackScreenView(Screens.TRIVIA_GAME);
  }, []);

  // Check if explanation hint is available today
  const checkHintAvailability = async () => {
    const canUse = await triviaService.canUseExplanationHint();
    setCanUseExplanation(canUse);
    const remaining = await triviaService.getRemainingHints();
    setRemainingHints(remaining);
  };

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
    if (loading || gameState.isFinished || showingRewardedAd || showingNativeAd) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
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
  }, [
    loading,
    gameState.isFinished,
    gameState.currentQuestionIndex,
    showingRewardedAd,
    showingNativeAd,
  ]);

  // Cleanup ad nav lock timer on unmount
  useEffect(() => {
    return () => {
      if (adNavLockTimer.current) {
        clearTimeout(adNavLockTimer.current);
        adNavLockTimer.current = null;
      }
    };
  }, []);

  // Update progress bar animation
  useEffect(() => {
    if (gameState.questions.length > 0) {
      const progress = ((gameState.currentQuestionIndex + 1) / gameState.questions.length) * 100;
      progressWidth.value = withTiming(progress, { duration: 300 });
    }
  }, [gameState.currentQuestionIndex, gameState.questions.length]);

  // Prefetch adjacent question images for seamless navigation

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
      const totalTime = questions.length * TIME_PER_QUESTION.AVERAGE;
      setTimeRemaining(totalTime);

      setGameState((prev) => ({
        ...prev,
        questions,
        totalTime,
      }));
      setLoading(false);

      // Track trivia start
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
    // Calculate results for session save including best streak
    let correctCount = 0;
    let currentStreak = 0;
    let bestStreak = 0;

    for (const question of gameState.questions) {
      const selectedAnswer = gameState.answers[question.id];
      const isCorrect = selectedAnswer
        ? triviaService.isTextAnswerCorrect(question, selectedAnswer)
        : false;
      if (isCorrect) {
        correctCount++;
        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

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
        const isCorrect = triviaService.isTextAnswerCorrect(question, selectedAnswer);
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

    setGameState((prev) => ({
      ...prev,
      isFinished: true,
      timeExpired: true,
    }));
  }, [
    gameState.questions,
    gameState.answers,
    gameState.totalTime,
    params.type,
    params.categorySlug,
  ]);

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
    // Delay to let the modal fully dismiss before showing the ad
    // iOS Modal fade animation takes ~300ms, wait a bit longer to be safe
    setTimeout(() => {
      finishQuiz();
    }, 400);
  };

  const handleAnswerSelect = (answer: string) => {
    if (!currentQuestion) return;
    setGameState((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        [currentQuestion.id]: answer,
      },
    }));
  };

  const handleNextQuestion = () => {
    const nextIndex = gameState.currentQuestionIndex + 1;

    // Show native ad every 3 questions (after Q3, Q6, Q9, etc.)
    if (
      nextIndex > 0 &&
      nextIndex % adInterval === 0 &&
      !nativeAdShownIndices.has(nextIndex) &&
      nativeAd &&
      nextIndex < gameState.questions.length
    ) {
      pendingAdNextIndex.current = nextIndex;
      setShowingNativeAd(true);
      setNativeAdShownIndices((prev) => new Set(prev).add(nextIndex));
      // Lock navigation buttons briefly
      setAdNavLocked(true);
      if (adNavLockTimer.current) clearTimeout(adNavLockTimer.current);
      adNavLockTimer.current = setTimeout(() => {
        setAdNavLocked(false);
        adNavLockTimer.current = null;
      }, NATIVE_ADS.TRIVIA_NAV_LOCK_DURATION_MS);
      return;
    }

    if (nextIndex >= gameState.questions.length) {
      // Check if all questions are answered
      const unansweredCount = gameState.questions.filter((q) => !gameState.answers[q.id]).length;

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
      setGameState((prev) => ({
        ...prev,
        currentQuestionIndex: nextIndex,
      }));
    }
  };

  const handleNativeAdContinue = () => {
    setShowingNativeAd(false);
    // Advance to the next question
    questionKey.current += 1;
    setGameState((prev) => ({
      ...prev,
      currentQuestionIndex: pendingAdNextIndex.current,
    }));
    // Request a fresh ad for the next slot
    setNativeAdRequestKey(`trivia-${pendingAdNextIndex.current}`);
  };

  const handleNativeAdPrev = () => {
    setShowingNativeAd(false);
    // Go back to the last question before the ad
  };

  const handlePrevQuestion = () => {
    if (gameState.currentQuestionIndex <= 0) return;
    questionKey.current += 1;
    setGameState((prev) => ({
      ...prev,
      currentQuestionIndex: prev.currentQuestionIndex - 1,
    }));
  };

  // Handle opening the fact detail
  const handleOpenFact = useCallback(() => {
    if (currentQuestion?.fact?.id) {
      // Track view fact button click
      trackTriviaViewFactClick({
        mode: triviaMode,
        factId: currentQuestion.fact.id,
        questionIndex: gameState.currentQuestionIndex,
        categorySlug: params.categorySlug,
      });

      router.push(`/fact/${currentQuestion.fact.id}?source=trivia_hint`);
    }
  }, [
    currentQuestion?.fact?.id,
    currentQuestion?.fact?.image_url,
    router,
    params.type,
    params.categorySlug,
    gameState.currentQuestionIndex,
  ]);

  // Handle showing the explanation hint
  const handleShowExplanation = useCallback(async () => {
    if (!currentQuestion || !canUseExplanation) return;

    // Track hint button click
    trackTriviaHintClick({
      mode: triviaMode,
      questionIndex: gameState.currentQuestionIndex,
      source: 'free',
      categorySlug: params.categorySlug,
    });

    // Mark hint as used for today
    await triviaService.useExplanationHint();

    // Show explanation for current question
    setExplanationShownForQuestion(currentQuestion.id);

    // Re-check if more hints are available (premium users get 3)
    const stillCanUse = await triviaService.canUseExplanationHint();
    setCanUseExplanation(stillCanUse);
    const remaining = await triviaService.getRemainingHints();
    setRemainingHints(remaining);
  }, [
    currentQuestion,
    canUseExplanation,
    params.type,
    params.categorySlug,
    gameState.currentQuestionIndex,
  ]);

  // Handle watching a rewarded ad to unlock a hint
  const handleWatchAdForHint = useCallback(async () => {
    if (!currentQuestion || showingRewardedAd) return;

    trackTriviaHintClick({
      mode: triviaMode,
      questionIndex: gameState.currentQuestionIndex,
      source: 'rewarded_ad',
      categorySlug: params.categorySlug,
    });

    trackRewardedAdShown({
      mode: triviaMode,
      questionIndex: gameState.currentQuestionIndex,
      categorySlug: params.categorySlug,
    });

    setShowingRewardedAd(true);
    const rewarded = await showRewardedAd();
    setShowingRewardedAd(false);

    trackRewardedAdResult({
      mode: triviaMode,
      questionIndex: gameState.currentQuestionIndex,
      rewarded,
      categorySlug: params.categorySlug,
    });

    if (rewarded) {
      setAdHintUsedForQuestions((prev) => new Set(prev).add(currentQuestion.id));
      setExplanationShownForQuestion(currentQuestion.id);
    }
  }, [
    currentQuestion,
    showingRewardedAd,
    params.type,
    params.categorySlug,
    gameState.currentQuestionIndex,
  ]);

  const finishQuiz = async () => {
    // Calculate results including best streak
    let correctCount = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    const wrongIds: number[] = [];

    for (const question of gameState.questions) {
      const selectedAnswer = gameState.answers[question.id];
      const isCorrect = selectedAnswer
        ? triviaService.isTextAnswerCorrect(question, selectedAnswer)
        : false;

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
          const isCorrect = triviaService.isTextAnswerCorrect(question, selectedAnswer);
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
        timeExpired: false,
        categorySlug: params.categorySlug,
      });
      trackScreenView(Screens.TRIVIA_RESULTS);
    } catch (error) {
      console.error('Error saving trivia results:', error);
      // Still show results even if saving fails
    }

    // Always set isFinished to true to show results
    setGameState((prev) => ({
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
      <View
        style={{
          flex: 1,
          backgroundColor: bgColor,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <YStack flex={1} justifyContent="center" alignItems="center">
          <Text.Body color={secondaryTextColor}>{t('loading') || 'Loading...'}</Text.Body>
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
      const isCorrect = selectedAnswer
        ? triviaService.isTextAnswerCorrect(question, selectedAnswer)
        : false;

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

  // Session review mode — show saved session results
  if (reviewSession && reviewSession.questions && reviewSession.answers) {
    const wrongCount = reviewSession.total_questions - reviewSession.correct_answers;
    return (
      <TriviaResults
        correctAnswers={reviewSession.correct_answers}
        totalQuestions={reviewSession.total_questions}
        wrongCount={wrongCount}
        unansweredCount={0}
        timeExpired={false}
        elapsedTime={reviewSession.elapsed_time || 0}
        bestStreak={reviewSession.best_streak || 0}
        questions={reviewSession.questions}
        answers={reviewSession.answers}
        onClose={handleClose}
        isDark={isDark}
        t={t}
        triviaModeBadge={getTriviaModeBadge({
          mode: reviewSession.trivia_mode,
          categoryName: reviewSession.category?.name,
          categoryIcon: reviewSession.category?.icon,
          categoryColor: reviewSession.category?.color_hex,
          isDark,
          t,
        })}
        showBackButton={true}
        showReturnButton={false}
        unavailableQuestionIds={reviewSession.unavailableQuestionIds}
        hideTimeAndStreak={reviewSession.trivia_mode === 'quick'}
      />
    );
  }

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

  // Native ad view - shown every 3 questions
  if (showingNativeAd && nativeAd) {
    return (
      <>
        <TriviaNativeAdView
          nativeAd={nativeAd}
          progressWidth={progressWidth}
          triviaTitle={getTriviaTitle()}
          timeRemaining={timeRemaining}
          onContinue={handleNativeAdContinue}
          onPrevQuestion={handleNativeAdPrev}
          onExit={handleExitConfirm}
          isDark={isDark}
          t={t}
          navLocked={adNavLocked}
          navLockDuration={NATIVE_ADS.TRIVIA_NAV_LOCK_DURATION_MS}
        />
        <TriviaExitModal
          visible={showExitModal}
          onCancel={handleExitCancel}
          onExit={handleExitConfirmed}
          isDark={isDark}
          title={t('exitTrivia') || 'Exit Quiz'}
          message={
            t('exitTriviaConfirm') || 'Are you sure you want to exit? Your progress will be lost.'
          }
          cancelText={t('cancel') || 'Cancel'}
          exitText={t('exit') || 'Exit'}
        />
      </>
    );
  }

  // Game view
  if (!currentQuestion) {
    return null;
  }

  // Get selected answer for current question
  const selectedAnswer = currentQuestion ? gameState.answers[currentQuestion.id] || null : null;

  // Check if explanation is shown for current question (free or ad-based)
  const showExplanation =
    explanationShownForQuestion === currentQuestion?.id ||
    adHintUsedForQuestions.has(currentQuestion?.id ?? -1);

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
        onOpenFact={handleOpenFact}
        onShowExplanation={handleShowExplanation}
        canUseExplanation={canUseExplanation}
        showExplanation={showExplanation}
        onWatchAdForHint={handleWatchAdForHint}
        canWatchAdForHint={!canUseExplanation && !showingRewardedAd}
        questionImageUri={questionImageUri}
        isPremium={isPremium}
        remainingHints={remainingHints}
      />
      <TriviaExitModal
        visible={showExitModal}
        onCancel={handleExitCancel}
        onExit={handleExitConfirmed}
        isDark={isDark}
        title={t('exitTrivia') || 'Exit Quiz'}
        message={
          t('exitTriviaConfirm') || 'Are you sure you want to exit? Your progress will be lost.'
        }
        cancelText={t('cancel') || 'Cancel'}
        exitText={t('exit') || 'Exit'}
      />
      <TriviaExitModal
        visible={showUnansweredModal}
        onCancel={handleUnansweredCancel}
        onExit={handleUnansweredContinue}
        isDark={isDark}
        title={t('unansweredQuestions') || 'Unanswered Questions'}
        message={
          t('unansweredQuestionsMessage', { count: unansweredCount }) ||
          `You haven't answered ${unansweredCount} question(s). Continue anyway?`
        }
        cancelText={t('goBack') || 'Go Back'}
        exitText={t('continueAnyway') || 'Continue'}
      />
    </>
  );
}
