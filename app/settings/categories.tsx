import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { styled, View } from '@tamagui/core';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { Button, CategoryCard, SuccessToast, Text } from '../../src/components';
import { CATEGORY_LIMITS } from '../../src/config/app';
import { usePremium } from '../../src/contexts';
import { showSettingsInterstitial } from '../../src/services/adManager';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackCategoriesUpdate,
  trackScreenView,
  updateCategoriesProperty,
} from '../../src/services/analytics';
import * as db from '../../src/services/database';
import * as onboardingService from '../../src/services/onboarding';
import * as preferencesService from '../../src/services/preferences';
import { hexColors, useTheme } from '../../src/theme';
import { getLucideIcon } from '../../src/utils/iconMapper';
import { useResponsive } from '../../src/utils/useResponsive';

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: '$background',
});

// Content styled components now use inline props with useResponsive() for dynamic spacing

export default function CategoriesSettings() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { isPremium } = usePremium();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [initialCategories, setInitialCategories] = useState<string[]>([]);
  const [categories, setCategories] = useState<db.Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const { typography, config, iconSizes, spacing } = useResponsive();

  // Responsive sizing for tablets
  const numColumns = config.categoryColumns;
  const iconSize = iconSizes.xl;
  const labelFontSize = typography.fontSize.caption;
  const secondaryFontSize = typography.fontSize.body;

  // Enter animations
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(-30)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonTranslateY = useRef(new Animated.Value(30)).current;
  const categoryAnimations = useRef<Animated.Value[]>([]).current;

  useEffect(() => {
    loadData();
    trackScreenView(Screens.SETTINGS_CATEGORIES);
  }, []);

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
      ]).start();

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

  const loadData = async () => {
    try {
      // Load categories from database
      const categoriesFromDb = await db.getAllCategories();
      setCategories(categoriesFromDb);

      // Load current selection from AsyncStorage
      const currentSelection = await onboardingService.getSelectedCategories();
      setSelectedCategories(currentSelection);
      setInitialCategories(currentSelection);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if categories have changed
  const hasChanges = () => {
    if (selectedCategories.length !== initialCategories.length) return true;
    const sortedSelected = [...selectedCategories].sort();
    const sortedInitial = [...initialCategories].sort();
    return !sortedSelected.every((cat, i) => cat === sortedInitial[i]);
  };

  // Get category limits based on premium status
  const categoryLimits = isPremium ? CATEGORY_LIMITS.PREMIUM : CATEGORY_LIMITS.FREE;

  const toggleCategory = (slug: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(slug)) {
        return prev.filter((s) => s !== slug);
      }
      // Enforce max limit for non-premium users
      if (prev.length >= categoryLimits.max) {
        return prev;
      }
      return [...prev, slug];
    });
  };

  const handleSave = async () => {
    // Check if categories have changed
    if (!hasChanges()) {
      console.log('No changes detected, navigating back without saving');
      router.back();
      return;
    }

    setIsSaving(true);
    try {
      // Show interstitial ad in parallel with save operations
      const adPromise = showSettingsInterstitial();

      // Save selected categories
      await onboardingService.setSelectedCategories(selectedCategories);

      // Trigger data refresh with progress tracking
      const result = await preferencesService.handleCategoriesChange(
        selectedCategories,
        locale,
        (progress) => {
          // Log progress (could show in UI later)
          console.log(`${progress.stage}: ${progress.percentage}% - ${progress.message}`);
        }
      );

      if (result.success) {
        console.log(`Successfully refreshed with ${result.factsCount} facts`);

        // Track categories update and update user property
        const addedCount = selectedCategories.filter(
          (cat) => !initialCategories.includes(cat)
        ).length;
        const removedCount = initialCategories.filter(
          (cat) => !selectedCategories.includes(cat)
        ).length;
        trackCategoriesUpdate({
          count: selectedCategories.length,
          addedCount,
          removedCount,
        });
        updateCategoriesProperty(selectedCategories);

        // Wait for ad to close before showing success toast (prevents view controller conflicts)
        await adPromise;

        // Show success toast
        setTimeout(() => {
          setShowSuccessToast(true);
        }, 100);
      } else {
        Alert.alert(t('error'), result.error || t('failedToUpdateCategories'));
        setIsSaving(false);
      }
    } catch (error) {
      console.error('Error saving categories:', error);
      Alert.alert(t('error'), t('failedToSaveCategories'));
      setIsSaving(false);
    }
  };

  const handleSuccessToastHide = () => {
    setShowSuccessToast(false);
    router.back();
  };

  // Split categories into rows
  const rows: db.Category[][] = [];
  for (let i = 0; i < categories.length; i += numColumns) {
    rows.push(categories.slice(i, i + numColumns));
  }

  if (isLoading) {
    return (
      <Container>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <YStack
          padding={spacing.xl}
          gap={spacing.xl}
          flex={1}
          justifyContent="center"
          alignItems="center"
        >
          <ActivityIndicator size="large" color={hexColors.light.primary} />
          <Text.Body>{t('loadingCategories')}</Text.Body>
        </YStack>
      </Container>
    );
  }

  // Get category index for animation
  const getCategoryIndex = (rowIndex: number, colIndex: number) => {
    return rowIndex * numColumns + colIndex;
  };

  return (
    <Container>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <SuccessToast
        visible={showSuccessToast}
        message={t('categoriesUpdated')}
        onHide={handleSuccessToastHide}
      />
      <YStack padding={spacing.xl} gap={spacing.xl} flex={1}>
        <Animated.View
          style={{
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          }}
        >
          <YStack gap={spacing.md}>
            <XStack alignItems="center" gap={spacing.md}>
              <Pressable onPress={() => router.back()} style={{ padding: spacing.xs }}>
                <ArrowLeft
                  size={iconSizes.lg}
                  color={theme === 'dark' ? '#FFFFFF' : hexColors.light.text}
                />
              </Pressable>
              <YStack gap={spacing.sm} flex={1}>
                <Text.Headline>{t('settingsCategories')}</Text.Headline>
              </YStack>
            </XStack>
            <Text.Body color="$textSecondary" fontSize={secondaryFontSize}>
              {isPremium
                ? t('categoryLimitPremium', { min: categoryLimits.min })
                : t('categoryLimitFree', { min: categoryLimits.min, max: categoryLimits.max })}
            </Text.Body>
          </YStack>
        </Animated.View>

        <Animated.View style={{ flex: 1, opacity: gridOpacity }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flex: 1, gap: spacing.md }}>
              {rows.map((row, rowIndex) => (
                <XStack key={`row-${rowIndex}`} gap={spacing.md} justifyContent="space-between">
                  {row.map((category, colIndex) => {
                    const catIndex = getCategoryIndex(rowIndex, colIndex);
                    const animValue = categoryAnimations[catIndex];

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
                        <CategoryCard
                          icon={getLucideIcon(category.icon, iconSize)}
                          label={category.name}
                          colorHex={category.color_hex}
                          selected={selectedCategories.includes(category.slug)}
                          onPress={() => toggleCategory(category.slug)}
                          labelFontSize={labelFontSize}
                          disabled={
                            !selectedCategories.includes(category.slug) &&
                            selectedCategories.length >= categoryLimits.max
                          }
                        />
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
          <View style={{ paddingTop: spacing.md }}>
            <Button
              onPress={handleSave}
              disabled={selectedCategories.length < categoryLimits.min || isSaving}
              loading={isSaving}
            >
              {isSaving ? t('saving') : t('save')}
            </Button>
          </View>
        </Animated.View>
      </YStack>
    </Container>
  );
}
