import React from 'react';
import { Pressable, View, ActivityIndicator, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { X, Timer, ChevronRight, ChevronLeft, BookOpen, Lightbulb } from '@tamagui/lucide-icons';
import Animated, {
  FadeIn,
  FadeInUp,
  SlideInRight,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack } from 'tamagui';

import { Text, FONT_FAMILIES } from '../Typography';
import { hexColors } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';

import type { QuestionWithFact } from '../../services/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFunction = (key: any, params?: any) => string;

export interface TriviaGameViewProps {
  currentQuestion: QuestionWithFact;
  currentQuestionIndex: number;
  totalQuestions: number;
  shuffledAnswers: string[];
  selectedAnswer: string | null;
  timeRemaining: number;
  questionKey: number;
  progressWidth: SharedValue<number>;
  triviaTitle: string;
  isLoadingResults?: boolean;
  onAnswerSelect: (answer: string) => void;
  onNextQuestion: () => void;
  onPrevQuestion: () => void;
  onExit: () => void;
  isDark: boolean;
  t: TranslationFunction;
  // Hint buttons
  onOpenFact?: () => void;
  onShowExplanation?: () => void;
  canUseExplanation?: boolean;
  showExplanation?: boolean;
}

export function TriviaGameView({
  currentQuestion,
  currentQuestionIndex,
  totalQuestions,
  shuffledAnswers,
  selectedAnswer,
  timeRemaining,
  questionKey,
  progressWidth,
  triviaTitle,
  isLoadingResults = false,
  onAnswerSelect,
  onNextQuestion,
  onPrevQuestion,
  onExit,
  isDark,
  t,
  onOpenFact,
  onShowExplanation,
  canUseExplanation = false,
  showExplanation = false,
}: TriviaGameViewProps) {
  const insets = useSafeAreaInsets();
  const { borderWidths, media, typography, iconSizes, spacing, radius } = useResponsive();
  const radioSize = iconSizes.lg;
  const letterBadgeSize = media.topicCardSize * 0.5;

  // Colors
  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;
  const surfaceColor = isDark ? hexColors.dark.surface : hexColors.light.surface;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;
  const accentColor = isDark ? hexColors.dark.accent : hexColors.light.accent;

  const isTrueFalse = currentQuestion.question_type === 'true_false';
  const hasExplanation = !!currentQuestion.explanation;
  const letterLabels = ['A', 'B', 'C', 'D'];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const handlePressWithHaptics = (callback: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    callback();
  };

  // Helper to translate True/False answers
  const getDisplayAnswer = (answer: string): string => {
    if (answer === 'True') return t('true') || 'True';
    if (answer === 'False') return t('false') || 'False';
    return answer;
  };

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

      {/* Header */}
      <XStack
        paddingHorizontal={spacing.lg}
        alignItems="center"
        justifyContent="space-between"
        position="relative"
      >
        <Pressable
          onPress={() => handlePressWithHaptics(onExit)}
          hitSlop={12}
          style={({ pressed }) => [{ zIndex: 1 }, pressed && { opacity: 0.6 }]}
          testID="trivia-game-exit-button"
          role="button"
          aria-label="Exit"
        >
          <X size={iconSizes.lg} color={textColor} />
        </Pressable>

        {/* Trivia Mode Title - Centered */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            paddingBottom: spacing.xs,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text.Body fontFamily={FONT_FAMILIES.bold} color={textColor} numberOfLines={1}>
            {triviaTitle}
          </Text.Body>
        </View>

        {/* Timer */}
        <XStack
          backgroundColor={surfaceColor}
          paddingHorizontal={spacing.md}
          paddingVertical={spacing.sm}
          borderRadius={radius.full}
          alignItems="center"
          gap={spacing.sm}
          zIndex={1}
        >
          <Timer
            size={typography.fontSize.title}
            color={timeRemaining < 30 ? errorColor : primaryColor}
          />
          <Text.Label
            fontFamily={FONT_FAMILIES.bold}
            color={timeRemaining < 30 ? errorColor : textColor}
          >
            {formatTime(timeRemaining)}
          </Text.Label>
        </XStack>
      </XStack>

      {/* Progress section */}
      <YStack paddingHorizontal={spacing.lg} paddingTop={spacing.lg} gap={spacing.sm}>
        <XStack justifyContent="space-between" alignItems="center">
          <Text.Label color={secondaryTextColor}>
            <Text.Label fontFamily={FONT_FAMILIES.bold} color={textColor}>
              {t('question') || 'Question'} {currentQuestionIndex + 1}
            </Text.Label>
            /{totalQuestions}
          </Text.Label>
          {currentQuestion.fact?.categoryData && (
            <Text.Label
              fontFamily={FONT_FAMILIES.semibold}
              color={currentQuestion.fact.categoryData.color_hex}
            >
              {currentQuestion.fact.categoryData.name}
            </Text.Label>
          )}
        </XStack>

        {/* Progress bar */}
        <View
          style={{
            height: borderWidths.extraHeavy,
            backgroundColor: borderColor,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={[
              {
                height: '100%',
                backgroundColor: primaryColor,
                borderRadius: 3,
              },
              progressAnimatedStyle,
            ]}
          />
        </View>
      </YStack>

      {/* Question - scrollable for long content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <Animated.View
          key={questionKey}
          entering={SlideInRight.duration(300)}
          style={{ alignItems: 'center' }}
        >
          <Text.Title
            role="heading"
            fontSize={typography.fontSize.headline}
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
            textAlign="center"
            lineHeight={typography.lineHeight.headline}
          >
            {currentQuestion.question_text}
          </Text.Title>

          {/* Hint Buttons */}
          <XStack
            marginTop={spacing.lg}
            gap={spacing.md}
            justifyContent="center"
            alignItems="center"
          >
            {/* View Fact Button */}
            {currentQuestion.fact?.id && onOpenFact && (
              <Pressable
                onPress={() => handlePressWithHaptics(onOpenFact)}
                role="button"
                aria-label={t('a11y_viewFactButton')}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              >
                <XStack
                  backgroundColor={`${primaryColor}15`}
                  paddingHorizontal={spacing.md}
                  paddingVertical={spacing.sm}
                  borderRadius={radius.full}
                  alignItems="center"
                  gap={spacing.xs}
                >
                  <BookOpen size={typography.fontSize.caption} color={primaryColor} />
                  <Text.Caption fontFamily={FONT_FAMILIES.semibold} color={primaryColor}>
                    {t('viewFact') || 'View Fact'}
                  </Text.Caption>
                </XStack>
              </Pressable>
            )}

            {/* Show Explanation Button */}
            {hasExplanation && onShowExplanation && !showExplanation && (
              <Pressable
                onPress={() => canUseExplanation && handlePressWithHaptics(onShowExplanation)}
                disabled={!canUseExplanation}
                role="button"
                aria-label={t('a11y_showHintButton')}
                style={({ pressed }) => [pressed && canUseExplanation && { opacity: 0.7 }]}
              >
                <XStack
                  backgroundColor={
                    canUseExplanation ? `${accentColor}15` : `${secondaryTextColor}10`
                  }
                  paddingHorizontal={spacing.md}
                  paddingVertical={spacing.sm}
                  borderRadius={radius.full}
                  alignItems="center"
                  gap={spacing.xs}
                  opacity={canUseExplanation ? 1 : 0.5}
                >
                  <Lightbulb
                    size={typography.fontSize.caption}
                    color={canUseExplanation ? accentColor : secondaryTextColor}
                  />
                  <Text.Caption
                    fontFamily={FONT_FAMILIES.semibold}
                    color={canUseExplanation ? accentColor : secondaryTextColor}
                  >
                    {canUseExplanation
                      ? t('showHint') || 'Show Hint'
                      : t('hintUsedToday') || 'Hint used'}
                  </Text.Caption>
                </XStack>
              </Pressable>
            )}
          </XStack>

          {/* Explanation Display */}
          {showExplanation && currentQuestion.explanation && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={{ marginTop: spacing.lg, width: '100%' }}
            >
              <YStack
                backgroundColor={`${accentColor}15`}
                borderWidth={1}
                borderColor={`${accentColor}30`}
                padding={spacing.md}
                borderRadius={radius.lg}
                gap={spacing.xs}
              >
                <XStack alignItems="center" gap={spacing.xs}>
                  <Lightbulb size={typography.fontSize.caption} color={accentColor} />
                  <Text.Caption fontFamily={FONT_FAMILIES.bold} color={accentColor}>
                    {t('hint') || 'Hint'}
                  </Text.Caption>
                </XStack>
                <Text.Body
                  color={textColor}
                  fontFamily={FONT_FAMILIES.regular}
                  lineHeight={typography.lineHeight.body}
                >
                  {currentQuestion.explanation}
                </Text.Body>
              </YStack>
            </Animated.View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Answers */}
      <YStack paddingHorizontal={spacing.lg} gap={spacing.md}>
        {isTrueFalse ? (
          // True/False - side by side radio style
          <XStack gap={spacing.md}>
            {shuffledAnswers.map((answer, index) => {
              const isSelected = selectedAnswer === answer;

              let optionBg: string = surfaceColor;
              let optionBorder: string = borderColor;

              if (isSelected) {
                optionBg = isDark ? 'rgba(0, 163, 204, 0.2)' : 'rgba(0, 119, 168, 0.15)';
                optionBorder = primaryColor;
              }

              return (
                <Pressable
                  key={answer}
                  role="button"
                  aria-label={answer === 'True' ? t('a11y_trueAnswer') : t('a11y_falseAnswer')}
                  style={({ pressed }) => [
                    { flex: 1 },
                    pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                  ]}
                  onPress={() => handlePressWithHaptics(() => onAnswerSelect(answer))}
                >
                  <Animated.View entering={FadeInUp.delay(index * 50).duration(200)}>
                    <YStack
                      backgroundColor={optionBg as any}
                      borderWidth={2}
                      borderColor={optionBorder as any}
                      paddingVertical={spacing.lg}
                      borderRadius={radius.lg}
                      alignItems="center"
                      justifyContent="center"
                      gap={spacing.sm}
                    >
                      {/* Radio circle */}
                      <View
                        style={{
                          width: radioSize,
                          height: radioSize,
                          borderRadius: radioSize / 2,
                          borderWidth: 2,
                          borderColor: isSelected ? primaryColor : borderColor,
                          backgroundColor: isSelected ? primaryColor : 'transparent',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {isSelected && (
                          <View
                            style={{
                              width: radioSize / 3,
                              height: radioSize / 3,
                              borderRadius: radioSize / 6,
                              backgroundColor: '#FFFFFF',
                            }}
                          />
                        )}
                      </View>
                      <Text.Body fontFamily={FONT_FAMILIES.semibold} color={textColor}>
                        {getDisplayAnswer(answer)}
                      </Text.Body>
                    </YStack>
                  </Animated.View>
                </Pressable>
              );
            })}
          </XStack>
        ) : (
          // Multiple choice - list with letter badges
          <YStack gap={spacing.sm}>
            {shuffledAnswers.map((answer, index) => {
              const isSelected = selectedAnswer === answer;

              let optionBg: string = surfaceColor;
              let optionBorder: string = borderColor;
              let badgeBg: string = isDark ? hexColors.dark.border : hexColors.light.border;
              let badgeText: string = secondaryTextColor;

              if (isSelected) {
                optionBg = isDark ? 'rgba(0, 163, 204, 0.2)' : 'rgba(0, 119, 168, 0.15)';
                optionBorder = primaryColor;
                badgeBg = primaryColor;
                badgeText = '#FFFFFF';
              }

              return (
                <Pressable
                  key={answer}
                  role="button"
                  aria-label={answer}
                  style={({ pressed }) => [
                    pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                  ]}
                  onPress={() => handlePressWithHaptics(() => onAnswerSelect(answer))}
                >
                  <Animated.View entering={FadeInUp.delay(index * 50).duration(200)}>
                    <XStack
                      backgroundColor={optionBg as any}
                      borderWidth={1.5}
                      borderColor={optionBorder as any}
                      paddingVertical={spacing.md}
                      paddingHorizontal={spacing.md}
                      borderRadius={radius.lg}
                      alignItems="center"
                      gap={spacing.md}
                    >
                      {/* Letter badge */}
                      <View
                        style={{
                          width: letterBadgeSize,
                          height: letterBadgeSize,
                          borderRadius: letterBadgeSize / 2,
                          backgroundColor: badgeBg,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text.Body fontFamily={FONT_FAMILIES.bold} color={badgeText}>
                          {letterLabels[index]}
                        </Text.Body>
                      </View>

                      {/* Answer text */}
                      <Text.Body flex={1} color={textColor}>
                        {answer}
                      </Text.Body>
                    </XStack>
                  </Animated.View>
                </Pressable>
              );
            })}
          </YStack>
        )}
      </YStack>

      {/* Navigation buttons */}
      <XStack
        paddingHorizontal={spacing.lg}
        paddingTop={spacing.xl}
        paddingBottom={spacing.xl}
        gap={spacing.md}
      >
        {/* Previous button */}
        <Pressable
          onPress={() => currentQuestionIndex > 0 && handlePressWithHaptics(onPrevQuestion)}
          disabled={currentQuestionIndex === 0}
          role="button"
          aria-label={t('a11y_previousButton')}
          style={({ pressed }) => [
            pressed && currentQuestionIndex > 0 && { opacity: 0.8, transform: [{ scale: 0.98 }] },
          ]}
        >
          <XStack
            backgroundColor={primaryColor}
            height={media.buttonHeight}
            paddingHorizontal={spacing.lg}
            borderRadius={radius.lg}
            justifyContent="center"
            alignItems="center"
            opacity={currentQuestionIndex > 0 ? 1 : 0.4}
          >
            <ChevronLeft size={iconSizes.lg} color="#FFFFFF" />
          </XStack>
        </Pressable>

        {/* Next button */}
        <Pressable
          onPress={() => !isLoadingResults && handlePressWithHaptics(onNextQuestion)}
          disabled={isLoadingResults}
          role="button"
          aria-label={t('a11y_nextButton')}
          style={({ pressed }) => [
            { flex: 1 },
            pressed && !isLoadingResults && { opacity: 0.8, transform: [{ scale: 0.98 }] },
          ]}
        >
          <XStack
            backgroundColor={primaryColor}
            height={media.buttonHeight}
            borderRadius={radius.lg}
            justifyContent="center"
            alignItems="center"
            gap={spacing.sm}
            opacity={isLoadingResults ? 0.8 : 1}
          >
            {isLoadingResults ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text.Body color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                  {currentQuestionIndex + 1 >= totalQuestions ? t('seeResults') : t('nextQuestion')}
                </Text.Body>
                <ChevronRight size={typography.fontSize.title} color="#FFFFFF" />
              </>
            )}
          </XStack>
        </Pressable>
      </XStack>
    </View>
  );
}
