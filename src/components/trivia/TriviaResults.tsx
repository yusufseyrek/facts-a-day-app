import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, View, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { Timer, Flame, Check, X, ChevronRight } from '@tamagui/lucide-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import type { QuestionWithFact } from '../../services/database';

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
}

// Circular progress component
function CircularProgress({ 
  percentage, 
  size = 180, 
  strokeWidth = 12,
  primaryColor,
  trackColor,
}: { 
  percentage: number; 
  size?: number; 
  strokeWidth?: number;
  primaryColor: string;
  trackColor: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={primaryColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// Answer review item component
function AnswerReviewItem({
  question,
  selectedAnswer,
  isCorrect,
  isDark,
  onPress,
  t,
}: {
  question: QuestionWithFact;
  selectedAnswer: string | undefined;
  isCorrect: boolean;
  isDark: boolean;
  onPress?: () => void;
  t: TranslationFunction;
}) {
  const surfaceColor = isDark ? tokens.color.dark.surface : tokens.color.light.surface;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const errorColor = isDark ? tokens.color.dark.error : tokens.color.light.error;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  
  const handlePress = () => {
    if (!isCorrect && onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  // Helper to translate True/False answers (handle both capitalized and lowercase)
  const getDisplayAnswer = (answer: string): string => {
    const lowerAnswer = answer?.toLowerCase();
    if (lowerAnswer === 'true') return t('true') || 'True';
    if (lowerAnswer === 'false') return t('false') || 'False';
    return answer;
  };

  return (
    <Pressable 
      onPress={handlePress}
      disabled={isCorrect}
      style={({ pressed }) => [
        { opacity: pressed && !isCorrect ? 0.7 : 1 }
      ]}
    >
      <YStack
        backgroundColor={surfaceColor as any}
        paddingVertical={tokens.space.md}
        paddingHorizontal={tokens.space.md}
        borderRadius={tokens.radius.lg}
        gap={tokens.space.sm}
      >
        <XStack gap={tokens.space.md} alignItems="flex-start">
          {/* Status icon */}
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: isCorrect ? successColor : errorColor,
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: 2,
            }}
          >
            {isCorrect ? (
              <Check size={14} color="#FFFFFF" strokeWidth={3} />
            ) : (
              <X size={14} color="#FFFFFF" strokeWidth={3} />
            )}
          </View>

          {/* Content */}
          <YStack flex={1} gap={tokens.space.xs}>
            {/* Question text */}
            <Text
              fontSize={14}
              fontFamily={FONT_FAMILIES.medium}
              color={textColor}
              numberOfLines={2}
              lineHeight={20}
            >
              {question.question_text}
            </Text>

            {isCorrect ? (
              // Just show the correct answer for correct ones
              <Text
                fontSize={13}
                fontFamily={FONT_FAMILIES.medium}
                color={successColor}
              >
                {getDisplayAnswer(question.correct_answer)}
              </Text>
            ) : (
              // Show user answer vs correct answer for wrong ones
              <YStack gap={4}>
                <XStack gap={tokens.space.sm} alignItems="center">
                  <View style={{ width: 56 }}>
                    <Text
                      fontSize={11}
                      fontFamily={FONT_FAMILIES.semibold}
                      color={secondaryTextColor}
                      textTransform="uppercase"
                      letterSpacing={0.5}
                    >
                      {t('you') || 'YOU'}
                    </Text>
                  </View>
                  <Text
                    fontSize={13}
                    fontFamily={FONT_FAMILIES.medium}
                    color={errorColor}
                    flex={1}
                    numberOfLines={1}
                  >
                    {selectedAnswer ? getDisplayAnswer(selectedAnswer) : '—'}
                  </Text>
                </XStack>
                <XStack gap={tokens.space.sm} alignItems="center">
                  <View style={{ width: 56 }}>
                    <Text
                      fontSize={11}
                      fontFamily={FONT_FAMILIES.semibold}
                      color={secondaryTextColor}
                      textTransform="uppercase"
                      letterSpacing={0.5}
                    >
                      {t('correct') || 'CORRECT'}
                    </Text>
                  </View>
                  <Text
                    fontSize={13}
                    fontFamily={FONT_FAMILIES.medium}
                    color={successColor}
                    flex={1}
                    numberOfLines={1}
                  >
                    {getDisplayAnswer(question.correct_answer)}
                  </Text>
                </XStack>
              </YStack>
            )}
          </YStack>
        </XStack>

        {/* See Fact link for wrong answers */}
        {!isCorrect && question.fact?.id && (
          <XStack 
            alignItems="center" 
            justifyContent="flex-end"
            paddingTop={tokens.space.xs}
          >
            <XStack alignItems="center" gap={2}>
              <Text
                fontSize={12}
                fontFamily={FONT_FAMILIES.semibold}
                color={primaryColor}
              >
                {t('seeFact', { id: question.fact.id }) || `Fact#${question.fact.id}`}
              </Text>
              <ChevronRight size={14} color={primaryColor} />
            </XStack>
          </XStack>
        )}
      </YStack>
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
}: TriviaResultsProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  // Colors
  const bgColor = isDark ? tokens.color.dark.background : tokens.color.light.background;
  const surfaceColor = isDark ? tokens.color.dark.surface : tokens.color.light.surface;
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

  // Get title based on score
  const getResultTitle = () => {
    if (timeExpired) return t('timeUp') || "Time's Up!";
    if (isPerfect) return t('perfectScore') || 'Perfect Score!';
    if (accuracy >= 80) return t('greatJob') || 'Great Job!';
    if (accuracy >= 60) return t('wellDone') || 'Well Done!';
    if (accuracy >= 40) return t('keepPracticing') || 'Keep Practicing!';
    return t('tryAgain') || 'Try Again!';
  };

  // Handle opening fact detail for wrong answers - use Expo Router like rest of app
  const handleWrongAnswerPress = (question: QuestionWithFact) => {
    if (question.fact?.id) {
      router.push(`/fact/${question.fact.id}?source=trivia_review`);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tokens.space.xl }}
      >
        {/* Header Section */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <YStack alignItems="center" paddingTop={tokens.space.xl} paddingHorizontal={tokens.space.xl} gap={tokens.space.lg}>
            {/* Title */}
            <Text 
              fontSize={28} 
              fontFamily={FONT_FAMILIES.bold} 
              color={textColor}
              textAlign="center"
            >
              {getResultTitle()}
            </Text>

            {/* Circular Progress */}
            <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress
                percentage={accuracy}
                size={180}
                strokeWidth={12}
                primaryColor={primaryColor}
                trackColor={borderColor}
              />
              <View 
                style={{ 
                  position: 'absolute', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                }}
              >
                <Text 
                  fontSize={48} 
                  fontFamily={FONT_FAMILIES.bold} 
                  color={primaryColor}
                >
                  {accuracy}%
                </Text>
                <Text 
                  fontSize={14} 
                  fontFamily={FONT_FAMILIES.semibold} 
                  color={secondaryTextColor}
                  textTransform="uppercase"
                  letterSpacing={1}
                >
                  {t('score') || 'SCORE'}
                </Text>
              </View>
            </View>

            {/* Score description */}
            <Text fontSize={16} color={secondaryTextColor} textAlign="center">
              {t('youAnswered', { correct: correctAnswers, total: totalQuestions }) ||
                `You answered ${correctAnswers} out of ${totalQuestions} questions correctly.`}
            </Text>
          </YStack>
        </Animated.View>

        {/* Stats Cards */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <XStack 
            paddingHorizontal={tokens.space.lg} 
            paddingTop={tokens.space.xl}
            gap={tokens.space.md}
            justifyContent="center"
          >
            {/* Duration Card */}
            <YStack
              flex={1}
              backgroundColor={surfaceColor as any}
              paddingVertical={tokens.space.lg}
              paddingHorizontal={tokens.space.md}
              borderRadius={tokens.radius.lg}
              alignItems="center"
              gap={tokens.space.xs}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: isDark ? 'rgba(0, 163, 204, 0.15)' : 'rgba(0, 119, 168, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Timer size={18} color={primaryColor} />
              </View>
              <Text fontSize={12} color={secondaryTextColor} marginTop={tokens.space.xs}>
                {t('duration') || 'Duration'}
              </Text>
              <Text fontSize={22} fontFamily={FONT_FAMILIES.bold} color={textColor}>
                {formatTime(elapsedTime)}
              </Text>
            </YStack>

            {/* Streak Card */}
            <YStack
              flex={1}
              backgroundColor={surfaceColor as any}
              paddingVertical={tokens.space.lg}
              paddingHorizontal={tokens.space.md}
              borderRadius={tokens.radius.lg}
              alignItems="center"
              gap={tokens.space.xs}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: isDark ? 'rgba(255, 140, 0, 0.15)' : 'rgba(204, 85, 0, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Flame size={18} color={accentColor} />
              </View>
              <Text fontSize={12} color={secondaryTextColor} marginTop={tokens.space.xs}>
                {t('bestStreak') || 'Best Streak'}
              </Text>
              <Text fontSize={22} fontFamily={FONT_FAMILIES.bold} color={textColor}>
                {bestStreak}x
              </Text>
            </YStack>
          </XStack>
        </Animated.View>

        {/* Divider */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <View 
            style={{ 
              marginHorizontal: tokens.space.lg, 
              marginTop: tokens.space.xl,
              height: 1,
              backgroundColor: borderColor,
            }} 
          />
        </Animated.View>

        {/* Answer Review Section */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <YStack paddingHorizontal={tokens.space.lg} paddingTop={tokens.space.xl} gap={tokens.space.md}>
            <Text 
              fontSize={16} 
              fontFamily={FONT_FAMILIES.semibold} 
              color={textColor}
              letterSpacing={0.3}
            >
              {t('answerReview') || 'Answer Review'}
            </Text>

            <YStack gap={tokens.space.sm}>
              {questions.map((question, index) => {
                const selectedAnswer = answers[question.id];
                // Case-insensitive comparison for true/false questions
                const isCorrect = question.question_type === 'true_false'
                  ? selectedAnswer?.toLowerCase() === question.correct_answer?.toLowerCase()
                  : selectedAnswer === question.correct_answer;
                
                return (
                  <AnswerReviewItem
                    key={question.id}
                    question={question}
                    selectedAnswer={selectedAnswer}
                    isCorrect={isCorrect}
                    isDark={isDark}
                    onPress={() => handleWrongAnswerPress(question)}
                    t={t}
                  />
                );
              })}
            </YStack>
          </YStack>
        </Animated.View>
      </ScrollView>
      
      {/* Back button */}
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
    </View>
  );
}
