import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView } from 'react-native';

import { ChevronLeft } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { Button, FONT_FAMILIES, ScreenContainer, Text } from '../../src/components';
import { LAYOUT, SUBSCRIPTION } from '../../src/config/app';
import { deriveCategories, QUIZ_QUESTIONS } from '../../src/config/onboardingQuestions';
import { useOnboarding, usePremium } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackOnboardingCategoriesSelected,
  trackOnboardingQuizAnswer,
  trackOnboardingStart,
  trackScreenView,
} from '../../src/services/analytics';
import * as api from '../../src/services/api';
import * as db from '../../src/services/database';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { SupportedLocale } from '../../src/i18n';

// Delay between tapping an option and advancing, so the selection highlight
// is visible before the next question slides in.
const ADVANCE_DELAY_MS = 300;
const TRANSITION_OUT_MS = 160;
const TRANSITION_IN_MS = 220;

export default function Questions() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const {
    selectedCategories,
    setSelectedCategories,
    isInitialized,
    isInitializing,
    initializationError,
    initializeOnboarding,
    downloadFacts,
  } = useOnboarding();
  const { isPremium, restorePurchases } = usePremium();
  const { spacing, radius, typography, borderWidths, iconSizes } = useResponsive();

  const [categories, setCategories] = useState<db.Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [metadataFailed, setMetadataFailed] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    QUIZ_QUESTIONS.map(() => null)
  );
  // Set when the last answer lands; the effect below waits for the context to
  // reflect the derived categories before starting the download + navigating.
  const [quizComplete, setQuizComplete] = useState(false);
  const isTransitioning = useRef(false);

  // Question swap animation
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateX = useRef(new Animated.Value(40)).current;

  const hasLoggedStart = useRef(false);

  // Auto-initialize with device locale if not already initialized
  useEffect(() => {
    if (!isInitialized && !isInitializing && !initializationError) {
      initializeOnboarding(locale as SupportedLocale);
    }
  }, [isInitialized, isInitializing, initializationError, locale, initializeOnboarding]);

  // Track onboarding start and screen view when screen is initialized
  useEffect(() => {
    if (isInitialized && !hasLoggedStart.current) {
      hasLoggedStart.current = true;
      trackOnboardingStart(locale);
      trackScreenView(Screens.ONBOARDING_QUESTIONS);
    }
  }, [isInitialized, locale]);

  const loadCategories = async () => {
    setIsLoading(true);
    setMetadataFailed(false);
    try {
      const metadata = await api.getMetadata();
      setCategories(metadata.categories);
      // Without categories the quiz can't derive preferences; surface the
      // retry UI instead of letting the last answer dead-end.
      setMetadataFailed(metadata.categories.length === 0);
    } catch (error) {
      console.error('Error loading categories:', error);
      setMetadataFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isInitialized) {
      loadCategories();
    }
  }, [isInitialized]);

  // Animate the current question in whenever it changes (and on first load)
  useEffect(() => {
    if (isLoading) return;
    contentOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: TRANSITION_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(contentTranslateX, {
        toValue: 0,
        tension: 70,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isTransitioning.current = false;
    });
  }, [isLoading, questionIndex, contentOpacity, contentTranslateX]);

  const goToQuestion = (nextIndex: number, direction: 1 | -1) => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: TRANSITION_OUT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateX, {
        toValue: -40 * direction,
        duration: TRANSITION_OUT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      contentTranslateX.setValue(40 * direction);
      setQuestionIndex(nextIndex);
    });
  };

  const selectOption = (optionIndex: number) => {
    if (isTransitioning.current || quizComplete) return;

    const question = QUIZ_QUESTIONS[questionIndex];
    trackOnboardingQuizAnswer({
      questionKey: question.key,
      optionKey: question.options[optionIndex].key,
    });

    const nextAnswers = [...answers];
    nextAnswers[questionIndex] = optionIndex;
    setAnswers(nextAnswers);

    setTimeout(() => {
      if (questionIndex < QUIZ_QUESTIONS.length - 1) {
        goToQuestion(questionIndex + 1, 1);
      } else {
        finishQuiz(nextAnswers);
      }
    }, ADVANCE_DELAY_MS);
  };

  const finishQuiz = (finalAnswers: (number | null)[]) => {
    const derived = deriveCategories(finalAnswers, categories, isPremium);
    trackOnboardingCategoriesSelected(derived);
    setSelectedCategories(derived);
    setQuizComplete(true);
  };

  // Wait for the context to hold the derived categories (downloadFacts reads
  // them from context state), then kick off the download and move on.
  useEffect(() => {
    if (!quizComplete || selectedCategories.length === 0) return;
    setQuizComplete(false);

    // Start downloading facts in the background (non-blocking)
    downloadFacts(locale);

    router.push('/onboarding/notifications');
  }, [quizComplete, selectedCategories, downloadFacts, locale, router]);

  const handleRestorePurchases = async () => {
    setIsRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        Alert.alert(t('settingsRestoreSuccess'), t('settingsRestoreSuccessMessage'));
      } else {
        Alert.alert(t('settingsRestoreNoSubscription'), t('settingsRestoreNoSubscriptionMessage'));
      }
    } catch (error) {
      console.error('Error restoring purchases:', error);
      Alert.alert(t('error'), t('settingsRestoreNoSubscriptionMessage'));
    } finally {
      setIsRestoring(false);
    }
  };

  // Show loading while initializing or loading categories
  if (isInitializing || (!isInitialized && !initializationError) || isLoading) {
    return (
      <ScreenContainer edges={['bottom', 'left', 'right']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <YStack
          paddingHorizontal={spacing.lg}
          paddingTop={spacing.lg}
          gap={spacing.xl}
          flex={1}
          justifyContent="center"
          alignItems="center"
        >
          <ActivityIndicator size="large" color={hexColors.light.primary} />
          <Text.Body>{t('settingUpApp')}</Text.Body>
        </YStack>
      </ScreenContainer>
    );
  }

  // Show error if initialization or the category metadata load failed
  if (initializationError || metadataFailed) {
    return (
      <ScreenContainer edges={['bottom', 'left', 'right']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <YStack
          paddingHorizontal={spacing.lg}
          paddingTop={spacing.lg}
          gap={spacing.lg}
          flex={1}
          justifyContent="center"
          alignItems="center"
        >
          {initializationError && (
            <Text.Body color="#FF6B6B" textAlign="center">
              {initializationError}
            </Text.Body>
          )}
          <Text.Body color="$textSecondary" textAlign="center">
            {t('checkInternetConnection')}
          </Text.Body>
          <Button
            onPress={() =>
              initializationError
                ? initializeOnboarding(locale as SupportedLocale)
                : loadCategories()
            }
          >
            {t('tryAgain')}
          </Button>
        </YStack>
      </ScreenContainer>
    );
  }

  const question = QUIZ_QUESTIONS[questionIndex];
  const selectedColor = theme === 'dark' ? hexColors.dark.neonCyan : hexColors.light.primary;

  return (
    <ScreenContainer edges={['bottom', 'left', 'right']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <YStack
        paddingHorizontal={spacing.lg}
        paddingTop={spacing.lg}
        paddingBottom={spacing.sm}
        gap={spacing.md}
        flex={1}
      >
        {/* Back to the previous question */}
        <XStack alignItems="center" height={iconSizes.lg} gap={spacing.sm}>
          {questionIndex > 0 && (
            <Pressable
              onPress={() => goToQuestion(questionIndex - 1, -1)}
              accessibilityRole="button"
              aria-label={t('goBack')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <ChevronLeft size={iconSizes.lg} color={hexColors[theme].text} />
            </Pressable>
          )}
        </XStack>

        <Animated.View
          style={{
            flex: 1,
            opacity: contentOpacity,
            transform: [{ translateX: contentTranslateX }],
          }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <YStack
              flex={1}
              gap={spacing.md}
              width="100%"
              maxWidth={LAYOUT.TABLET_BREAKPOINT}
              alignSelf="center"
            >
              <YStack gap={spacing.sm} paddingBottom={spacing.lg}>
                <Text.Caption color="$textSecondary" fontFamily={FONT_FAMILIES.semibold}>
                  {t('quizProgress', {
                    current: questionIndex + 1,
                    total: QUIZ_QUESTIONS.length,
                  })}
                </Text.Caption>
                <Text.Headline>{t(question.labelKey)}</Text.Headline>
              </YStack>

              <YStack gap={spacing.md}>
                {question.options.map((option, optionIndex) => {
                  const selected = answers[questionIndex] === optionIndex;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => selectOption(optionIndex)}
                      accessibilityRole="button"
                      aria-label={t(option.labelKey)}
                      style={({ pressed }) => ({
                        transform: [{ scale: pressed || selected ? 0.98 : 1 }],
                      })}
                    >
                      <XStack
                        alignItems="center"
                        gap={spacing.md}
                        padding={spacing.lg}
                        borderRadius={radius.lg}
                        borderWidth={borderWidths.heavy}
                        borderColor={selected ? selectedColor : '$border'}
                        backgroundColor={selected ? '$primaryLight' : '$surface'}
                      >
                        <Text.Title>{option.emoji}</Text.Title>
                        <Text.Body
                          flex={1}
                          fontFamily={FONT_FAMILIES.semibold}
                          fontSize={typography.fontSize.body * 1.05}
                        >
                          {t(option.labelKey)}
                        </Text.Body>
                      </XStack>
                    </Pressable>
                  );
                })}
              </YStack>
            </YStack>
          </ScrollView>
        </Animated.View>

        {SUBSCRIPTION.ENABLED && !isPremium && (
          <Pressable
            onPress={handleRestorePurchases}
            disabled={isRestoring}
            hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'center' })}
          >
            <Text.Caption color="$textSecondary" textAlign="center">
              {isRestoring ? t('loading') : t('paywallRestore')}
            </Text.Caption>
          </Pressable>
        )}
      </YStack>
    </ScreenContainer>
  );
}
