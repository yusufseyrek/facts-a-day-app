import React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { LAYOUT, NATIVE_ADS } from '../../config/app';
import { useAdForSlot } from '../../hooks/useAdForSlot';
import { indexToAnswer, isTextAnswerCorrect } from '../../services/trivia';
import { hexColors } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { getLucideIcon } from '../../utils/iconMapper';
import {
  insertNativeAds,
  isNativeAdPlaceholder,
  pooledAdKey,
} from '../../utils/insertNativeAds';
import { absoluteFillObject } from '../../utils/styles';
import { useResponsive } from '../../utils/useResponsive';
import { BannerAd, NativeAdCard } from '../ads';
import { GlassSurface } from '../GlassSurface';
import { Calendar, Check, ChevronLeft, ChevronRight, Flame, Star, Timer, X, Zap } from '../icons';
import { XStack, YStack } from '../Stacks';
import { FONT_FAMILIES, Text } from '../Typography';

import type { QuestionWithFact, StoredAnswer } from '../../services/database';

const CARD_GAP = 12;

type TranslationFunction = (key: any, params?: any) => string;

/**
 * Native ad card sized to match the question cards in the horizontal results
 * scroll. Returns `null` (the cell collapses) until its pooled slot has a bound
 * ad, so a no-fill leaves no blank gap and the snap interval stays consistent.
 */
