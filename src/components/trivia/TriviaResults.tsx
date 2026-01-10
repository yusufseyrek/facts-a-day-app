import React from 'react';
import { Pressable, ScrollView,View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Star,
  Timer,
  X,
} from '@tamagui/lucide-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack,YStack } from 'tamagui';

import { indexToAnswer } from '../../services/trivia';
import { hexColors } from '../../theme';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES,Text } from '../Typography';

import type { QuestionWithFact, StoredAnswer } from '../../services/database';

const CARD_GAP = 12;

 
type TranslationFunction = (key: any, params?: any) => string;

export interface TriviaResultsProps {
  correctAnswers: number;
  totalQuestions: number;
  wrongCount: number;
  unansweredCount: number;
  timeExpired: boolean;
  elapsedTime: number; // Time in seconds
  bestStreak: number; // Best consecutive correct streak
  questions: QuestionWithFact[];
  // Support both formats:
  // - Live game: Record<number, string> (answer text)
  // - Historical: Record<number, StoredAnswer> (answer index + correctness)
  answers: Record<number, string | StoredAnswer>;
  onClose: () => void;
  isDark: boolean;
  t: TranslationFunction;
  // Optional customizations for viewing past results
  customTitle?: string;
  customSubtitle?: string;
  triviaModeBadge?: {
    label: string;
    icon?: string;
    color?: string;
  };
  showBackButton?: boolean;
  showReturnButton?: boolean;
  // IDs of questions that are no longer in the database
  unavailableQuestionIds?: number[];
}

