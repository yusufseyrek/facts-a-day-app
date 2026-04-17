/**
 * Widget Data Service
 *
 * Prepares and writes fact data to shared storage for consumption by
 * native home screen widgets (iOS WidgetKit / Android AppWidget).
 *
 * Call updateWidgetData() after daily feed loads, background syncs,
 * or preference changes (language, theme, premium status).
 */

import { Appearance } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getCategoryNeonColor } from '../theme/glowStyles';

import { setWidgetData, reloadWidgets } from '../native/WidgetBridge';

import { getIsPremium } from './premiumState';

import type { FactWithRelations } from './database';

const THEME_STORAGE_KEY = '@app_theme_mode';
const WIDGET_FACT_COUNT = 5;

// ============================================================================
// Types
// ============================================================================

interface WidgetFact {
  id: number;
  title: string;
  categorySlug: string;
  categoryName: string;
  categoryColor: string;
  deepLink: string;
  imageUrl?: string;
}

interface WidgetFactData {
  facts: WidgetFact[];
  updatedAt: string;
  theme: 'light' | 'dark';
  locale: string;
  isPremium: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

async function resolveTheme(): Promise<'light' | 'dark'> {
  const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
  if (savedMode === 'light' || savedMode === 'dark') return savedMode;
  // "system" or null → use device appearance
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function factsToWidgetFacts(
  facts: FactWithRelations[],
  theme: 'light' | 'dark'
): WidgetFact[] {
  return facts
    .filter((f) => f.title || f.content)
    .slice(0, WIDGET_FACT_COUNT)
    .map((f) => {
      const categorySlug = f.categoryData?.slug || f.category || 'general';
      return {
        id: f.id,
        title: f.title || f.content.substring(0, 200),
        categorySlug,
        categoryName: f.categoryData?.name || categorySlug,
        categoryColor: getCategoryNeonColor(categorySlug, theme),
        deepLink: `factsaday://fact/${f.id}`,
        imageUrl: f.image_url,
      };
    });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Prepare widget data from daily feed facts and push to native widgets.
 * Picks up to 5 facts, resolves theme/premium, writes to shared storage,
 * and triggers a widget timeline reload.
 *
 * Safe to call frequently — errors are caught and logged without throwing.
 */
export async function updateWidgetData(
  facts: FactWithRelations[],
  locale: string
): Promise<void> {
  try {
    if (facts.length === 0) return;

    const theme = await resolveTheme();
    const widgetFacts = factsToWidgetFacts(facts, theme);
    if (widgetFacts.length === 0) return;

    const payload: WidgetFactData = {
      facts: widgetFacts,
      updatedAt: new Date().toISOString(),
      theme,
      locale,
      isPremium: getIsPremium(),
    };

    await setWidgetData(JSON.stringify(payload));
    await reloadWidgets();
  } catch (error) {
    if (__DEV__) console.error('updateWidgetData failed:', error);
  }
}
