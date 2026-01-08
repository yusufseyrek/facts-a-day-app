import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, View, ActivityIndicator, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { YStack, XStack } from 'tamagui';
import { X, Timer, ChevronRight, ChevronLeft } from '@tamagui/lucide-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { 
  FadeInUp,
  SlideInRight,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { hexColors, spacing, radius, media } from '../../theme';
import { Text, FONT_FAMILIES } from '../Typography';
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
}: TriviaGameViewProps) {
  const insets = useSafeAreaInsets();
  const { isTablet, media, typography: typo, iconSizes } = useResponsive();
  
  // Colors
  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;
  const surfaceColor = isDark ? hexColors.dark.surface : hexColors.light.surface;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;

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
        paddingHorizontal={spacing.phone.lg}
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
          testID="trivia-game-exit-button"
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Exit"
        >
          <X size={iconSizes.lg} color={textColor} />
        </Pressable>
        
        {/* Trivia Mode Title - Centered */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            paddingBottom: spacing.phone.xs,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text.Label 
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
            numberOfLines={1}
          >
            {triviaTitle}
          </Text.Label>
        </View>
        
        {/* Timer */}
        <XStack 
          backgroundColor={surfaceColor}
          paddingHorizontal={spacing.phone.md}
          paddingVertical={spacing.phone.sm}
          borderRadius={radius.phone.full}
          alignItems="center"
          gap={spacing.phone.sm}
          zIndex={1}
        >
          <Timer size={typo.fontSize.title} color={timeRemaining < 30 ? errorColor : primaryColor} />
          <Text.Label 
            fontFamily={FONT_FAMILIES.bold}
            color={timeRemaining < 30 ? errorColor : textColor}
          >
            {formatTime(timeRemaining)}
          </Text.Label>
        </XStack>
      </XStack>
      
      {/* Progress section */}
      <YStack 
        paddingHorizontal={spacing.phone.lg} 
        paddingTop={spacing.phone.lg}
        gap={spacing.phone.sm}
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Text.Body color={secondaryTextColor}>
            <Text.Label fontFamily={FONT_FAMILIES.bold} color={textColor}>
              {t('question') || 'Question'} {currentQuestionIndex + 1}
            </Text.Label>
            /{totalQuestions}
          </Text.Body>
          {currentQuestion.fact?.categoryData && (
            <Text.Caption 
              fontFamily={FONT_FAMILIES.semibold}
              color={currentQuestion.fact.categoryData.color_hex}
            >
              {currentQuestion.fact.categoryData.name}
            </Text.Caption>
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
      
      {/* Question - scrollable for long content */}
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ 
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: spacing.phone.xl,
          paddingVertical: spacing.phone.lg,
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
            fontSize={typo.fontSize.display}
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
            textAlign="center"
            lineHeight={typo.lineHeight.display}
          >
            {currentQuestion.question_text}
          </Text.Title>
        </Animated.View>
      </ScrollView>
      
      {/* Answers */}
        <YStack paddingHorizontal={spacing.phone.lg} gap={spacing.phone.md}>
          {isTrueFalse ? (
            // True/False - side by side radio style
            <XStack gap={spacing.phone.md}>
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
                        paddingVertical={spacing.phone.lg}
                        borderRadius={radius.phone.lg}
                        alignItems="center"
                        justifyContent="center"
                        gap={spacing.phone.sm}
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
                        <Text.Label
                          fontFamily={FONT_FAMILIES.semibold}
                          color={textColor}
                        >
                          {getDisplayAnswer(answer)}
                        </Text.Label>
                      </YStack>
                    </Animated.View>
                  </Pressable>
                );
              })}
            </XStack>
          ) : (
            // Multiple choice - list with letter badges
            <YStack gap={spacing.phone.sm}>
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
                        paddingVertical={spacing.phone.md}
                        paddingHorizontal={spacing.phone.md}
                        borderRadius={radius.phone.lg}
                        alignItems="center"
                        gap={spacing.phone.md}
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
                          <Text.Label
                            fontFamily={FONT_FAMILIES.bold}
                            color={badgeText}
                          >
                            {letterLabels[index]}
                          </Text.Label>
                        </View>
                        
                        {/* Answer text */}
                        <Text.Body
                          flex={1}
                          color={textColor}
                        >
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
        paddingHorizontal={spacing.phone.lg} 
        paddingTop={spacing.phone.xl}
        paddingBottom={spacing.phone.xl}
        gap={spacing.phone.md}
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
            height={media.buttonHeight}
            paddingHorizontal={spacing.phone.lg}
            borderRadius={radius.phone.lg}
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
          style={({ pressed }) => [
            { flex: 1 },
            pressed && !isLoadingResults && { opacity: 0.8, transform: [{ scale: 0.98 }] }
          ]}
        >
          <XStack
            backgroundColor={primaryColor}
            height={media.buttonHeight}
            borderRadius={radius.phone.lg}
            justifyContent="center"
            alignItems="center"
            gap={spacing.phone.sm}
            opacity={isLoadingResults ? 0.8 : 1}
          >
            {isLoadingResults ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text.Label 
                  color="#FFFFFF" 
                  fontFamily={FONT_FAMILIES.semibold}
                >
                  {currentQuestionIndex + 1 >= totalQuestions 
                    ? t('seeResults') 
                    : t('nextQuestion')}
                </Text.Label>
                <ChevronRight size={typo.fontSize.title} color="#FFFFFF" />
              </>
            )}
          </XStack>
        </Pressable>
      </XStack>
    </View>
  );
}