// Horizontal progress bar component
function ProgressBar({
  percentage,
  primaryColor,
  trackColor,
  height = 24,
}: {
  percentage: number;
  primaryColor: string;
  trackColor: string;
  height?: number;
}) {
  return (
    <View
      style={{
        width: '100%',
        height,
        backgroundColor: trackColor,
        borderRadius: height / 2,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <View
        style={{
          width: `${Math.max(percentage, 0)}%`,
          height: '100%',
          backgroundColor: primaryColor,
          borderRadius: height / 2,
        }}
      />
      {/* Percentage label inside the bar */}
      <View
        style={{
          position: 'absolute',
          right: 12,
          top: -1, // Adjust to center the text vertically
          bottom: 0,
          justifyContent: 'center',
        }}
      >
        <Text.Caption
          fontFamily={FONT_FAMILIES.bold}
          color={percentage > 85 ? '#FFFFFF' : primaryColor}
        >
          {percentage}%
        </Text.Caption>
      </View>
    </View>
  );
}

// Card for questions that are no longer available (deleted from database)
function UnavailableQuestionCard({
  questionIndex,
  isCorrect,
  isDark,
  t,
  cardWidth,
}: {
  questionIndex: number;
  isCorrect: boolean;
  isDark: boolean;
  t: TranslationFunction;
  cardWidth: number;
}) {
  const { typography, spacing, radius, iconSizes } = useResponsive();
  const cardBackground = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;
  const badgeSize = iconSizes.lg;

  return (
    <View style={{ width: cardWidth }}>
      <YStack
        backgroundColor={cardBackground}
        padding={spacing.lg}
        marginVertical={4}
        borderRadius={radius.xl}
        gap={spacing.md}
        minHeight={150}
        justifyContent="center"
        alignItems="center"
        opacity={0.7}
        shadowColor={isDark ? '#000000' : '#dddddd'}
        shadowOffset={{ width: 0, height: 2 }}
        shadowOpacity={isDark ? 0.2 : 0.06}
        shadowRadius={4}
      >
        {/* Card Header */}
        <XStack alignItems="center" gap={spacing.sm}>
          <View
            style={{
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: isCorrect ? successColor : errorColor,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {isCorrect ? (
              <Check size={typography.fontSize.body} color="#FFFFFF" strokeWidth={3} />
            ) : (
              <X size={typography.fontSize.body} color="#FFFFFF" strokeWidth={3} />
            )}
          </View>
          <Text.Body fontFamily={FONT_FAMILIES.bold} color={textColor}>
            {t('question') || 'Question'} {questionIndex + 1}:{' '}
            {isCorrect ? (t('correct') || 'Correct') + '!' : t('wrong') || 'Wrong'}
          </Text.Body>
        </XStack>

        {/* Unavailable message */}
        <Text.Caption
          fontFamily={FONT_FAMILIES.medium}
          color={secondaryTextColor}
          textAlign="center"
        >
          {t('questionUnavailable') || 'This question is no longer available'}
        </Text.Caption>
      </YStack>
    </View>
  );
}

// Answer review card component for horizontal scroll
function AnswerReviewCard({
  question,
  questionIndex,
  selectedAnswer,
  isCorrect,
  isDark,
  onPress,
  t,
  cardWidth,
}: {
  question: QuestionWithFact;
  questionIndex: number;
  selectedAnswer: string | undefined;
  isCorrect: boolean;
  isDark: boolean;
  onPress?: () => void;
  t: TranslationFunction;
  cardWidth: number;
}) {
  const { typography, spacing, radius, iconSizes, media } = useResponsive();
  const cardBackground = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const badgeSize = iconSizes.lg;

  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 20, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
  };

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  // Helper to translate True/False answers (handle both capitalized and lowercase)
  const getDisplayAnswer = (answer: string | null | undefined): string => {
    if (!answer) return '—';
    const lowerAnswer = answer.toLowerCase().trim();

    // Get translated values for comparison
    const translatedTrue = t('true');
    const translatedFalse = t('false');

    // Check for English true/false or localized equivalents
    if (lowerAnswer === 'true' || lowerAnswer === translatedTrue.toLowerCase()) {
      return translatedTrue && translatedTrue !== 'true' ? translatedTrue : 'True';
    }
    if (lowerAnswer === 'false' || lowerAnswer === translatedFalse.toLowerCase()) {
      return translatedFalse && translatedFalse !== 'false' ? translatedFalse : 'False';
    }
    return answer;
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ width: cardWidth }}
    >
      <Animated.View style={animatedStyle}>
        <YStack
          backgroundColor={cardBackground}
          padding={spacing.lg}
          marginVertical={4}
          borderRadius={radius.xl}
          gap={spacing.md}
          minHeight={200}
          shadowColor={isDark ? '#000000' : '#dddddd'}
          shadowOffset={{ width: 0, height: 2 }}
          shadowOpacity={isDark ? 0.2 : 0.06}
          shadowRadius={4}
        >
          {/* Card Header */}
          <XStack alignItems="center" gap={spacing.sm}>
            <View
              style={{
                width: badgeSize,
                height: badgeSize,
                borderRadius: badgeSize / 2,
                backgroundColor: isCorrect ? successColor : errorColor,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {isCorrect ? (
                <Check size={typography.fontSize.body} color="#FFFFFF" strokeWidth={3} />
              ) : (
                <X size={typography.fontSize.body} color="#FFFFFF" strokeWidth={3} />
              )}
            </View>
            <Text.Body fontFamily={FONT_FAMILIES.bold} color={textColor}>
              {t('question') || 'Question'} {questionIndex + 1}:{' '}
              {isCorrect ? (t('correct') || 'Correct') + '!' : t('wrong') || 'Wrong'}
            </Text.Body>
          </XStack>

          {/* Question text */}
          <Text.Label color={textColor}>{question.question_text}</Text.Label>

          {/* Answer comparison */}
          <YStack
            gap={spacing.sm}
            backgroundColor={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}
            padding={spacing.md}
            borderRadius={radius.md}
          >
            <XStack gap={spacing.md} alignItems="center">
              <View style={{ width: media.answerLabelWidth }}>
                <Text.Tiny
                  fontFamily={FONT_FAMILIES.bold}
                  color={secondaryTextColor}
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  {t('yourAnswer') || 'YOUR ANSWER'}
                </Text.Tiny>
              </View>
              <Text.Caption
                fontFamily={FONT_FAMILIES.semibold}
                color={isCorrect ? successColor : errorColor}
                flex={1}
              >
                {selectedAnswer ? getDisplayAnswer(selectedAnswer) : '—'}
              </Text.Caption>
            </XStack>
            {!isCorrect && (
              <XStack gap={spacing.md} alignItems="center">
                <View style={{ width: media.answerLabelWidth }}>
                  <Text.Tiny
                    fontFamily={FONT_FAMILIES.bold}
                    color={secondaryTextColor}
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    {t('correctAnswer') || 'CORRECT ANSWER'}
                  </Text.Tiny>
                </View>
                <Text.Caption fontFamily={FONT_FAMILIES.semibold} color={successColor} flex={1}>
                  {getDisplayAnswer(question.correct_answer)}
                </Text.Caption>
              </XStack>
            )}
          </YStack>

          {/* Insight text from fact */}
          {question.fact?.content && (
            <YStack gap={spacing.xs} flex={1}>
              <Text.Caption
                fontFamily={FONT_FAMILIES.regular_italic}
                color={secondaryTextColor}
                numberOfLines={3}
                lineHeight={typography.lineHeight.caption}
              >
                {t('explanation') || 'Explanation'}: {question.explanation}
              </Text.Caption>
            </YStack>
          )}

          {/* See Fact link */}
          {question.fact?.id && (
            <XStack alignItems="center" justifyContent="flex-end" marginTop="auto">
              <XStack alignItems="center" gap={2}>
                <Text.Caption fontFamily={FONT_FAMILIES.semibold} color={primaryColor}>
                  {t('seeFact', { id: question.fact.id }) || `Fact#${question.fact.id}`}
                </Text.Caption>
                <ChevronRight size={typography.fontSize.body} color={primaryColor} />
              </XStack>
            </XStack>
          )}
        </YStack>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Helper to check if an answer is a StoredAnswer object or a string
 */
function isStoredAnswer(answer: string | StoredAnswer | undefined): answer is StoredAnswer {
  return answer !== undefined && typeof answer === 'object' && 'index' in answer;
}

export function TriviaResults({
  correctAnswers,
  totalQuestions,
  wrongCount: _wrongCount,
  unansweredCount: _unansweredCount,
  timeExpired,
  elapsedTime,
  bestStreak,
  questions,
  answers,
  onClose,
  isDark,
  t,
  customTitle,
  customSubtitle,
  triviaModeBadge,
  showBackButton = false,
  showReturnButton = true,
  unavailableQuestionIds = [],
}: TriviaResultsProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { screenWidth, typography, config, iconSizes, spacing, radius, media } = useResponsive();
  const statsIconSize = media.topicCardSize * 0.55;
  const headerBtnSize = media.topicCardSize * 0.45;

  // Calculate card width: 45% for tablets (two cards side by side), 85% for phones
  const cardWidth = screenWidth * config.cardWidthMultiplier;

  // Colors
  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;
  const cardBackground = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const accentColor = isDark ? hexColors.dark.accent : hexColors.light.accent;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;

  const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  const isPerfect = correctAnswers === totalQuestions;

  /**
   * Get the selected answer text for a question
   * Handles both string answers (live game) and StoredAnswer (historical)
   */
  const getSelectedAnswerText = (
    question: QuestionWithFact,
    answer: string | StoredAnswer | undefined
  ): string | undefined => {
    if (answer === undefined) return undefined;

    if (isStoredAnswer(answer)) {
      // Historical session: convert index back to text
      return indexToAnswer(question, answer.index);
    }

    // Live game: answer is already a string
    return answer;
  };

  /**
   * Check if an answer is correct
   * Handles both string answers (live game) and StoredAnswer (historical)
   */
  const checkIsCorrect = (
    question: QuestionWithFact,
    answer: string | StoredAnswer | undefined
  ): boolean => {
    if (answer === undefined) return false;

    if (isStoredAnswer(answer)) {
      // Historical session: use stored correctness
      return answer.correct;
    }

    // Live game: compare answer text
    if (question.question_type === 'true_false') {
      return answer.toLowerCase() === question.correct_answer?.toLowerCase();
    }
    return answer === question.correct_answer;
  };

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get feedback title based on score
  const getFeedbackTitle = () => {
    if (timeExpired) return t('timeUp') || "Time's Up!";
    if (isPerfect) return t('perfectScore') || 'Perfect Score!';
    if (accuracy >= 80) return t('greatJob') || 'Great Job!';
    if (accuracy >= 60) return t('wellDone') || 'Well Done!';
    if (accuracy >= 40) return t('keepPracticing') || 'Keep Practicing!';
    return t('tryAgain') || 'Try Again!';
  };

  // Get feedback emoji based on score
  const getFeedbackEmoji = () => {
    if (isPerfect) return '🎯';
    if (accuracy >= 80) return '🔥';
    if (accuracy >= 60) return '💪';
    if (accuracy >= 40) return '📚';
    return '🌱';
  };

  // Handle opening fact detail - use Expo Router like rest of app
  const handleAnswerCardPress = (question: QuestionWithFact) => {
    if (question.fact?.id) {
      router.push(`/fact/${question.fact.id}?source=trivia_review`);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: bgColor,
        paddingTop: insets.top,
        paddingBottom: showReturnButton ? insets.bottom + spacing.md : 0,
      }}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Screen Header (when viewing past results) */}
      {showBackButton && (
        <XStack
          paddingTop={spacing.sm}
          paddingBottom={spacing.md}
          paddingHorizontal={spacing.lg}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor={borderColor}
        >
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            testID="trivia-results-back-button"
          >
            <View
              style={{
                width: headerBtnSize,
                height: headerBtnSize,
                borderRadius: headerBtnSize / 2,
                backgroundColor: `${primaryColor}20`,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <ChevronLeft size={iconSizes.lg} color={primaryColor} />
            </View>
          </Pressable>

          <Text.Title fontFamily={FONT_FAMILIES.bold} color={textColor}>
            {customTitle || t('testResults') || 'Test Results'}
          </Text.Title>

          {/* Empty spacer to balance the header */}
          <View style={{ width: headerBtnSize, height: headerBtnSize }} />
        </XStack>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header Section */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <YStack paddingTop={spacing.lg} paddingHorizontal={spacing.xl} gap={spacing.lg}>
            {/* Date/Time Subtitle */}
            {customSubtitle && (
              <XStack alignSelf="center" alignItems="center" gap={spacing.sm}>
                <Calendar size={typography.fontSize.body} color={secondaryTextColor} />
                <Text.Body fontFamily={FONT_FAMILIES.semibold} color={secondaryTextColor}>
                  {customSubtitle}
                </Text.Body>
              </XStack>
            )}

            {/* Only show title here if not showing header bar */}
            {!showBackButton && (
              <Text.Display fontFamily={FONT_FAMILIES.bold} color={textColor}>
                {customTitle || t('testResults') || 'Test Results'}
              </Text.Display>
            )}

            {/* Badge + Score Row */}
            <XStack alignItems="center" justifyContent="space-between">
              {/* Trivia Mode/Category Badge */}
              {triviaModeBadge ? (
                <XStack
                  alignItems="center"
                  gap={spacing.xs}
                  backgroundColor={`${triviaModeBadge.color || primaryColor}15`}
                  paddingHorizontal={spacing.sm}
                  paddingVertical={4}
                  borderRadius={radius.md}
                >
                  {triviaModeBadge.icon &&
                    getLucideIcon(
                      triviaModeBadge.icon,
                      typography.fontSize.caption,
                      triviaModeBadge.color || primaryColor
                    )}
                  <Text.Caption
                    fontFamily={FONT_FAMILIES.semibold}
                    color={triviaModeBadge.color || primaryColor}
                  >
                    {triviaModeBadge.label}
                  </Text.Caption>
                </XStack>
              ) : (
                <View />
              )}

              {/* Star + Score Label */}
              <XStack alignItems="center" gap={spacing.xs}>
                <Star size={typography.fontSize.caption} color={primaryColor} fill={primaryColor} />
                <Text.Label fontFamily={FONT_FAMILIES.semibold} color={primaryColor}>
                  {t('score') || 'Score'}: {correctAnswers}/{totalQuestions}
                </Text.Label>
              </XStack>
            </XStack>

            {/* Progress Bar */}
            <ProgressBar
              percentage={accuracy}
              primaryColor={primaryColor}
              trackColor={borderColor}
              height={spacing.lg}
            />

            {/* Feedback with emoji */}
            <XStack alignItems="center" gap={spacing.sm} marginBottom={spacing.md}>
              <Text.Title>{getFeedbackEmoji()}</Text.Title>
              <YStack flex={1}>
                <Text.Title fontFamily={FONT_FAMILIES.bold} color={textColor}>
                  {getFeedbackTitle()}
                </Text.Title>
                <Text.Caption color={secondaryTextColor}>
                  {(
                    t('youAnswered', { correct: correctAnswers, total: totalQuestions }) ||
                    `You answered ${correctAnswers} out of ${totalQuestions} questions correctly.`
                  )
                    .split(/(%\{correct\}|%\{total\}|\d+)/)
                    .map((part, i) => {
                      if (part === '%{correct}' || part === String(correctAnswers)) {
                        return (
                          <Text.Caption
                            key={i}
                            fontFamily={FONT_FAMILIES.bold}
                            color={primaryColor}
                          >
                            {correctAnswers}
                          </Text.Caption>
                        );
                      }
                      if (part === '%{total}' || part === String(totalQuestions)) {
                        return (
                          <Text.Caption
                            key={i}
                            fontFamily={FONT_FAMILIES.bold}
                            color={primaryColor}
                          >
                            {totalQuestions}
                          </Text.Caption>
                        );
                      }
                      return part;
                    })}
                </Text.Caption>
              </YStack>
            </XStack>
          </YStack>
        </Animated.View>

        {/* Stats Cards */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <XStack
            paddingHorizontal={spacing.lg}
            paddingTop={spacing.lg}
            gap={spacing.md}
            justifyContent="center"
          >
            {/* Duration Card */}
            <YStack
              flex={1}
              backgroundColor={cardBackground}
              paddingVertical={spacing.lg}
              paddingHorizontal={spacing.md}
              borderRadius={radius.lg}
              alignItems="center"
              gap={spacing.xs}
            >
              <View
                style={{
                  width: statsIconSize,
                  height: statsIconSize,
                  borderRadius: statsIconSize / 2,
                  backgroundColor: isDark ? 'rgba(0, 163, 204, 0.15)' : 'rgba(0, 119, 168, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Timer size={iconSizes.md} color={primaryColor} />
              </View>
              <Text.Caption color={secondaryTextColor} marginTop={spacing.xs}>
                {t('timeSpent') || 'Time Spent'}
              </Text.Caption>
              <Text.Headline fontFamily={FONT_FAMILIES.bold} color={textColor}>
                {formatTime(elapsedTime)}
              </Text.Headline>
            </YStack>

            {/* Streak Card */}
            <YStack
              flex={1}
              backgroundColor={cardBackground}
              paddingVertical={spacing.lg}
              paddingHorizontal={spacing.md}
              borderRadius={radius.lg}
              alignItems="center"
              gap={spacing.xs}
            >
              <View
                style={{
                  width: statsIconSize,
                  height: statsIconSize,
                  borderRadius: statsIconSize / 2,
                  backgroundColor: isDark ? 'rgba(255, 140, 0, 0.15)' : 'rgba(204, 85, 0, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Flame size={typography.fontSize.title} color={accentColor} />
              </View>
              <Text.Caption color={secondaryTextColor} marginTop={spacing.xs}>
                {t('currentStreak') || 'Current Streak'}
              </Text.Caption>
              <Text.Headline fontFamily={FONT_FAMILIES.bold} color={textColor}>
                {bestStreak}x
              </Text.Headline>
            </YStack>
          </XStack>
        </Animated.View>

        {/* Divider */}
        <View
          style={{
            marginHorizontal: spacing.lg,
            marginTop: spacing.xl,
            height: 1,
            backgroundColor: borderColor,
          }}
        />

        {/* Question Insights Section */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <YStack paddingTop={spacing.xl} paddingBottom={spacing.sm} gap={spacing.md}>
            <Text.Title
              fontFamily={FONT_FAMILIES.bold}
              color={textColor}
              paddingHorizontal={spacing.lg}
            >
              {t('questionInsights') || 'Question Insights'}
            </Text.Title>

            {/* Horizontal scrolling cards */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: spacing.lg,
                gap: CARD_GAP,
              }}
              decelerationRate="fast"
              snapToInterval={cardWidth + CARD_GAP}
              snapToAlignment="start"
            >
              {/* Available questions */}
              {questions.map((question, index) => {
                const answer = answers[question.id];
                const selectedAnswerText = getSelectedAnswerText(question, answer);
                const isCorrect = checkIsCorrect(question, answer);

                return (
                  <AnswerReviewCard
                    key={question.id}
                    question={question}
                    questionIndex={index}
                    selectedAnswer={selectedAnswerText}
                    isCorrect={isCorrect}
                    isDark={isDark}
                    onPress={() => handleAnswerCardPress(question)}
                    t={t}
                    cardWidth={cardWidth}
                  />
                );
              })}
              {/* Unavailable questions (deleted from database) */}
              {unavailableQuestionIds.map((questionId, idx) => {
                const answer = answers[questionId];
                // For unavailable questions, we can only determine correctness from StoredAnswer
                const isCorrect = isStoredAnswer(answer) ? answer.correct : false;

                return (
                  <UnavailableQuestionCard
                    key={`unavailable-${questionId}`}
                    questionIndex={questions.length + idx}
                    isCorrect={isCorrect}
                    isDark={isDark}
                    t={t}
                    cardWidth={cardWidth}
                  />
                );
              })}
            </ScrollView>
          </YStack>
        </Animated.View>
      </ScrollView>

      {/* Return button (shown for normal trivia flow) */}
      {showReturnButton && (
        <YStack
          paddingHorizontal={spacing.xl}
          paddingTop={spacing.md}
          paddingBottom={spacing.md}
          backgroundColor={bgColor as any}
        >
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
          >
            <XStack
              backgroundColor={primaryColor}
              paddingVertical={spacing.lg}
              borderRadius={radius.lg}
              justifyContent="center"
              alignItems="center"
              gap={spacing.sm}
            >
              <Text.Body color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                {t('returnToTrivia') || 'Return to Trivia'}
              </Text.Body>
            </XStack>
          </Pressable>
        </YStack>
      )}
    </View>
  );
}
