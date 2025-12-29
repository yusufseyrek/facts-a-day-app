import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, View, ScrollView, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { styled, Text as TamaguiText } from '@tamagui/core';
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
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import { getLucideIcon } from '../../utils/iconMapper';
import type { QuestionWithFact } from '../../services/database';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const CARD_GAP = 12;

// Styled Text components
const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

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
  answers: Record<number, string>; // questionId -> selected answer
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
          top: 0,
          bottom: 0,
          justifyContent: 'center',
        }}
      >
        <Text
          fontSize={12}
          fontFamily={FONT_FAMILIES.bold}
          color={percentage > 85 ? '#FFFFFF' : primaryColor}
        >
          {percentage}%
        </Text>
      </View>
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
}: {
  question: QuestionWithFact;
  questionIndex: number;
  selectedAnswer: string | undefined;
  isCorrect: boolean;
  isDark: boolean;
  onPress?: () => void;
  t: TranslationFunction;
}) {
  const cardBackground = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const errorColor = isDark ? tokens.color.dark.error : tokens.color.light.error;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  
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
      style={{ width: CARD_WIDTH }}
    >
      <Animated.View style={animatedStyle}>
        <YStack
          backgroundColor={cardBackground}
          padding={tokens.space.lg}
          marginVertical={4}
          borderRadius={tokens.radius.xl}
          gap={tokens.space.md}
          minHeight={200}
          shadowColor={isDark ? "#000000": "#dddddd"}
          shadowOffset={{ width: 0, height: 2 }}
          shadowOpacity={isDark ? 0.2 : 0.06}
          shadowRadius={4}
        >
          {/* Card Header */}
          <XStack alignItems="center" gap={tokens.space.sm}>
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
                <Check size={16} color="#FFFFFF" strokeWidth={3} />
              ) : (
                <X size={16} color="#FFFFFF" strokeWidth={3} />
              )}
            </View>
            <Text
              fontSize={16}
              fontFamily={FONT_FAMILIES.bold}
              color={textColor}
            >
              {t('question') || 'Question'} {questionIndex + 1}: {isCorrect ? (t('correct') || 'Correct') + '!' : (t('wrong') || 'Wrong')}
            </Text>
          </XStack>

          {/* Question text */}
          <Text
            fontSize={15}
            fontFamily={FONT_FAMILIES.medium}
            color={textColor}
            lineHeight={22}
          >
            {question.question_text}
          </Text>

          {/* Answer comparison */}
          <YStack 
            gap={tokens.space.sm} 
            backgroundColor={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}
            padding={tokens.space.md}
            borderRadius={tokens.radius.md}
          >
            <XStack gap={tokens.space.md} alignItems="center">
              <View style={{ width: 70 }}>
                <Text
                  fontSize={10}
                  fontFamily={FONT_FAMILIES.bold}
                  color={secondaryTextColor}
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  {t('yourAnswer') || 'YOUR ANSWER'}
                </Text>
              </View>
              <Text
                fontSize={14}
                fontFamily={FONT_FAMILIES.semibold}
                color={isCorrect ? successColor : errorColor}
                flex={1}
              >
                {selectedAnswer ? getDisplayAnswer(selectedAnswer) : '—'}
              </Text>
            </XStack>
            {!isCorrect && (
              <XStack gap={tokens.space.md} alignItems="center">
                <View style={{ width: 70 }}>
                  <Text
                    fontSize={10}
                    fontFamily={FONT_FAMILIES.bold}
                    color={secondaryTextColor}
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    {t('correctAnswer') || 'CORRECT ANSWER'}
                  </Text>
                </View>
                <Text
                  fontSize={14}
                  fontFamily={FONT_FAMILIES.semibold}
                  color={successColor}
                  flex={1}
                >
                  {getDisplayAnswer(question.correct_answer)}
                </Text>
              </XStack>
            )}
          </YStack>

          {/* Insight text from fact */}
          {question.fact?.content && (
            <YStack gap={tokens.space.xs} flex={1}>
              <Text
                fontSize={13}
                fontFamily={FONT_FAMILIES.regular_italic}
                color={secondaryTextColor}
                numberOfLines={3}
                lineHeight={18}
              >
                {t('explanation') || 'Explanation'}: {question.explanation}
              </Text>
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
                <Text
                  fontSize={13}
                  fontFamily={FONT_FAMILIES.semibold}
                  color={primaryColor}
                >
                  {t('seeFact', { id: question.fact.id }) || `Fact#${question.fact.id}`}
                </Text>
                <ChevronRight size={16} color={primaryColor} />
              </XStack>
            </XStack>
          )}
        </YStack>
      </Animated.View>
    </Pressable>
  );
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
}: TriviaResultsProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  // Colors
  const bgColor = isDark ? tokens.color.dark.background : tokens.color.light.background;
  const cardBackground = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const accentColor = isDark ? tokens.color.dark.accent : tokens.color.light.accent;
  const borderColor = isDark ? tokens.color.dark.border : tokens.color.light.border;

  const accuracy = totalQuestions > 0 
    ? Math.round((correctAnswers / totalQuestions) * 100)
    : 0;
  const isPerfect = correctAnswers === totalQuestions;

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
    <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: showReturnButton ? insets.bottom + tokens.space.md : 0 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Screen Header (when viewing past results) */}
      {showBackButton && (
        <XStack
          paddingTop={tokens.space.sm}
          paddingBottom={tokens.space.md}
          paddingHorizontal={tokens.space.lg}
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
              <ChevronLeft size={24} color={primaryColor} />
            </View>
          </Pressable>
          
          <Text
            fontSize={20}
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
          >
            {customTitle || t('testResults') || 'Test Results'}
          </Text>
          
          {/* Empty spacer to balance the header */}
          <View style={{ width: 36, height: 36 }} />
        </XStack>
      )}
      
      <ScrollView 
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <YStack paddingTop={tokens.space.lg} paddingHorizontal={tokens.space.xl} gap={tokens.space.lg}>
            {/* Date/Time Subtitle */}
            {customSubtitle && (
              <XStack alignSelf='center' alignItems="center" gap={tokens.space.sm}>
                <Calendar size={16} color={secondaryTextColor} />
                <Text 
                  fontSize={15} 
                  fontFamily={FONT_FAMILIES.semibold} 
                  color={secondaryTextColor}
                >
                  {customSubtitle}
                </Text>
              </XStack>
            )}
            
            {/* Only show title here if not showing header bar */}
            {!showBackButton && (
              <Text 
                fontSize={28} 
                fontFamily={FONT_FAMILIES.bold} 
                color={textColor}
              >
                {customTitle || t('testResults') || 'Test Results'}
              </Text>
            )}
            
            {/* Badge + Score Row */}
            <XStack alignItems="center" justifyContent="space-between" >
              {/* Trivia Mode/Category Badge */}
              {triviaModeBadge ? (
                <XStack 
                  alignItems="center" 
                  gap={tokens.space.xs}
                  backgroundColor={`${triviaModeBadge.color || primaryColor}15`}
                  paddingHorizontal={tokens.space.sm}
                  paddingVertical={4}
                  borderRadius={tokens.radius.md}
                >
                  {triviaModeBadge.icon && getLucideIcon(triviaModeBadge.icon, 14, triviaModeBadge.color || primaryColor)}
                  <Text 
                    fontSize={13} 
                    fontFamily={FONT_FAMILIES.semibold} 
                    color={triviaModeBadge.color || primaryColor}
                  >
                    {triviaModeBadge.label}
                  </Text>
                </XStack>
              ) : (
                <View />
              )}
              
              {/* Star + Score Label */}
              <XStack alignItems="center" gap={tokens.space.xs} >
                <Star size={14} color={primaryColor} fill={primaryColor} />
                <Text 
                  fontSize={13} 
                  fontFamily={FONT_FAMILIES.semibold} 
                  color={primaryColor}
                >
                  {t('score') || 'Score'}: {correctAnswers}/{totalQuestions}
                </Text>
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
            <XStack alignItems="center" gap={tokens.space.sm} marginBottom={tokens.space.md}>
              <Text fontSize={24}>
                {getFeedbackEmoji()}
              </Text>
              <YStack flex={1}>
                <Text 
                  fontSize={18} 
                  fontFamily={FONT_FAMILIES.bold} 
                  color={textColor}
                >
                  {getFeedbackTitle()}
                </Text>
                <Text fontSize={14} color={secondaryTextColor}>
                  {(t('youAnswered', { correct: correctAnswers, total: totalQuestions }) ||
                    `You answered ${correctAnswers} out of ${totalQuestions} questions correctly.`)
                    .split(/(%\{correct\}|%\{total\}|\d+)/)
                    .map((part, i) => {
                      if (part === '%{correct}' || part === String(correctAnswers)) {
                        return (
                          <Text key={i} fontSize={14} fontFamily={FONT_FAMILIES.bold} color={primaryColor}>
                            {correctAnswers}
                          </Text>
                        );
                      }
                      if (part === '%{total}' || part === String(totalQuestions)) {
                        return (
                          <Text key={i} fontSize={14} fontFamily={FONT_FAMILIES.bold} color={primaryColor}>
                            {totalQuestions}
                          </Text>
                        );
                      }
                      return part;
                    })}
                </Text>
              </YStack>
            </XStack>
          </YStack>
        </Animated.View>

        {/* Stats Cards */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <XStack 
            paddingHorizontal={tokens.space.lg} 
            paddingTop={tokens.space.lg}
            gap={tokens.space.md}
            justifyContent="center"
          >
            {/* Duration Card */}
            <YStack
              flex={1}
              backgroundColor={cardBackground}
              paddingVertical={tokens.space.lg}
              paddingHorizontal={tokens.space.md}
              borderRadius={tokens.radius.lg}
              alignItems="center"
              gap={tokens.space.xs}
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
                <Timer size={22} color={primaryColor} />
              </View>
              <Text fontSize={12} color={secondaryTextColor} marginTop={tokens.space.xs}>
                {t('timeSpent') || 'Time Spent'}
              </Text>
              <Text fontSize={24} fontFamily={FONT_FAMILIES.bold} color={textColor}>
                {formatTime(elapsedTime)}
              </Text>
            </YStack>

            {/* Streak Card */}
            <YStack
              flex={1}
              backgroundColor={cardBackground}
              paddingVertical={tokens.space.lg}
              paddingHorizontal={tokens.space.md}
              borderRadius={tokens.radius.lg}
              alignItems="center"
              gap={tokens.space.xs}
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
                <Flame size={22} color={accentColor} />
              </View>
              <Text fontSize={12} color={secondaryTextColor} marginTop={tokens.space.xs}>
                {t('currentStreak') || 'Current Streak'}
              </Text>
              <Text fontSize={24} fontFamily={FONT_FAMILIES.bold} color={textColor}>
                {bestStreak}x
              </Text>
            </YStack>
          </XStack>
        </Animated.View>

        {/* Divider */}
        <View 
          style={{ 
            marginHorizontal: tokens.space.lg, 
            marginTop: tokens.space.xl,
            height: 1,
            backgroundColor: borderColor,
          }} 
        />

        {/* Question Insights Section */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <YStack paddingTop={tokens.space.xl} paddingBottom={tokens.space.sm} gap={tokens.space.md}>
            <Text 
              fontSize={18} 
              fontFamily={FONT_FAMILIES.bold} 
              color={textColor}
              paddingHorizontal={tokens.space.lg}
            >
              {t('questionInsights') || 'Question Insights'}
            </Text>

            {/* Horizontal scrolling cards */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: tokens.space.lg,
                gap: CARD_GAP,
              }}
              decelerationRate="fast"
              snapToInterval={CARD_WIDTH + CARD_GAP}
              snapToAlignment="start"
            >
              {questions.map((question, index) => {
                const selectedAnswer = answers[question.id];
                // Case-insensitive comparison for true/false questions
                const isCorrect = question.question_type === 'true_false'
                  ? selectedAnswer?.toLowerCase() === question.correct_answer?.toLowerCase()
                  : selectedAnswer === question.correct_answer;
                
                return (
                  <AnswerReviewCard
                    key={question.id}
                    question={question}
                    questionIndex={index}
                    selectedAnswer={selectedAnswer}
                    isCorrect={isCorrect}
                    isDark={isDark}
                    onPress={() => handleAnswerCardPress(question)}
                    t={t}
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
          paddingHorizontal={tokens.space.xl} 
          paddingTop={tokens.space.md}
          paddingBottom={tokens.space.md}
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
              paddingVertical={tokens.space.lg}
              borderRadius={tokens.radius.lg}
              justifyContent="center"
              alignItems="center"
              gap={tokens.space.sm}
            >
              <Text 
                color="#FFFFFF" 
                fontSize={17} 
                fontFamily={FONT_FAMILIES.semibold}
              >
                {t('returnToTrivia') || 'Return to Trivia'}
              </Text>
            </XStack>
          </Pressable>
        </YStack>
      )}
    </View>
  );
}
