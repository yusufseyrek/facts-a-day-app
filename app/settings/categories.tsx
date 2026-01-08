import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, ActivityIndicator, Alert, Pressable, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, styled } from '@tamagui/core';
import { XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { hexColors, spacing, radius } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';
import {
  Text,
  Button,
  CategoryCard,
  SuccessToast,
} from '../../src/components';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import * as db from '../../src/services/database';
import { getLucideIcon } from '../../src/utils/iconMapper';
import * as onboardingService from '../../src/services/onboarding';
import * as preferencesService from '../../src/services/preferences';
import { trackCategoriesUpdate, trackScreenView, Screens, updateCategoriesProperty } from '../../src/services/analytics';

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: '$background',
});

const ContentContainer = styled(YStack, {
  padding: spacing.phone.xl,
  gap: spacing.phone.xl,
  flex: 1,
});

const HeaderContainer = styled(YStack, {
  gap: spacing.phone.md,
});

const HeaderRow = styled(XStack, {
  alignItems: 'center',
  gap: spacing.phone.md,
});

const HeaderText = styled(YStack, {
  gap: spacing.phone.sm,
  flex: 1,
});

const CategoriesGrid = styled(View, {
  flex: 1,
  gap: spacing.phone.md,
});

const CategoryRow = styled(XStack, {
  gap: spacing.phone.md,
  justifyContent: 'space-between',
});

const ButtonContainer = styled(View, {
  paddingTop: spacing.phone.md,
});

export default function CategoriesSettings() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [initialCategories, setInitialCategories] = useState<string[]>([]);
  const [categories, setCategories] = useState<db.Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const { typography: typo, config, iconSizes } = useResponsive();

  // Responsive sizing for tablets
  const numColumns = config.categoryColumns;
  const iconSize = iconSizes.xl;
  const labelFontSize = typo.fontSize.caption;
  const secondaryFontSize = typo.fontSize.body;

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

  const toggleCategory = (slug: string) => {
    setSelectedCategories((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug]
    );
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
        const addedCount = selectedCategories.filter((cat) => !initialCategories.includes(cat)).length;
        const removedCount = initialCategories.filter((cat) => !selectedCategories.includes(cat)).length;
        trackCategoriesUpdate({
          count: selectedCategories.length,
          addedCount,
          removedCount,
        });
        updateCategoriesProperty(selectedCategories);

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
        <ContentContainer justifyContent="center" alignItems="center">
          <ActivityIndicator size="large" color={hexColors.light.primary} />
          <Text.Body>{t('loadingCategories')}</Text.Body>
        </ContentContainer>
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
      <ContentContainer>
        <Animated.View
          style={{
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          }}
        >
          <HeaderContainer>
            <HeaderRow>
              <Pressable onPress={() => router.back()} style={{ padding: spacing.phone.xs }}>
                <ArrowLeft size={iconSizes.lg} color={theme === 'dark' ? '#FFFFFF' : hexColors.light.text} />
              </Pressable>
              <HeaderText>
                <Text.Headline>{t('settingsCategories')}</Text.Headline>
              </HeaderText>
            </HeaderRow>
            <Text.Body color="$textSecondary" fontSize={secondaryFontSize}>
              {t('selectCategoriesMinimum')}
            </Text.Body>
          </HeaderContainer>
        </Animated.View>

        <Animated.View style={{ flex: 1, opacity: gridOpacity }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <CategoriesGrid>
              {rows.map((row, rowIndex) => (
                <CategoryRow key={`row-${rowIndex}`}>
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
                </CategoryRow>
              ))}
            </CategoriesGrid>
            <View height={spacing.phone.xl} />
          </ScrollView>
        </Animated.View>

        <Animated.View
          style={{
            opacity: buttonOpacity,
            transform: [{ translateY: buttonTranslateY }],
          }}
        >
          <ButtonContainer>
            <Button
              onPress={handleSave}
              disabled={selectedCategories.length < 5 || isSaving}
              loading={isSaving}
            >
              {isSaving ? t('saving') : t('save')}
            </Button>
          </ButtonContainer>
        </Animated.View>
      </ContentContainer>
    </Container>
  );
}