function TriviaAdCard({
  slotKey,
  cardWidth,
  cardHeight,
}: {
  slotKey: string;
  cardWidth: number;
  cardHeight?: number;
}) {
  // SQUARE creatives are requested only for the home feed (square cards); other
  // surfaces request LANDSCAPE, which has broader fill.
  const { ad } = useAdForSlot(slotKey, NativeMediaAspectRatio.LANDSCAPE);
  if (!ad) return null;
  return (
    <View style={{ width: cardWidth }}>
      <NativeAdCard
        nativeAd={ad}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        aspectRatio={NativeMediaAspectRatio.LANDSCAPE}
      />
    </View>
  );
}

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
  // Hide time and streak stat cards (e.g. for quick quiz)
  hideTimeAndStreak?: boolean;
  /**
   * Live game only: the round was finished faster than the leaderboard's
   * plausibility floor, so the server won't rank it. Shows an inline notice.
   * Left unset for history/review (those aren't fresh submissions).
   */
  tooFastForLeaderboard?: boolean;
  /**
   * Rendered below a visible native stack header (history/performance keep
   * their header and retitle it for results). Skips the self-managed status
   * bar inset — the header already occupies the top.
   */
  underNavigationHeader?: boolean;
  /**
   * Render the in-results banner ad (pinned at the bottom). Default true so the
   * component is self-contained. Hosts that already provide a banner around it
   * pass false: the game route (game.tsx) keeps ONE banner mounted across the
   * game→results transition, and the in-tabs history/performance screens sit
   * under the persistent tab-bar banner. Either way a second banner here would
   * stack/duplicate. When false the host also owns the bottom safe-area inset.
   */
  showBanner?: boolean;
  /**
   * Extra bottom padding for the scrollable content, so it clears a banner the
   * host floats OVER the results rather than laying it out below — i.e. the
   * persistent tab-bar banner in history/performance. Defaults to 0, where the
   * banner is a normal layout sibling and the flow already reserves its space.
   */
  contentBottomInset?: number;
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
  cardHeight,
  onCardLayout,
}: {
  questionIndex: number;
  isCorrect: boolean;
  isDark: boolean;
  t: TranslationFunction;
  cardWidth: number;
  cardHeight?: number;
  onCardLayout?: (height: number) => void;
}) {
  const { typography, spacing, radius, iconSizes } = useResponsive();
  const cardBackground = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const successColor = isDark ? hexColors.dark.success : hexColors.light.success;
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;
  const badgeSize = iconSizes.lg;

  return (
    <View
      style={{ width: cardWidth }}
      onLayout={
        onCardLayout && !cardHeight ? (e) => onCardLayout(e.nativeEvent.layout.height) : undefined
      }
    >
      <YStack
        backgroundColor={cardBackground}
        padding={spacing.lg}
        marginVertical={4}
        borderRadius={radius.xl}
        gap={spacing.md}
        minHeight={150}
        height={cardHeight}
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
  cardHeight,
  onCardLayout,
}: {
  question: QuestionWithFact;
  questionIndex: number;
  selectedAnswer: string | undefined;
  isCorrect: boolean;
  isDark: boolean;
  onPress?: () => void;
  t: TranslationFunction;
  cardWidth: number;
  cardHeight?: number;
  onCardLayout?: (height: number) => void;
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
      onLayout={
        onCardLayout && !cardHeight ? (e) => onCardLayout(e.nativeEvent.layout.height) : undefined
      }
    >
      <Animated.View style={animatedStyle}>
        <YStack
          backgroundColor={cardBackground}
          padding={spacing.lg}
          marginVertical={4}
          borderRadius={radius.xl}
          gap={spacing.md}
          minHeight={200}
          height={cardHeight}
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
  hideTimeAndStreak = false,
  underNavigationHeader = false,
  tooFastForLeaderboard = false,
  showBanner = true,
  contentBottomInset = 0,
}: TriviaResultsProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollViewRef = React.useRef<ScrollView>(null);
  const hasSnappedToBottom = React.useRef(false);

  const handleVerticalScroll = React.useCallback(() => {
    if (!hasSnappedToBottom.current) {
      hasSnappedToBottom.current = true;
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, []);

  const { screenWidth, isTablet, typography, config, iconSizes, spacing, radius, borderWidths, media } =
    useResponsive();
  const statsIconSize = media.topicCardSize * 0.55;
  const headerBtnSize = media.topicCardSize * 0.45;

  // Calculate card width based on content width (not screen width) for tablet max-width constraint
  const contentWidth = isTablet ? Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH) : screenWidth;
  const cardWidth = contentWidth * config.cardWidthMultiplier;

  // Horizontal inset so ScrollView cards align within content area (centers on tablets)
  const listInset = (screenWidth - contentWidth) / 2 + spacing.lg;

  // Card height synchronization - measure all cards and use the tallest height
  const totalCards = questions.length + unavailableQuestionIds.length;
  const [cardHeights, setCardHeights] = React.useState<Record<number, number>>({});

  const handleCardLayout = React.useCallback((cardId: number, height: number) => {
    setCardHeights((prev) => {
      if (prev[cardId] === height) return prev;
      return { ...prev, [cardId]: height };
    });
  }, []);

  const maxCardHeight = React.useMemo(() => {
    const heights = Object.values(cardHeights);
    if (heights.length < totalCards) return undefined;
    return Math.max(...heights);
  }, [cardHeights, totalCards]);

  type InsightItem =
    | { kind: 'question'; question: QuestionWithFact; index: number }
    | { kind: 'unavailable'; questionId: number; index: number }
    | { kind: 'ad'; key: string };

  const insightItems = React.useMemo<InsightItem[]>(() => {
    const base: InsightItem[] = [
      ...questions.map((q, i) => ({ kind: 'question' as const, question: q, index: i })),
      ...unavailableQuestionIds.map((id, i) => ({
        kind: 'unavailable' as const,
        questionId: id,
        index: questions.length + i,
      })),
    ];
    // Interleave a bounded pool of native ad cards. insertNativeAds returns
    // `base` unchanged for premium / ads-off sessions.
    return insertNativeAds(base, {
      firstAdIndex: NATIVE_ADS.FEED.TRIVIA_RESULTS.firstAdIndex,
      interval: NATIVE_ADS.FEED.TRIVIA_RESULTS.interval,
      getAdKey: pooledAdKey(
        NATIVE_ADS.FEED.TRIVIA_RESULTS.keyPrefix,
        NATIVE_ADS.FEED.TRIVIA_RESULTS.poolSize
      ),
    }).map((it) => (isNativeAdPlaceholder(it) ? { kind: 'ad' as const, key: it.key } : it));
  }, [questions, unavailableQuestionIds]);

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

  // iOS 26 Liquid Glass: stat cards go transparent and the card fill becomes the
  // glass tint; everywhere else they keep today's opaque cardBackground.
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

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

    // Live game: use unified correctness check
    return isTextAnswerCorrect(question, answer);
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

  // Collect distinct fact IDs from questions (preserving order of first appearance)
  const distinctFactIds = React.useMemo(() => {
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const question of questions) {
      if (question.fact?.id && !seen.has(question.fact.id)) {
        seen.add(question.fact.id);
        ids.push(question.fact.id);
      }
    }
    return ids;
  }, [questions]);

  // Handle opening fact detail - use Expo Router like rest of app
  const handleAnswerCardPress = (question: QuestionWithFact) => {
    if (question.fact?.id) {
      // Use the modal-presented fact route. TriviaResults renders inside the
      // trivia game (a fullScreenModal) as well as on card screens; on iOS a
      // `card` pushed over a full-screen modal can land behind it, so the modal
      // variant is the safe choice from every host (modal-over-card is fine).
      if (distinctFactIds.length > 1) {
        const currentIndex = distinctFactIds.indexOf(question.fact.id);
        router.push(
          `/fact/modal/${question.fact.id}?source=trivia_review&factIds=${JSON.stringify(distinctFactIds)}&currentIndex=${currentIndex}`
        );
      } else {
        // Single fact or all cards point to same fact - no navigation controls
        router.push(`/fact/modal/${question.fact.id}?source=trivia_review`);
      }
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: bgColor,
        // Under a visible native header, the header owns the top inset.
        paddingTop: underNavigationHeader ? 0 : insets.top,
      }}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Screen Header (when viewing past results) — borderless, glass back
          chip, matching the native glass headers on the other trivia screens */}
      {showBackButton && (
        <XStack
          paddingTop={spacing.sm}
          paddingBottom={spacing.md}
          paddingHorizontal={spacing.lg}
          alignItems="center"
          justifyContent="space-between"
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
                backgroundColor: useGlass ? 'transparent' : `${primaryColor}20`,
                overflow: useGlass ? 'hidden' : undefined,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {useGlass && (
                <GlassSurface
                  variant="glass"
                  isDark={isDark}
                  tint={`${primaryColor}20`}
                  glassTint={hexToRgba(primaryColor, isDark ? 0.35 : 0.3)}
                  borderRadius={headerBtnSize / 2}
                  style={absoluteFillObject}
                />
              )}
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

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        onScrollEndDrag={handleVerticalScroll}
        // Under the translucent native header (history/performance) iOS must
        // inset the content below the header bar — without this the results
        // render behind the screen title. Post-game there is no header and the
        // root View already pads for the status bar, so 'never' keeps that
        // layout untouched.
        contentInsetAdjustmentBehavior={underNavigationHeader ? 'automatic' : 'never'}
        contentContainerStyle={{ paddingBottom: contentBottomInset }}
      >
        <YStack width="100%" alignItems="center">
          <YStack
            width="100%"
            maxWidth={isTablet ? LAYOUT.MAX_CONTENT_WIDTH : undefined}
            paddingHorizontal={isTablet ? spacing.md : undefined}
          >
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

                {/* Only show the in-content title when there's no header
                    already carrying it — neither the local header bar nor a
                    retitled native stack header (history/performance). */}
                {!showBackButton && !underNavigationHeader && (
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
                    <Star
                      size={typography.fontSize.caption}
                      color={primaryColor}
                      fill={primaryColor}
                    />
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

            {/* Too-fast notice — the server won't rank a round finished under
                the plausibility floor, so tell the player it didn't count
                (their local stats still saved). */}
            {tooFastForLeaderboard && (
              <Animated.View entering={FadeInDown.delay(50).duration(400)}>
                <XStack
                  marginHorizontal={spacing.xl}
                  marginTop={spacing.md}
                  padding={spacing.md}
                  gap={spacing.sm}
                  alignItems="center"
                  borderRadius={radius.lg}
                  borderWidth={borderWidths.hairline}
                  backgroundColor={hexToRgba(accentColor, isDark ? 0.15 : 0.1)}
                  borderColor={hexToRgba(accentColor, isDark ? 0.4 : 0.25)}
                >
                  <View
                    style={{
                      width: statsIconSize * 0.7,
                      height: statsIconSize * 0.7,
                      borderRadius: (statsIconSize * 0.7) / 2,
                      backgroundColor: hexToRgba(accentColor, isDark ? 0.22 : 0.16),
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Zap size={iconSizes.md} color={accentColor} />
                  </View>
                  <YStack flex={1} gap={2}>
                    <Text.Label fontFamily={FONT_FAMILIES.bold} color={textColor}>
                      {t('leaderboardTooFastTitle') || 'Not added to the leaderboard'}
                    </Text.Label>
                    <Text.Caption color={secondaryTextColor}>
                      {t('leaderboardTooFastBody') ||
                        'This round was finished too quickly to count toward rankings. Your score and streak are still saved.'}
                    </Text.Caption>
                  </YStack>
                </XStack>
              </Animated.View>
            )}

            {/* Stats Cards */}
            {!hideTimeAndStreak && (
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
                    backgroundColor={useGlass ? 'transparent' : cardBackground}
                    paddingVertical={spacing.lg}
                    paddingHorizontal={spacing.md}
                    borderRadius={radius.lg}
                    alignItems="center"
                    gap={spacing.xs}
                    overflow={useGlass ? 'hidden' : undefined}
                    borderWidth={useGlass ? 1 : 0}
                    borderColor={borderColor}
                  >
                    {useGlass && (
                      <GlassSurface
                        variant="glass"
                        isDark={isDark}
                        tint={cardBackground}
                        glassTint={hexToRgba(cardBackground, isDark ? 0.6 : 0.65)}
                        borderRadius={radius.lg}
                        style={absoluteFillObject}
                      />
                    )}
                    <View
                      style={{
                        width: statsIconSize,
                        height: statsIconSize,
                        borderRadius: statsIconSize / 2,
                        backgroundColor: isDark
                          ? 'rgba(0, 163, 204, 0.15)'
                          : 'rgba(0, 119, 168, 0.1)',
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
                    backgroundColor={useGlass ? 'transparent' : cardBackground}
                    paddingVertical={spacing.lg}
                    paddingHorizontal={spacing.md}
                    borderRadius={radius.lg}
                    alignItems="center"
                    gap={spacing.xs}
                    overflow={useGlass ? 'hidden' : undefined}
                    borderWidth={useGlass ? 1 : 0}
                    borderColor={borderColor}
                  >
                    {useGlass && (
                      <GlassSurface
                        variant="glass"
                        isDark={isDark}
                        tint={cardBackground}
                        glassTint={hexToRgba(cardBackground, isDark ? 0.6 : 0.65)}
                        borderRadius={radius.lg}
                        style={absoluteFillObject}
                      />
                    )}
                    <View
                      style={{
                        width: statsIconSize,
                        height: statsIconSize,
                        borderRadius: statsIconSize / 2,
                        backgroundColor: isDark
                          ? 'rgba(255, 140, 0, 0.15)'
                          : 'rgba(204, 85, 0, 0.1)',
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
            )}

            {/* Divider */}
            <View
              style={{
                marginHorizontal: spacing.lg,
                height: 1,
                marginTop: spacing.md,
                backgroundColor: borderColor,
              }}
            />
          </YStack>
        </YStack>

        {/* Question Insights Section — full width for horizontal scroll, centered via listInset */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <YStack paddingTop={spacing.xl} paddingBottom={spacing.sm} gap={spacing.md}>
            <Text.Title
              fontFamily={FONT_FAMILIES.bold}
              color={textColor}
              paddingHorizontal={listInset}
            >
              {t('questionInsights') || 'Question Insights'}
            </Text.Title>

            {/* Horizontal scrolling cards */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              overScrollMode="never"
              contentContainerStyle={{
                paddingHorizontal: listInset,
                gap: CARD_GAP,
              }}
              decelerationRate="fast"
              snapToInterval={cardWidth + CARD_GAP}
              snapToAlignment="start"
            >
              {insightItems.map((item) => {
                if (item.kind === 'ad') {
                  // Defer until the question cards have measured, so the ad
                  // mounts at their synced height instead of the default and
                  // never jumps when maxCardHeight resolves.
                  if (maxCardHeight == null) return null;
                  return (
                    <TriviaAdCard
                      key={item.key}
                      slotKey={item.key}
                      cardWidth={cardWidth}
                      cardHeight={maxCardHeight}
                    />
                  );
                }

                if (item.kind === 'unavailable') {
                  const answer = answers[item.questionId];
                  const isCorrect = isStoredAnswer(answer) ? answer.correct : false;
                  return (
                    <UnavailableQuestionCard
                      key={`unavailable-${item.questionId}`}
                      questionIndex={item.index}
                      isCorrect={isCorrect}
                      isDark={isDark}
                      t={t}
                      cardWidth={cardWidth}
                      cardHeight={maxCardHeight}
                      onCardLayout={(h) => handleCardLayout(-item.questionId, h)}
                    />
                  );
                }

                const answer = answers[item.question.id];
                const selectedAnswerText = getSelectedAnswerText(item.question, answer);
                const isCorrect = checkIsCorrect(item.question, answer);
                return (
                  <AnswerReviewCard
                    key={item.question.id}
                    question={item.question}
                    questionIndex={item.index}
                    selectedAnswer={selectedAnswerText}
                    isCorrect={isCorrect}
                    isDark={isDark}
                    onPress={() => handleAnswerCardPress(item.question)}
                    t={t}
                    cardWidth={cardWidth}
                    cardHeight={maxCardHeight}
                    onCardLayout={(h) => handleCardLayout(item.question.id, h)}
                  />
                );
              })}
            </ScrollView>
          </YStack>
        </Animated.View>
      </ScrollView>

      <View
        style={{
          // When the host owns the banner (showBanner=false) it also owns the
          // bottom safe-area inset, so only the small gap above the return
          // button is needed here.
          paddingBottom: showReturnButton ? (showBanner ? insets.bottom : 0) + spacing.sm : 0,
        }}
      >
        {/* The banner only pads for the home indicator when it is the LAST
            element; with the return button below it, that padding would open
            a gap between the ad and the button. */}
        {showBanner && (
          <BannerAd respectBottomInset={!showReturnButton} placement="trivia_results" />
        )}

        {/* Return button (shown for normal trivia flow) */}
        {showReturnButton && (
          <YStack width="100%" alignItems="center">
            <YStack
              width="100%"
              maxWidth={isTablet ? LAYOUT.MAX_CONTENT_WIDTH : undefined}
              paddingHorizontal={spacing.lg}
              paddingTop={spacing.md}
              backgroundColor={bgColor as any}
            >
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
              >
                <XStack
                  backgroundColor={primaryColor}
                  height={media.buttonHeight}
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
          </YStack>
        )}
      </View>
    </View>
  );
}
