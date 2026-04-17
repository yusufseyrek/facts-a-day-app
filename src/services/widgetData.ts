/**
 * Widget Data Service
 *
 * Pushes the most recently added facts from the local DB to the native home
 * screen widgets (iOS WidgetKit / Android AppWidget).
 *
 * The widget shows the last N facts by `created_at`, independent of what the
 * home screen feed is rendering. Call `refreshWidgetData(locale)` after any
 * event that may have changed the set of latest facts — content syncs, app
 * foreground, language switch. Safe to call frequently; errors are swallowed.
 */

import { Appearance } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getCategoryNeonColor } from '../theme/glowStyles';

import { setWidgetData, reloadWidgets } from '../native/WidgetBridge';

import { getLatestFacts } from './database';
import { getIsPremium } from './premiumState';

import type { FactWithRelations } from './database';

const THEME_STORAGE_KEY = '@app_theme_mode';
const WIDGET_FACT_COUNT = 5;

// ============================================================================
// Types (must match WidgetFact in ios-widget/WidgetDataStore.swift and
// android-widget/WidgetDataStore.kt)
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
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function toWidgetFact(f: FactWithRelations, theme: 'light' | 'dark'): WidgetFact {
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
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Fetch the most recently added facts from the DB and push them to the
 * widgets. Triggers a widget reload so the new data appears within seconds.
 *
 * Call this after any event that may have added new facts to the DB, or any
 * event that changes how facts should render (theme, locale, premium).
 */
export async function refreshWidgetData(locale: string): Promise<void> {
  try {
    const facts = await getLatestFacts(WIDGET_FACT_COUNT, locale);
    if (facts.length === 0) return;

    const theme = await resolveTheme();
    const widgetFacts = facts
      .filter((f) => f.title || f.content)
      .map((f) => toWidgetFact(f, theme));
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
    if (__DEV__) console.error('refreshWidgetData failed:', error);
  }
}
