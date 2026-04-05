import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView } from 'react-native';

import { View } from '@tamagui/core';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { Button, CategoryCard, ProgressIndicator, ScreenContainer, Text } from '../../src/components';
import { MINIMUM_CATEGORIES, SUBSCRIPTION } from '../../src/config/app';
import { useOnboarding, usePremium } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackOnboardingCategoriesSelected,
  trackOnboardingStart,
  trackScreenView,
} from '../../src/services/analytics';
import * as db from '../../src/services/database';
import { hexColors, useTheme } from '../../src/theme';
import { getLucideIcon } from '../../src/utils/iconMapper';
import { useResponsive } from '../../src/utils/useResponsive';

import type { SupportedLocale } from '../../src/i18n';

// These components now use inline props with useResponsive() for dynamic spacing

export default function Categories() {
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
  const [categories, setCategories] = useState<db.Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const { isPremium, restorePurchases } = usePremium();
  const { typography, config, iconSizes, spacing } = useResponsive();

  // Responsive sizing for tablets
  const numColumns = config.categoryColumns;
  const iconSize = iconSizes.xl;
  const labelFontSize = typography.fontSize.caption;

  // Track if we've already logged the onboarding start event
  const hasLoggedStart = useRef(false);

  // Enter animations
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(-30)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonTranslateY = useRef(new Animated.Value(30)).current;
  const categoryAnimations = useRef<Animated.Value[]>([]).current;
  const [enterAnimDone, setEnterAnimDone] = useState(false);

  // Run enter animations when categories are loaded
  useEffect(() => {
    if (!isLoading && categories.length > 0) {
      // Initialize category animations if not already done
      while (categoryAnimations.length < categories.length) {
        categoryAnimations.push(new Animated.Value(0));
      }

      // Start animations
      Animated.sequence([
        // Header animation
        Animated.parallel([
          Animated.timing(headerOpacity, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(headerTranslateY, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        // Grid fade in
        Animated.timing(gridOpacity, {
          toValue: 1,
          duration: 130,
          useNativeDriver: true,
        }),
        // Staggered category cards
        Animated.stagger(
          20,
          categoryAnimations.slice(0, categories.length).map((anim) =>
            Animated.spring(anim, {
              toValue: 1,
              tension: 60,
              friction: 8,
              useNativeDriver: true,
            })
          )
        ),
      ]).start(() => setEnterAnimDone(true));

      // Button animation (parallel with grid)
      Animated.parallel([
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 260,
          delay: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(buttonTranslateY, {
          toValue: 0,
          duration: 260,
          delay: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isLoading, categories.length]);

  // Auto-initialize with device locale if not already initialized
  // Language selection has been removed - we use device language settings
  useEffect(() => {
    if (!isInitialized && !isInitializing && !initializationError) {
      // Initialize with the current device locale
      initializeOnboarding(locale as SupportedLocale);
    }
  }, [isInitialized, isInitializing, initializationError, locale, initializeOnboarding]);

  // Track onboarding start and screen view when screen is initialized
  useEffect(() => {
    if (isInitialized && !hasLoggedStart.current) {
      hasLoggedStart.current = true;
      trackOnboardingStart(locale);
      trackScreenView(Screens.ONBOARDING_CATEGORIES);
    }
  }, [isInitialized, locale]);

  useEffect(() => {
    if (isInitialized) {
      loadCategories();
    }
  }, [isInitialized]);

  const loadCategories = async () => {
    try {
      const categoriesFromDb = await db.getAllCategories();
      setCategories(categoriesFromDb);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCategory = (slug: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(slug)) {
        return prev.filter((s) => s !== slug);
      }
      return [...prev, slug];
    });
  };

  const handleContinue = () => {
    // Track categories selected
    trackOnboardingCategoriesSelected(selectedCategories);

    // Start downloading facts in the background (non-blocking)
    downloadFacts(locale);

    // Navigate immediately to notifications
    router.push('/onboarding/notifications');
  };

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

  // Split categories into rows
  const rows: db.Category[][] = [];
  for (let i = 0; i < categories.length; i += numColumns) {
    rows.push(categories.slice(i, i + numColumns));
  }

  // Show loading while initializing or loading categories
  if (isInitializing || (!isInitialized && !initializationError) || isLoading) {
    return (
      <ScreenContainer>
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
          <Text.Body>{isInitializing ? t('settingUpApp') : t('loadingCategories')}</Text.Body>
        </YStack>
      </ScreenContainer>
    );
  }

  // Show error if initialization failed
  if (initializationError) {
    return (
      <ScreenContainer>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <YStack
          paddingHorizontal={spacing.lg}
          paddingTop={spacing.lg}
          gap={spacing.lg}
          flex={1}
          justifyContent="center"
          alignItems="center"
        >
          <Text.Body color="#FF6B6B" textAlign="center">
            {initializationError}
          </Text.Body>
          <Text.Body color="$textSecondary" textAlign="center">
            {t('checkInternetConnection')}
          </Text.Body>
          <Button onPress={() => initializeOnboarding(locale as SupportedLocale)}>
            {t('tryAgain')}
          </Button>
        </YStack>
      </ScreenContainer>
    );
  }

  // Get category index for animation
  const getCategoryIndex = (rowIndex: number, colIndex: number) => {
    return rowIndex * numColumns + colIndex;
  };

  return (
    <ScreenContainer>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <YStack paddingHorizontal={spacing.lg} paddingTop={spacing.lg} paddingBottom={spacing.sm} gap={spacing.md} flex={1}>
        <Animated.View
          style={{
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          }}
        >
          <ProgressIndicator
            currentStep={2}
            totalSteps={3}
            rightElement={
              <Pressable
                onPress={() => {
                  const allSelected = categories.length > 0 && selectedCategories.length === categories.length;
                  if (allSelected) {
                    setSelectedCategories([]);
                  } else {
                    setSelectedCategories(categories.map((c) => c.slug));
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text.Caption
                  color={theme === 'dark' ? hexColors.dark.neonCyan : hexColors.light.primary}
                  fontWeight="600"
                >
                  {categories.length > 0 && selectedCategories.length === categories.length
                    ? t('deselectAll')
                    : t('selectAll')}
                </Text.Caption>
              </Pressable>
            }
          />

          <YStack gap={spacing.sm} style={{ marginTop: spacing.xl }}>
            <Text.Headline>{t('whatInterestsYou')}</Text.Headline>
            <Text.Body color="$textSecondary">
              {t('categoryMinimumInfo', { min: MINIMUM_CATEGORIES })}
            </Text.Body>
          </YStack>
        </Animated.View>

        <Animated.View style={{ flex: 1, opacity: gridOpacity }}>
          <ScrollView showsVerticalScrollIndicator={false} overScrollMode="never">
            <View style={{ flex: 1, gap: spacing.md }}>
              {rows.map((row, rowIndex) => (
                <XStack key={`row-${rowIndex}`} gap={spacing.md} justifyContent="space-between">
                  {row.map((category, colIndex) => {
                    const catIndex = getCategoryIndex(rowIndex, colIndex);
                    const animValue = categoryAnimations[catIndex];

                    const card = (
                      <CategoryCard
                        icon={getLucideIcon(category.icon, iconSize)}
                        label={category.name}
                        colorHex={category.color_hex}
                        selected={selectedCategories.includes(category.slug)}
                        onPress={() => toggleCategory(category.slug)}
                        labelFontSize={labelFontSize}
                      />
                    );

                    if (enterAnimDone) {
                      return (
                        <View key={category.slug} style={{ flex: 1 }}>
                          {card}
                        </View>
                      );
                    }

                    return (
                      <Animated.View
                        key={category.slug}
                        style={{
                          flex: 1,
                          opacity: animValue || 1,
                          transform: [
                            {
                              scale: animValue
                                ? animValue.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.8, 1],
                                  })
                                : 1,
                            },
                            {
                              translateY: animValue
                                ? animValue.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [20, 0],
                                  })
                                : 0,
                            },
                          ],
                        }}
                      >
                        {card}
                      </Animated.View>
                    );
                  })}
                  {/* Add empty placeholders for the last row if needed */}
                  {row.length < numColumns && (
                    <>
                      {Array.from({ length: numColumns - row.length }).map((_, idx) => (
                        <View key={`placeholder-${idx}`} style={{ flex: 1 }} />
                      ))}
                    </>
                  )}
                </XStack>
              ))}
            </View>
            <View height={spacing.xl} />
          </ScrollView>
        </Animated.View>

        <Animated.View
          style={{
            opacity: buttonOpacity,
            transform: [{ translateY: buttonTranslateY }],
          }}
        >
          <YStack gap={spacing.md} alignItems="center">
            <Button
              onPress={handleContinue}
              disabled={selectedCategories.length < MINIMUM_CATEGORIES}
            >
              {t('continue')}
            </Button>
            {SUBSCRIPTION.ENABLED && !isPremium && (
              <Pressable
                onPress={handleRestorePurchases}
                disabled={isRestoring}
                hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text.Caption color="$textSecondary" textAlign="center">
                  {isRestoring ? t('loading') : t('paywallRestore')}
                </Text.Caption>
              </Pressable>
            )}
          </YStack>
        </Animated.View>
      </YStack>
    </ScreenContainer>
  );
}
