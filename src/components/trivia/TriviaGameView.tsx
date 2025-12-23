import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { X, Timer, ChevronRight, ChevronLeft } from '@tamagui/lucide-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { 
  FadeInUp,
  SlideInRight,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import type { QuestionWithFact } from '../../services/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFunction = (key: any, params?: any) => string;

// Styled Text components
const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

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
  onAnswerSelect: (answer: string) => void;
  onNextQuestion: () => void;
  onPrevQuestion: () => void;
  onExit: () => void;
  isDark: boolean;
  t: TranslationFunction;
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
  onAnswerSelect,
  onNextQuestion,
  onPrevQuestion,
  onExit,
  isDark,
  t,
}: TriviaGameViewProps) {
  const insets = useSafeAreaInsets();
  
  // Colors
  const bgColor = isDark ? tokens.color.dark.background : tokens.color.light.background;
  const surfaceColor = isDark ? tokens.color.dark.surface : tokens.color.light.surface;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;
  const borderColor = isDark ? tokens.color.dark.border : tokens.color.light.border;
  const errorColor = isDark ? tokens.color.dark.error : tokens.color.light.error;

  const isTrueFalse = currentQuestion.question_type === 'true_false';
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
    <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Header */}
      <XStack 
        paddingHorizontal={tokens.space.lg}
        alignItems="center"
        justifyContent="space-between"
        position="relative"
      >
        <Pressable 
          onPress={() => handlePressWithHaptics(onExit)} 
          hitSlop={12} 
          style={({ pressed }) => [
            { zIndex: 1 },
            pressed && { opacity: 0.6 }
          ]}
        >
          <X size={24} color={textColor} />
        </Pressable>
        
        {/* Trivia Mode Title - Centered */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            paddingBottom: tokens.space.xs,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text 
            fontSize={16} 
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
            numberOfLines={1}
          >
            {triviaTitle}
          </Text>
        </View>
        
        {/* Timer */}
        <XStack 
          backgroundColor={surfaceColor}
          paddingHorizontal={tokens.space.md}
          paddingVertical={tokens.space.sm}
          borderRadius={tokens.radius.full}
          alignItems="center"
          gap={tokens.space.sm}
          zIndex={1}
        >
          <Timer size={18} color={timeRemaining < 30 ? errorColor : primaryColor} />
          <Text 
            fontSize={16} 
            fontFamily={FONT_FAMILIES.bold}
            color={timeRemaining < 30 ? errorColor : textColor}
          >
            {formatTime(timeRemaining)}
          </Text>
        </XStack>
      </XStack>
      
      {/* Progress section */}
      <YStack 
        paddingHorizontal={tokens.space.lg} 
        paddingTop={tokens.space.lg}
        gap={tokens.space.sm}
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize={15} color={secondaryTextColor}>
            <Text fontFamily={FONT_FAMILIES.bold} color={textColor}>
              {t('question') || 'Question'} {currentQuestionIndex + 1}
            </Text>
            /{totalQuestions}
          </Text>
          {currentQuestion.fact?.categoryData && (
            <Text 
              fontSize={14} 
              fontFamily={FONT_FAMILIES.semibold}
              color={currentQuestion.fact.categoryData.color_hex}
            >
              {currentQuestion.fact.categoryData.name}
            </Text>
          )}
        </XStack>
        
        {/* Progress bar */}
        <View 
          style={{ 
            height: 6, 
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
      
      {/* Question */}
      <YStack flex={1} justifyContent="center" alignItems="center" paddingHorizontal={tokens.space.xl} gap={tokens.space.lg}>
        <Animated.View 
          key={questionKey}
          entering={SlideInRight.duration(300)}
        >
          <Text
            fontSize={26}
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
            textAlign="center"
            lineHeight={36}
          >
            {currentQuestion.question_text}
          </Text>
        </Animated.View>
      </YStack>
      
      {/* Answers */}
      <YStack paddingHorizontal={tokens.space.lg} gap={tokens.space.md}>
        {isTrueFalse ? (
          // True/False - side by side radio style
          <XStack gap={tokens.space.md}>
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
                  style={({ pressed }) => [
                    { flex: 1 },
                    pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
                  ]}
                  onPress={() => handlePressWithHaptics(() => onAnswerSelect(answer))}
                >
                  <Animated.View entering={FadeInUp.delay(index * 50).duration(200)}>
                    <YStack
                      backgroundColor={optionBg as any}
                      borderWidth={2}
                      borderColor={optionBorder as any}
                      paddingVertical={tokens.space.lg}
                      borderRadius={tokens.radius.lg}
                      alignItems="center"
                      justifyContent="center"
                      gap={tokens.space.sm}
                    >
                      {/* Radio circle */}
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
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
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: '#FFFFFF',
                            }}
                          />
                        )}
                      </View>
                      <Text
                        fontSize={17}
                        fontFamily={FONT_FAMILIES.semibold}
                        color={textColor}
                      >
                        {getDisplayAnswer(answer)}
                      </Text>
                    </YStack>
                  </Animated.View>
                </Pressable>
              );
            })}
          </XStack>
        ) : (
          // Multiple choice - list with letter badges
          <YStack gap={tokens.space.sm}>
            {shuffledAnswers.map((answer, index) => {
              const isSelected = selectedAnswer === answer;
              
              let optionBg: string = surfaceColor;
              let optionBorder: string = borderColor;
              let badgeBg: string = isDark ? tokens.color.dark.border : tokens.color.light.border;
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
                  style={({ pressed }) => [
                    pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
                  ]}
                  onPress={() => handlePressWithHaptics(() => onAnswerSelect(answer))}
                >
                  <Animated.View entering={FadeInUp.delay(index * 50).duration(200)}>
                    <XStack
                      backgroundColor={optionBg as any}
                      borderWidth={1.5}
                      borderColor={optionBorder as any}
                      paddingVertical={tokens.space.md}
                      paddingHorizontal={tokens.space.md}
                      borderRadius={tokens.radius.lg}
                      alignItems="center"
                      gap={tokens.space.md}
                    >
                      {/* Letter badge */}
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: badgeBg,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          fontSize={16}
                          fontFamily={FONT_FAMILIES.bold}
                          color={badgeText}
                        >
                          {letterLabels[index]}
                        </Text>
                      </View>
                      
                      {/* Answer text */}
                      <Text
                        flex={1}
                        fontSize={16}
                        color={textColor}
                        numberOfLines={3}
                      >
                        {answer}
                      </Text>
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
        paddingHorizontal={tokens.space.lg} 
        paddingTop={tokens.space.xl}
        paddingBottom={tokens.space.xl}
        gap={tokens.space.md}
      >
        {/* Previous button */}
        <Pressable 
          onPress={() => currentQuestionIndex > 0 && handlePressWithHaptics(onPrevQuestion)}
          disabled={currentQuestionIndex === 0}
          style={({ pressed }) => [
            pressed && currentQuestionIndex > 0 && { opacity: 0.8, transform: [{ scale: 0.98 }] }
          ]}
        >
          <XStack
            backgroundColor={primaryColor}
            paddingVertical={tokens.space.lg}
            paddingHorizontal={tokens.space.lg}
            borderRadius={tokens.radius.lg}
            justifyContent="center"
            alignItems="center"
            opacity={currentQuestionIndex > 0 ? 1 : 0.4}
          >
            <ChevronLeft size={24} color="#FFFFFF" />
          </XStack>
        </Pressable>
        
        {/* Next button */}
        <Pressable 
          onPress={() => handlePressWithHaptics(onNextQuestion)}
          style={({ pressed }) => [
            { flex: 1 },
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
              {currentQuestionIndex + 1 >= totalQuestions 
                ? t('seeResults') 
                : t('nextQuestion')}
            </Text>
            <ChevronRight size={20} color="#FFFFFF" />
          </XStack>
        </Pressable>
      </XStack>
    </View>
  );
}

