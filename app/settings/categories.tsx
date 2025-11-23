import React, { useState, useEffect } from 'react';
import { ScrollView, ActivityIndicator, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, styled } from '@tamagui/core';
import { XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { tokens } from '../../src/theme/tokens';
import {
  H1,
  BodyText,
  Button,
  CategoryCard,
} from '../../src/components';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import * as db from '../../src/services/database';
import { getLucideIcon } from '../../src/utils/iconMapper';
import * as onboardingService from '../../src/services/onboarding';
import * as preferencesService from '../../src/services/preferences';

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: '$background',
});

const ContentContainer = styled(YStack, {
  padding: tokens.space.xl,
  gap: tokens.space.xl,
  flex: 1,
});

const HeaderContainer = styled(YStack, {
  gap: tokens.space.md,
});

const HeaderRow = styled(XStack, {
  alignItems: 'center',
  gap: tokens.space.md,
});

const HeaderText = styled(YStack, {
  gap: tokens.space.sm,
  flex: 1,
});

const CategoriesGrid = styled(View, {
  flex: 1,
  gap: tokens.space.md,
});

const CategoryRow = styled(XStack, {
  gap: tokens.space.md,
  justifyContent: 'space-between',
});

const ButtonContainer = styled(View, {
  paddingTop: tokens.space.md,
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

  useEffect(() => {
    loadData();
  }, []);

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
        router.back();
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

  // Split categories into rows of 3
  const rows: db.Category[][] = [];
  for (let i = 0; i < categories.length; i += 3) {
    rows.push(categories.slice(i, i + 3));
  }

  if (isLoading) {
    return (
      <Container>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <ContentContainer justifyContent="center" alignItems="center">
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
          <BodyText>{t('loadingCategories')}</BodyText>
        </ContentContainer>
      </Container>
    );
  }

  return (
    <Container>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <ContentContainer>
        <HeaderContainer>
          <HeaderRow>
            <Pressable onPress={() => router.back()} style={{ padding: tokens.space.xs }}>
              <ArrowLeft size={24} color={theme === 'dark' ? '#FFFFFF' : tokens.color.light.text} />
            </Pressable>
            <HeaderText>
              <H1>{t('settingsCategories')}</H1>
            </HeaderText>
          </HeaderRow>
          <BodyText color="$textSecondary">
            {t('selectCategoriesMinimum')}
          </BodyText>
        </HeaderContainer>

        <ScrollView showsVerticalScrollIndicator={false}>
          <CategoriesGrid>
            {rows.map((row, rowIndex) => (
              <CategoryRow key={`row-${rowIndex}`}>
                {row.map((category) => (
                  <CategoryCard
                    key={category.slug}
                    icon={getLucideIcon(category.icon, 32)}
                    label={category.name}
                    selected={selectedCategories.includes(category.slug)}
                    onPress={() => toggleCategory(category.slug)}
                  />
                ))}
                {/* Add empty placeholders for the last row if needed */}
                {row.length < 3 && (
                  <>
                    {Array.from({ length: 3 - row.length }).map((_, idx) => (
                      <View key={`placeholder-${idx}`} style={{ flex: 1 }} />
                    ))}
                  </>
                )}
              </CategoryRow>
            ))}
          </CategoriesGrid>
          <View height={tokens.space.xl} />
        </ScrollView>

        <ButtonContainer>
          <Button
            onPress={handleSave}
            disabled={selectedCategories.length < 5 || isSaving}
            loading={isSaving}
          >
            {t('save')}
          </Button>
        </ButtonContainer>
      </ContentContainer>
    </Container>
  );
}
