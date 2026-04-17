import { HOME_FEED } from '../config/app';

import {
  getLatestFacts,
  getOnThisDayFacts,
  getThisWeekInHistoryFacts,
} from './database';
import { cacheFactImages } from './images';
import { updateWidgetData } from './widgetData';

import type { FactWithRelations } from './database';

export interface DailyFeedSections {
  freshFacts: FactWithRelations[];
  onThisDay: FactWithRelations[];
  /** true when onThisDay contains nearby-date facts instead of exact-date */
  onThisDayIsWeekFallback: boolean;
}

// ============================================
// IN-MEMORY FEED CACHE
// Avoids re-querying DB on every home screen focus.
// Keyed by date+locale, auto-invalidates on day change.
// ============================================
let _memoryCache: { date: string; locale: string; sections: DailyFeedSections } | null = null;

/** Invalidate in-memory feed cache (call after preference changes, content sync, etc.) */
export function invalidateFeedMemoryCache(): void {
  _memoryCache = null;
}

/**
 * Check if any of the facts match today's exact date.
 * If none match, it means the data came from the week fallback.
 */
function isWeekFallback(facts: FactWithRelations[]): boolean {
  if (facts.length === 0) return false;
  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  return !facts.some((f) => f.event_month === todayMonth && f.event_day === todayDay);
}

/**
 * Load Latest Facts and On This Day sections for the given locale.
 * Uses in-memory cache to avoid re-querying DB on every focus.
 * If no exact-date historical facts exist, falls back to ±3 days ("This Week in History").
 *
 * @param forceRefresh - bypass in-memory cache and re-fetch from DB
 */
export async function loadDailyFeedSections(
  locale: string,
  forceRefresh = false
): Promise<DailyFeedSections> {
  // Return in-memory cache if valid (same day + locale, not force-refreshing)
  const today = new Date().toISOString().split('T')[0];
  if (!forceRefresh && _memoryCache && _memoryCache.date === today && _memoryCache.locale === locale) {
    return _memoryCache.sections;
  }

  // Fetch latest facts
  const freshFacts = await getLatestFacts(HOME_FEED.LATEST_COUNT, locale);

  // Fetch on this day facts (with week fallback)
  let onThisDay = await getOnThisDayFacts(locale);
  if (onThisDay.length === 0) {
    onThisDay = await getThisWeekInHistoryFacts(locale);
  }

  // Cache feed images in the background for offline reading
  cacheFactImages([...freshFacts, ...onThisDay]).catch(() => {});

  const sections: DailyFeedSections = {
    freshFacts,
    onThisDay,
    onThisDayIsWeekFallback: isWeekFallback(onThisDay),
  };

  _memoryCache = { date: today, locale, sections };

  // Push fresh facts to home screen widgets
  updateWidgetData([...freshFacts, ...onThisDay], locale).catch(() => {});

  return sections;
}
