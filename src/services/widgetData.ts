/**
 * Widget Data Service
 *
 * Mirrors the latest facts from the API feed into the native home-screen
 * widgets (iOS WidgetKit / Android AppWidget) by writing a JSON payload to
 * shared storage via the WidgetBridge.
 *
 * Two entry points, both headless-safe (no SQLite import) so they can run from
 * the OS background feed task as well as the foreground:
 *  - refreshWidgetData(locale): fetch the latest facts, then push.
 *  - pushWidgetFacts(facts, locale): push facts the caller already fetched
 *    (e.g. the background feed task) with no extra network round-trip.
 *
 * The widget shows the last WIDGET_FACT_COUNT facts by `created_at`. Safe to
 * call frequently; errors are swallowed.
 */

import { Appearance } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { reloadWidgets, setWidgetData } from '../native/WidgetBridge';
import { getCategoryNeonColor } from '../theme/glowStyles';
import { getContrastColor } from '../utils/colors';

import { getFactsFeed } from './api';
import { getIsPremium } from './premiumState';

import type { FactResponse } from './api';

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
  /** Black or white — whichever is readable on `categoryColor`. */
  categoryTextColor: string;
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

function toWidgetFact(f: FactResponse, theme: 'light' | 'dark'): WidgetFact {
  const categorySlug = f.category || 'general';
  // Prefer the API-provided category color; fall back to the theme-based neon
  // palette for categories that don't yet have a color set server-side.
  const categoryColor = f.category_color_hex || getCategoryNeonColor(categorySlug, theme);
  return {
    id: f.id,
    title: f.title || f.content.substring(0, 200),
    categorySlug,
    categoryName: f.category_name || categorySlug,
    categoryColor,
    categoryTextColor: getContrastColor(categoryColor),
    deepLink: `factsaday://fact/${f.id}`,
    imageUrl: f.image_url,
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build the widget payload from raw API facts and write it to shared storage,
 * then trigger a widget reload so the new data appears within seconds. Uses the
 * newest WIDGET_FACT_COUNT usable facts (caller passes them newest-first).
 */
async function buildAndPush(facts: FactResponse[], locale: string): Promise<void> {
  const usable = facts.filter((f) => f.title || f.content).slice(0, WIDGET_FACT_COUNT);
  if (usable.length === 0) return;

  const theme = await resolveTheme();
  const widgetFacts = usable.map((f) => toWidgetFact(f, theme));

  const payload: WidgetFactData = {
    facts: widgetFacts,
    updatedAt: new Date().toISOString(),
    theme,
    locale,
    isPremium: getIsPremium(),
  };

  await setWidgetData(JSON.stringify(payload));
  await reloadWidgets();
}

/**
 * Fetch the most recent facts from the API feed and push them to the widgets.
 * Use on foreground / cold start. Safe to call frequently; errors are swallowed.
 */
export async function refreshWidgetData(locale: string): Promise<void> {
  try {
    const page = await getFactsFeed({ language: locale, limit: WIDGET_FACT_COUNT });
    await buildAndPush(page.facts, locale);
  } catch (error) {
    if (__DEV__) console.error('refreshWidgetData failed:', error);
  }
}

/**
 * Push facts the caller has already fetched (e.g. the OS background feed task)
 * into the widgets with no extra network round-trip. Errors are swallowed.
 */
export async function pushWidgetFacts(facts: FactResponse[], locale: string): Promise<void> {
  try {
    await buildAndPush(facts, locale);
  } catch (error) {
    if (__DEV__) console.error('pushWidgetFacts failed:', error);
  }
}
