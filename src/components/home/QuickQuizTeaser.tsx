import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BarChart3, ChevronRight, Eye, Zap } from '@tamagui/lucide-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { XStack, YStack } from 'tamagui';

import { INTERSTITIAL_ADS } from '../../config/app';
import { showQuickQuizInterstitial } from '../../services/adManager';
import { hexColors } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

import type { QuestionWithFact } from '../../services/database';
import type { TranslationKeys } from '../../i18n/translations';

interface QuickQuizTeaserProps {
  question: QuestionWithFact | null;
  shuffledAnswers: string[];
  isDark: boolean;
  onAnswered: (questionId: number, isCorrect: boolean) => void;
  onRetry: () => void;
  onResults: (
    questions: QuestionWithFact[],
    answers: Record<number, string>,
    correct: number
  ) => void;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}

export const QuickQuizTeaser = React.memo(function QuickQuizTeaser({
  question,
  shuffledAnswers,
  isDark,
  onAnswered,
  onRetry,
  onResults,
  t,
}: QuickQuizTeaserProps) {
  const router = useRouter();
  const { spacing, radius, iconSizes, media } = useResponsive();

  const smallIconContainerSize = iconSizes.lg;
  const buttonHeight = media.buttonHeight * 0.7;

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const answeredSinceAdRef = useRef(0);
  // Track all questions and answers for session saving
  const questionsRef = useRef<QuestionWithFact[]>([]);
  const answersRef = useRef<Record<number, string>>({});

  const colors = hexColors[isDark ? 'dark' : 'light'];
  const primaryColor = colors.primary;
  const successColor = colors.success;
  const errorColor = isDark ? hexColors.dark.neonRed : hexColors.light.error;
  const cardBg = colors.cardBackground;
  const borderColor = colors.border;
  const textColor = isDark ? '#FFFFFF' : colors.text;
  const secondaryTextColor = colors.textSecondary;
  const mutedTextColor = colors.textMuted;
  const warningColor = colors.warning;

  const handleAnswer = useCallback(
    (answer: string) => {
      if (selectedAnswer !== null || !question) return;

      const correct = answer.toLowerCase() === question.correct_answer.toLowerCase();
      setSelectedAnswer(answer);
      setIsCorrect(correct);
      setAnsweredCount((prev) => prev + 1);
      if (correct) setCorrectCount((prev) => prev + 1);

      // Track for session
      if (!questionsRef.current.find((q) => q.id === question.id)) {
        questionsRef.current.push(question);
      }
      answersRef.current[question.id] = answer;

      Haptics.impactAsync(
        correct ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy
      );

      onAnswered(question.id, correct);

      // Show interstitial ad every 10 answers
      answeredSinceAdRef.current += 1;
      if (answeredSinceAdRef.current >= INTERSTITIAL_ADS.QUICK_QUIZ_ANSWERS_BETWEEN_ADS) {
        answeredSinceAdRef.current = 0;
        showQuickQuizInterstitial().catch(() => {});
      }
    },
    [selectedAnswer, question, onAnswered]
  );

  const handleSeeFact = useCallback(() => {
    if (!question?.fact_id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/fact/${question.fact_id}?source=home_quiz`);
  }, [question, router]);

  const handleResults = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const questions = questionsRef.current;
    const answers = answersRef.current;
    const correct = correctCount;
    // Reset state
    questionsRef.current = [];
    answersRef.current = {};
    setSelectedAnswer(null);
    setIsCorrect(null);
    setCorrectCount(0);
    setAnsweredCount(0);
    answeredSinceAdRef.current = 0;
    onRetry();
    onResults(questions, answers, correct);
  }, [onResults, onRetry, correctCount]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAnswer(null);
    setIsCorrect(null);
    onRetry();
  }, [onRetry]);

  // Don't render if no question available
  if (!question) return null;

  const isTrueFalse = question.question_type === 'true_false';

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[shadowStyles.card, { borderRadius: radius.md }]}
    >
      <YStack
        backgroundColor={cardBg}
        padding={spacing.lg}
        borderRadius={radius.md}
        borderWidth={1}
        borderColor={
          selectedAnswer !== null ? (isCorrect ? successColor : errorColor) : borderColor
        }
        gap={spacing.md}
      >
        {/* Header */}
        <XStack alignItems="center" gap={spacing.sm}>
          <YStack
            width={smallIconContainerSize}
            height={smallIconContainerSize}
            borderRadius={smallIconContainerSize / 2}
            backgroundColor={primaryColor}
            justifyContent="center"
            alignItems="center"
          >
            <Zap size={iconSizes.sm} color="#FFFFFF" />
          </YStack>
          <Text.Label fontFamily={FONT_FAMILIES.semibold} color={textColor} flex={1}>
            {t('quickQuiz')}
          </Text.Label>
          {/* View Fact */}
          {question.fact_id && (
            <Pressable
              onPress={handleSeeFact}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <XStack alignItems="center" gap={spacing.xs}>
                <Eye size={iconSizes.xs} color={primaryColor} />
                <Text.Tiny fontFamily={FONT_FAMILIES.medium} color={primaryColor}>
                  {t('viewFact')}
                </Text.Tiny>
              </XStack>
            </Pressable>
          )}
          {/* Score */}
          {answeredCount > 0 && (
            <XStack
              backgroundColor={isDark ? 'rgba(0, 163, 204, 0.15)' : 'rgba(0, 119, 168, 0.1)'}
              paddingVertical={spacing.xs}
              paddingHorizontal={spacing.md}
              borderRadius={radius.sm}
              alignItems="center"
              gap={spacing.xs}
            >
              <Text.Label fontFamily={FONT_FAMILIES.bold} color={successColor}>
                {correctCount}
              </Text.Label>
              <Text.Caption fontFamily={FONT_FAMILIES.medium} color={mutedTextColor}>
                /
              </Text.Caption>
              <Text.Label fontFamily={FONT_FAMILIES.bold} color={primaryColor}>
                {answeredCount}
              </Text.Label>
            </XStack>
          )}
        </XStack>

        {/* Question */}
        <Text.Body fontFamily={FONT_FAMILIES.medium} color={textColor}>
          {question.question_text}
        </Text.Body>

        {/* Answer buttons */}
        {isTrueFalse ? (
          <XStack gap={spacing.sm} alignItems="stretch">
            {shuffledAnswers.map((answer) => (
              <AnswerButton
                key={answer}
                answer={answer}
                displayText={answer === 'True' ? t('a11y_trueAnswer') : t('a11y_falseAnswer')}
                selectedAnswer={selectedAnswer}
                correctAnswer={question.correct_answer}
                isDark={isDark}
                onPress={handleAnswer}
                flex={1}
              />
            ))}
          </XStack>
        ) : (
          <YStack gap={spacing.sm}>
            <XStack gap={spacing.sm} alignItems="stretch">
              {shuffledAnswers.slice(0, 2).map((answer) => (
                <AnswerButton
                  key={answer}
                  answer={answer}
                  displayText={answer}
                  selectedAnswer={selectedAnswer}
                  correctAnswer={question.correct_answer}
                  isDark={isDark}
                  onPress={handleAnswer}
                  flex={1}
                />
              ))}
            </XStack>
            <XStack gap={spacing.sm} alignItems="stretch">
              {shuffledAnswers.slice(2, 4).map((answer) => (
                <AnswerButton
                  key={answer}
                  answer={answer}
                  displayText={answer}
                  selectedAnswer={selectedAnswer}
                  correctAnswer={question.correct_answer}
                  isDark={isDark}
                  onPress={handleAnswer}
                  flex={1}
                />
              ))}
            </XStack>
          </YStack>
        )}

        {/* Feedback + Actions — persists after first answer to prevent layout jumps */}
        {answeredCount > 0 && (
          <YStack gap={spacing.sm}>
            {selectedAnswer !== null && isCorrect !== null ? (
              isCorrect ? (
                <Text.Caption fontFamily={FONT_FAMILIES.semibold} color={successColor}>
                  {t('greatYouGotIt')}
                </Text.Caption>
              ) : (
                <Text.Caption fontFamily={FONT_FAMILIES.semibold} color={errorColor}>
                  {t('wrongTryAgain')}
                </Text.Caption>
              )
            ) : (
              <Text.Caption fontFamily={FONT_FAMILIES.medium} color={warningColor}>
                {t('chooseAnOption')}
              </Text.Caption>
            )}

            <XStack gap={spacing.sm}>
              {/* Results */}
              {answeredCount >= 2 && (
                <Pressable
                  onPress={handleResults}
                  disabled={selectedAnswer === null}
                  style={({ pressed }) => [
                    { flex: 1 },
                    pressed &&
                      selectedAnswer !== null && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <XStack
                    backgroundColor={colors.surface}
                    height={buttonHeight}
                    borderRadius={radius.sm}
                    borderWidth={1}
                    borderColor={borderColor}
                    alignItems="center"
                    justifyContent="center"
                    gap={spacing.xs}
                    opacity={selectedAnswer !== null ? 1 : 0.4}
                  >
                    <BarChart3 size={iconSizes.sm} color={secondaryTextColor} />
                    <Text.Caption fontFamily={FONT_FAMILIES.semibold} color={secondaryTextColor}>
                      {t('seeResults')}
                    </Text.Caption>
                  </XStack>
                </Pressable>
              )}

              {/* Next */}
              <Pressable
                onPress={handleNext}
                disabled={selectedAnswer === null}
                style={({ pressed }) => [
                  { flex: 1 },
                  pressed &&
                    selectedAnswer !== null && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                ]}
              >
                <XStack
                  backgroundColor={primaryColor}
                  height={buttonHeight}
                  borderRadius={radius.sm}
                  alignItems="center"
                  justifyContent="center"
                  gap={spacing.xs}
                  opacity={selectedAnswer !== null ? 1 : 0.4}
                >
                  <Text.Caption fontFamily={FONT_FAMILIES.semibold} color="#FFFFFF">
                    {t('nextQuestion')}
                  </Text.Caption>
                  <ChevronRight size={iconSizes.sm} color="#FFFFFF" />
                </XStack>
              </Pressable>
            </XStack>
          </YStack>
        )}
      </YStack>
    </Animated.View>
  );
});

// ====== ANSWER BUTTON ======

interface AnswerButtonProps {
  answer: string;
  displayText: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  isDark: boolean;
  onPress: (answer: string) => void;
  flex?: number;
}

const AnswerButton = React.memo(function AnswerButton({
  answer,
  displayText,
  selectedAnswer,
  correctAnswer,
  isDark,
  onPress,
  flex,
}: AnswerButtonProps) {
  const { spacing, radius, media } = useResponsive();
  const colors = hexColors[isDark ? 'dark' : 'light'];
  const isSelected = selectedAnswer === answer;
  const hasAnswered = selectedAnswer !== null;
  const isCorrectAnswer = answer.toLowerCase() === correctAnswer.toLowerCase();

  let bg: string = colors.surface;
  let border: string = colors.border;
  let textClr: string = isDark ? '#FFFFFF' : colors.text;

  if (hasAnswered) {
    if (isCorrectAnswer) {
      bg = isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)';
      border = colors.success;
      textClr = colors.success;
    } else if (isSelected) {
      bg = isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)';
      border = isDark ? hexColors.dark.neonRed : hexColors.light.error;
      textClr = isDark ? hexColors.dark.neonRed : hexColors.light.error;
    } else {
      textClr = colors.textMuted;
    }
  }

  return (
    <Pressable
      onPress={() => onPress(answer)}
      disabled={hasAnswered}
      style={({ pressed }) => ({
        flex,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <YStack
        flex={1}
        backgroundColor={bg}
        paddingVertical={spacing.sm}
        paddingHorizontal={spacing.md}
        borderRadius={radius.sm}
        borderWidth={1}
        borderColor={border}
        alignItems="center"
        justifyContent="center"
        minHeight={media.buttonHeight * 0.7}
      >
        <Text.Caption fontFamily={FONT_FAMILIES.medium} color={textClr} textAlign="center">
          {displayText}
        </Text.Caption>
      </YStack>
    </Pressable>
  );
});

const shadowStyles = StyleSheet.create({
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
});
