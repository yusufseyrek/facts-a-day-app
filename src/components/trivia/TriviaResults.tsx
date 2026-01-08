import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, View, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { YStack, XStack } from 'tamagui';
import { Timer, Flame, Check, X, ChevronRight, Star, ChevronLeft, Calendar } from '@tamagui/lucide-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { 
  FadeInDown, 
  FadeInUp, 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring 
} from 'react-native-reanimated';
import { hexColors, spacing, radius } from '../../theme';
import { Text, FONT_FAMILIES } from '../Typography';
import { useResponsive } from '../../utils/useResponsive';
import { getLucideIcon } from '../../utils/iconMapper';
import type { QuestionWithFact, StoredAnswer } from '../../services/database';
import { indexToAnswer } from '../../services/trivia';

const CARD_GAP = 12;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const { typography: typo } = useResponsive();
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
          top: 0,
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
  const { typography: typo } = useResponsive();
  const cardBackground = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;

  return (
    <View style={{ width: cardWidth }}>
      <YStack
        backgroundColor={cardBackground}
        padding={spacing.phone.lg}
        marginVertical={4}
        borderRadius={radius.phone.xl}
        gap={spacing.phone.md}
        minHeight={150}
        justifyContent="center"
        alignItems="center"
        opacity={0.7}
        shadowColor={isDark ? "#000000": "#dddddd"}
        shadowOffset={{ width: 0, height: 2 }}
        shadowOpacity={isDark ? 0.2 : 0.06}
        shadowRadius={4}
      >
        {/* Card Header */}
        <XStack alignItems="center" gap={spacing.phone.sm}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: isCorrect ? successColor : errorColor,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {isCorrect ? (
              <Check size={typo.fontSize.body} color="#FFFFFF" strokeWidth={3} />
            ) : (
              <X size={typo.fontSize.body} color="#FFFFFF" strokeWidth={3} />
            )}
          </View>
          <Text.Body
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
          >
            {t('question') || 'Question'} {questionIndex + 1}: {isCorrect ? (t('correct') || 'Correct') + '!' : (t('wrong') || 'Wrong')}
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
  const { typography: typo } = useResponsive();
  const cardBackground = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  
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
          padding={spacing.phone.lg}
          marginVertical={4}
          borderRadius={radius.phone.xl}
          gap={spacing.phone.md}
          minHeight={200}
          shadowColor={isDark ? "#000000": "#dddddd"}
          shadowOffset={{ width: 0, height: 2 }}
          shadowOpacity={isDark ? 0.2 : 0.06}
          shadowRadius={4}
        >
          {/* Card Header */}
          <XStack alignItems="center" gap={spacing.phone.sm}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: isCorrect ? successColor : errorColor,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
            {isCorrect ? (
              <Check size={typo.fontSize.body} color="#FFFFFF" strokeWidth={3} />
            ) : (
              <X size={typo.fontSize.body} color="#FFFFFF" strokeWidth={3} />
            )}
          </View>
          <Text.Body
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
          >
            {t('question') || 'Question'} {questionIndex + 1}: {isCorrect ? (t('correct') || 'Correct') + '!' : (t('wrong') || 'Wrong')}
          </Text.Body>
        </XStack>

        {/* Question text */}
        <Text.Body
          fontFamily={FONT_FAMILIES.medium}
          color={textColor}
          lineHeight={typo.lineHeight.title}
        >
          {question.question_text}
        </Text.Body>

        {/* Answer comparison */}
        <YStack 
          gap={spacing.phone.sm} 
          backgroundColor={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}
          padding={spacing.phone.md}
          borderRadius={radius.phone.md}
        >
          <XStack gap={spacing.phone.md} alignItems="center">
            <View style={{ width: 70 }}>
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
            <XStack gap={spacing.phone.md} alignItems="center">
              <View style={{ width: 70 }}>
                <Text.Tiny
                  fontFamily={FONT_FAMILIES.bold}
                  color={secondaryTextColor}
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  {t('correctAnswer') || 'CORRECT ANSWER'}
                </Text.Tiny>
              </View>
              <Text.Caption
                fontFamily={FONT_FAMILIES.semibold}
                color={successColor}
                flex={1}
              >
                {getDisplayAnswer(question.correct_answer)}
              </Text.Caption>
            </XStack>
          )}
        </YStack>

        {/* Insight text from fact */}
        {question.fact?.content && (
          <YStack gap={spacing.phone.xs} flex={1}>
            <Text.Caption
              fontFamily={FONT_FAMILIES.regular_italic}
              color={secondaryTextColor}
              numberOfLines={3}
              lineHeight={typo.lineHeight.caption}
            >
              {t('explanation') || 'Explanation'}: {question.explanation}
            </Text.Caption>
          </YStack>
        )}

        {/* See Fact link */}
        {question.fact?.id && (
          <XStack 
            alignItems="center" 
            justifyContent="flex-end"
            marginTop="auto"
          >
            <XStack alignItems="center" gap={2}>
              <Text.Caption
                fontFamily={FONT_FAMILIES.semibold}
                color={primaryColor}
              >
                {t('seeFact', { id: question.fact.id }) || `Fact#${question.fact.id}`}
              </Text.Caption>
              <ChevronRight size={typo.fontSize.body} color={primaryColor} />
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
  wrongCount,
  unansweredCount,
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
  const { screenWidth, typography: typo, gridLayout, iconSizes } = useResponsive();
  
  // Calculate card width: 45% for tablets (two cards side by side), 85% for phones
  const cardWidth = screenWidth * gridLayout.cardWidthMultiplier;
  
  // Colors
  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;
  const cardBackground = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const accentColor = isDark ? hexColors.dark.accent : hexColors.light.accent;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;

  const accuracy = totalQuestions > 0 
    ? Math.round((correctAnswers / totalQuestions) * 100)
    : 0;
  const isPerfect = correctAnswers === totalQuestions;

  /**
   * Get the selected answer text for a question
   * Handles both string answers (live game) and StoredAnswer (historical)
   */
  const getSelectedAnswerText = (question: QuestionWithFact, answer: string | StoredAnswer | undefined): string | undefined => {
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
  const checkIsCorrect = (question: QuestionWithFact, answer: string | StoredAnswer | undefined): boolean => {
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
    <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: showReturnButton ? insets.bottom + spacing.phone.md : 0 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Screen Header (when viewing past results) */}
      {showBackButton && (
        <XStack
          paddingTop={spacing.phone.sm}
          paddingBottom={spacing.phone.md}
          paddingHorizontal={spacing.phone.lg}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor={borderColor}
        >
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => [
              pressed && { opacity: 0.7 }
            ]}
            testID="trivia-results-back-button"
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: `${primaryColor}20`,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <ChevronLeft size={iconSizes.lg} color={primaryColor} />
            </View>
          </Pressable>
          
          <Text.Title
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
          >
            {customTitle || t('testResults') || 'Test Results'}
          </Text.Title>
          
          {/* Empty spacer to balance the header */}
          <View style={{ width: 36, height: 36 }} />
        </XStack>
      )}
      
      <ScrollView 
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <YStack paddingTop={spacing.phone.lg} paddingHorizontal={spacing.phone.xl} gap={spacing.phone.lg}>
            {/* Date/Time Subtitle */}
            {customSubtitle && (
              <XStack alignSelf='center' alignItems="center" gap={spacing.phone.sm}>
                <Calendar size={typo.fontSize.body} color={secondaryTextColor} />
                <Text.Body 
                  fontFamily={FONT_FAMILIES.semibold} 
                  color={secondaryTextColor}
                >
                  {customSubtitle}
                </Text.Body>
              </XStack>
            )}
            
            {/* Only show title here if not showing header bar */}
            {!showBackButton && (
              <Text.Display 
                fontFamily={FONT_FAMILIES.bold} 
                color={textColor}
              >
                {customTitle || t('testResults') || 'Test Results'}
              </Text.Display>
            )}
            
            {/* Badge + Score Row */}
            <XStack alignItems="center" justifyContent="space-between" >
              {/* Trivia Mode/Category Badge */}
              {triviaModeBadge ? (
                <XStack 
                  alignItems="center" 
                  gap={spacing.phone.xs}
                  backgroundColor={`${triviaModeBadge.color || primaryColor}15`}
                  paddingHorizontal={spacing.phone.sm}
                  paddingVertical={4}
                  borderRadius={radius.phone.md}
                >
                  {triviaModeBadge.icon && getLucideIcon(triviaModeBadge.icon, typo.fontSize.caption, triviaModeBadge.color || primaryColor)}
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
              <XStack alignItems="center" gap={spacing.phone.xs} >
                <Star size={typo.fontSize.caption} color={primaryColor} fill={primaryColor} />
                <Text.Caption 
                  fontFamily={FONT_FAMILIES.semibold} 
                  color={primaryColor}
                >
                  {t('score') || 'Score'}: {correctAnswers}/{totalQuestions}
                </Text.Caption>
              </XStack>
            </XStack>

            {/* Progress Bar */}
            <ProgressBar
              percentage={accuracy}
              primaryColor={primaryColor}
              trackColor={borderColor}
              height={18}
            />

            {/* Feedback with emoji */}
            <XStack alignItems="center" gap={spacing.phone.sm} marginBottom={spacing.phone.md}>
              <Text.Title>
                {getFeedbackEmoji()}
              </Text.Title>
              <YStack flex={1}>
                <Text.Title 
                  fontFamily={FONT_FAMILIES.bold} 
                  color={textColor}
                >
                  {getFeedbackTitle()}
                </Text.Title>
                <Text.Caption color={secondaryTextColor}>
                  {(t('youAnswered', { correct: correctAnswers, total: totalQuestions }) ||
                    `You answered ${correctAnswers} out of ${totalQuestions} questions correctly.`)
                    .split(/(%\{correct\}|%\{total\}|\d+)/)
                    .map((part, i) => {
                      if (part === '%{correct}' || part === String(correctAnswers)) {
                        return (
                          <Text.Caption key={i} fontFamily={FONT_FAMILIES.bold} color={primaryColor}>
                            {correctAnswers}
                          </Text.Caption>
                        );
                      }
                      if (part === '%{total}' || part === String(totalQuestions)) {
                        return (
                          <Text.Caption key={i} fontFamily={FONT_FAMILIES.bold} color={primaryColor}>
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
            paddingHorizontal={spacing.phone.lg} 
            paddingTop={spacing.phone.lg}
            gap={spacing.phone.md}
            justifyContent="center"
          >
            {/* Duration Card */}
            <YStack
              flex={1}
              backgroundColor={cardBackground}
              paddingVertical={spacing.phone.lg}
              paddingHorizontal={spacing.phone.md}
              borderRadius={radius.phone.lg}
              alignItems="center"
              gap={spacing.phone.xs}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: isDark ? 'rgba(0, 163, 204, 0.15)' : 'rgba(0, 119, 168, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Timer size={iconSizes.md} color={primaryColor} />
              </View>
              <Text.Caption color={secondaryTextColor} marginTop={spacing.phone.xs}>
                {t('timeSpent') || 'Time Spent'}
              </Text.Caption>
              <Text.Title fontFamily={FONT_FAMILIES.bold} color={textColor}>
                {formatTime(elapsedTime)}
              </Text.Title>
            </YStack>

            {/* Streak Card */}
            <YStack
              flex={1}
              backgroundColor={cardBackground}
              paddingVertical={spacing.phone.lg}
              paddingHorizontal={spacing.phone.md}
              borderRadius={radius.phone.lg}
              alignItems="center"
              gap={spacing.phone.xs}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: isDark ? 'rgba(255, 140, 0, 0.15)' : 'rgba(204, 85, 0, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Flame size={typo.fontSize.title} color={accentColor} />
              </View>
              <Text.Caption color={secondaryTextColor} marginTop={spacing.phone.xs}>
                {t('currentStreak') || 'Current Streak'}
              </Text.Caption>
              <Text.Title fontFamily={FONT_FAMILIES.bold} color={textColor}>
                {bestStreak}x
              </Text.Title>
            </YStack>
          </XStack>
        </Animated.View>

        {/* Divider */}
        <View 
          style={{ 
            marginHorizontal: spacing.phone.lg, 
            marginTop: spacing.phone.xl,
            height: 1,
            backgroundColor: borderColor,
          }} 
        />

        {/* Question Insights Section */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <YStack paddingTop={spacing.phone.xl} paddingBottom={spacing.phone.sm} gap={spacing.phone.md}>
            <Text.Title 
              fontFamily={FONT_FAMILIES.bold} 
              color={textColor}
              paddingHorizontal={spacing.phone.lg}
            >
              {t('questionInsights') || 'Question Insights'}
            </Text.Title>

            {/* Horizontal scrolling cards */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: spacing.phone.lg,
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
          paddingHorizontal={spacing.phone.xl} 
          paddingTop={spacing.phone.md}
          paddingBottom={spacing.phone.md}
          backgroundColor={bgColor as any}
        >
          <Pressable 
            onPress={onClose}
            style={({ pressed }) => [
              pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
            ]}
          >
            <XStack
              backgroundColor={primaryColor}
              paddingVertical={spacing.phone.lg}
              borderRadius={radius.phone.lg}
              justifyContent="center"
              alignItems="center"
              gap={spacing.phone.sm}
            >
              <Text.Body 
                color="#FFFFFF" 
                fontFamily={FONT_FAMILIES.semibold}
              >
                {t('returnToTrivia') || 'Return to Trivia'}
              </Text.Body>
            </XStack>
          </Pressable>
        </YStack>
      )}
    </View>
  );
}
