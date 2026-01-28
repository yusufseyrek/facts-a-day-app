import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  SharedValue,
  SlideInRight,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookOpen, ChevronLeft, ChevronRight, Lightbulb, Timer, X } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { hexColors } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

import type { QuestionWithFact } from '../../services/database';

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
  // Background image
  questionImageUri?: string | null;
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
  questionImageUri,
}: TriviaGameViewProps) {
  const insets = useSafeAreaInsets();
  const { borderWidths, media, typography, iconSizes, spacing, radius } = useResponsive();
  const radioSize = iconSizes.md;
  const letterBadgeSize = media.topicCardSize * 0.35;

  // Colors
  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;
  const surfaceColor = isDark ? hexColors.dark.surface : hexColors.light.surface;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;
  const accentColor = isDark ? hexColors.dark.accent : hexColors.light.accent;

  // When background image is present, always use white text over the dark overlay
  const questionTextColor = questionImageUri ? '#FFFFFF' : textColor;

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
      <View
        style={{
          flex: 1,
          overflow: 'hidden',
          borderRadius: questionImageUri ? radius.xl : 0,
          marginHorizontal: questionImageUri ? spacing.md : 0,
          marginVertical: questionImageUri ? spacing.sm : 0,
        }}
      >
        {/* Background image */}
        {questionImageUri && (
          <Image
            source={{ uri: questionImageUri }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            contentFit="cover"
            transition={250}
          />
        )}
        {/* Dark overlay for text readability */}
        {questionImageUri && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(10, 22, 40, 0.75)',
            }}
          />
        )}
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
              color={questionTextColor}
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
                    backgroundColor={`${primaryColor}25`}
                    paddingHorizontal={spacing.md}
                    paddingVertical={spacing.sm}
                    borderRadius={radius.full}
                    alignItems="center"
                    gap={spacing.xs}
                  >
                    <BookOpen size={typography.fontSize.caption} color={primaryColor} />
                    <RNText
                      style={{
                        fontFamily: FONT_FAMILIES.semibold,
                        fontSize: typography.fontSize.caption,
                        color: primaryColor,
                      }}
                    >
                      {t('viewFact') || 'View Fact'}
                    </RNText>
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
                  <View
                    style={{
                      flexDirection: 'row',
                      backgroundColor: canUseExplanation
                        ? `${accentColor}25`
                        : `${secondaryTextColor}10`,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radius.full,
                      alignItems: 'center',
                      gap: spacing.xs,
                      opacity: canUseExplanation ? 1 : 0.5,
                    }}
                  >
                    <Lightbulb
                      size={typography.fontSize.caption}
                      color={canUseExplanation ? accentColor : secondaryTextColor}
                    />
                    <RNText
                      style={{
                        fontFamily: FONT_FAMILIES.semibold,
                        fontSize: typography.fontSize.caption,
                        color: canUseExplanation ? accentColor : secondaryTextColor,
                      }}
                    >
                      {canUseExplanation
                        ? t('showHint') || 'Show Hint'
                        : t('hintUsedToday') || 'Hint used'}
                    </RNText>
                  </View>
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
                  backgroundColor={`${accentColor}20`}
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
                    color={questionTextColor}
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
      </View>

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
                      paddingVertical={spacing.md}
                      borderRadius={radius.md}
                      alignItems="center"
                      justifyContent="center"
                      gap={spacing.xs}
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
          <YStack gap={spacing.xs}>
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
                      paddingVertical={spacing.sm}
                      paddingHorizontal={spacing.md}
                      borderRadius={radius.md}
                      alignItems="center"
                      gap={spacing.sm}
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
                        <Text.Label fontFamily={FONT_FAMILIES.bold} color={badgeText}>
                          {letterLabels[index]}
                        </Text.Label>
                      </View>

                      {/* Answer text */}
                      <Text.Label
                        lineHeight={typography.lineHeight.label * 1.2}
                        flex={1}
                        color={textColor}
                      >
                        {answer}
                      </Text.Label>
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
        paddingTop={spacing.md}
        paddingBottom={spacing.lg}
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
