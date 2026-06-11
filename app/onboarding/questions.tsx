import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Check } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { Button, FONT_FAMILIES, GlassBackButton, ScreenContainer, Text } from '../../src/components';
import { LAYOUT } from '../../src/config/app';
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
import { darkenColor, getContrastColor } from '../../src/utils/colors';
import { getLucideIcon } from '../../src/utils/iconMapper';
import { useResponsive } from '../../src/utils/useResponsive';

import type { QuizOption } from '../../src/config/onboardingQuestions';
import type { SupportedLocale } from '../../src/i18n';

const TRANSITION_OUT_MS = 160;
const TRANSITION_IN_MS = 220;

/**
 * One selectable answer tile, in the app's gradient game-tile signature
 * (TriviaGridCard): diagonal accent gradient, decorative offset circles,
 * a Lucide icon on a translucent plate, accent-colored glow. Selection shows
 * a contrast ring plus a check badge — multiple tiles can be selected.
 */
function QuizOptionTile({
  option,
  label,
  selected,
  onToggle,
}: {
  option: QuizOption;
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const { spacing, radius, media, iconSizes } = useResponsive();

  const accentColor = option.color;
  const contrastColor = getContrastColor(accentColor);
  const plateSize = media.topicCardSize * 0.6;
  const plateBg = contrastColor === '#000000' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)';
  const checkSize = iconSizes.md + spacing.xs;

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      aria-label={label}
      style={({ pressed }) => [
        styles.tileShadow,
        {
          flex: 1,
          borderRadius: radius.xl,
          // Accent-colored glow instead of a flat black drop shadow — the
          // tiles read as lit, not boxed (same treatment as trivia/discover).
          shadowColor: accentColor,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <LinearGradient
        colors={[accentColor, darkenColor(accentColor, 0.22)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, borderRadius: radius.xl, overflow: 'hidden' }}
      >
        {/* Layered decorative circles for depth */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -plateSize * 0.6,
            right: -plateSize * 0.5,
            width: plateSize * 1.8,
            height: plateSize * 1.8,
            borderRadius: plateSize * 0.9,
            backgroundColor:
              contrastColor === '#000000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: -plateSize * 0.7,
            left: -plateSize * 0.4,
            width: plateSize * 1.4,
            height: plateSize * 1.4,
            borderRadius: plateSize * 0.7,
            backgroundColor:
              contrastColor === '#000000' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)',
          }}
        />

        <YStack padding={spacing.lg} gap={spacing.md} alignItems="center">
          {/* Icon plate */}
          <YStack
            width={plateSize}
            height={plateSize}
            borderRadius={plateSize / 2}
            backgroundColor={plateBg}
            justifyContent="center"
            alignItems="center"
          >
            {getLucideIcon(option.icon, plateSize * 0.5, contrastColor)}
          </YStack>

          <Text.Label
            fontFamily={FONT_FAMILIES.bold}
            color={contrastColor}
            numberOfLines={2}
            textAlign="center"
          >
            {label}
          </Text.Label>
        </YStack>

        {/* Selection ring */}
        {selected && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: radius.xl,
                borderWidth: 2.5,
                borderColor: contrastColor,
              },
            ]}
          />
        )}

        {/* Check badge (empty ring when unselected — signals multi-select) */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: spacing.sm,
            right: spacing.sm,
            width: checkSize,
            height: checkSize,
            borderRadius: checkSize / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? contrastColor : 'transparent',
            borderWidth: selected ? 0 : 1.5,
            borderColor:
              contrastColor === '#000000' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)',
          }}
        >
          {selected && <Check size={checkSize * 0.62} color={accentColor} strokeWidth={3} />}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

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
  const { isPremium } = usePremium();
  const { spacing } = useResponsive();

  const [categories, setCategories] = useState<db.Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [metadataFailed, setMetadataFailed] = useState(false);

  const [questionIndex, setQuestionIndex] = useState(0);
  // Selected option indexes per question (multi-select)
  const [answers, setAnswers] = useState<number[][]>(() => QUIZ_QUESTIONS.map(() => []));
  // Set when the last question is confirmed; the effect below waits for the
  // context to reflect the derived categories before starting the download +
  // navigating.
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

  const toggleOption = (optionIndex: number) => {
    if (isTransitioning.current || quizComplete) return;
    setAnswers((prev) => {
      const next = prev.map((selection) => [...selection]);
      const selection = next[questionIndex];
      const at = selection.indexOf(optionIndex);
      if (at >= 0) {
        selection.splice(at, 1);
      } else {
        selection.push(optionIndex);
      }
      return next;
    });
  };

  const handleBack = () => {
    if (quizComplete) return;
    if (questionIndex > 0) {
      goToQuestion(questionIndex - 1, -1);
    } else {
      router.back();
    }
  };

  const handleContinue = () => {
    if (isTransitioning.current || quizComplete) return;
    const question = QUIZ_QUESTIONS[questionIndex];
    const selection = answers[questionIndex];
    if (selection.length === 0) return;

    trackOnboardingQuizAnswer({
      questionKey: question.key,
      optionKey: selection.map((i) => question.options[i].key).join(','),
    });

    if (questionIndex < QUIZ_QUESTIONS.length - 1) {
      goToQuestion(questionIndex + 1, 1);
    } else {
      finishQuiz(answers);
    }
  };

  const finishQuiz = (selections: number[][]) => {
    const derived = deriveCategories(selections, categories, isPremium);
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
  const selection = answers[questionIndex];

  // Options in rows of two — the gradient tiles read as a game board.
  const optionRows: QuizOption[][] = [];
  for (let i = 0; i < question.options.length; i += 2) {
    optionRows.push(question.options.slice(i, i + 2));
  }

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
        <GlassBackButton onPress={handleBack} />

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
                <Text.Caption color="$textSecondary">{t('quizMultiHint')}</Text.Caption>
              </YStack>

              <YStack gap={spacing.md}>
                {optionRows.map((row, rowIndex) => (
                  <XStack key={`row-${rowIndex}`} gap={spacing.md} alignItems="stretch">
                    {row.map((option) => {
                      const optionIndex = question.options.indexOf(option);
                      return (
                        <QuizOptionTile
                          key={option.key}
                          option={option}
                          label={t(option.labelKey)}
                          selected={selection.includes(optionIndex)}
                          onToggle={() => toggleOption(optionIndex)}
                        />
                      );
                    })}
                  </XStack>
                ))}
              </YStack>
            </YStack>
          </ScrollView>
        </Animated.View>

        <YStack gap={spacing.md} alignItems="center">
          <Button onPress={handleContinue} disabled={selection.length === 0}>
            {t('continue')}
          </Button>
        </YStack>
      </YStack>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tileShadow: {
    // shadowColor is set per-tile (the accent color) at the call site.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});
