import { HOME_FEED } from '../config/app';

import {
  getDailyFeedCache,
  getLatestFacts,
  getOnThisDayFacts,
  getThisWeekInHistoryFacts,
  setDailyFeedCache,
} from './database';
import { cacheFactImages } from './images';

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
 * Latest Facts are shown in the home screen carousel.
 * Checks the daily cache first; fetches from DB only for sections that are missing.
 * If no exact-date historical facts exist, falls back to ±3 days ("This Week in History").
 * Sections are locked for the rest of the day.
 *
 * @param forceRefresh - bypass cache and re-fetch from DB (used after preference changes)
 */
export async function loadDailyFeedSections(
  locale: string,
  forceRefresh = false
): Promise<DailyFeedSections> {
  if (__DEV__)
    console.log(
      `📋 [DailyFeed] loadDailyFeedSections called: locale="${locale}", forceRefresh=${forceRefresh}`
    );

  // Return in-memory cache if valid (same day + locale, not force-refreshing)
  const today = new Date().toISOString().split('T')[0];
  if (!forceRefresh && _memoryCache && _memoryCache.date === today && _memoryCache.locale === locale) {
    if (__DEV__) console.log('📋 [DailyFeed] Returning in-memory cache (no DB hit)');
    return _memoryCache.sections;
  }

  let freshCached: FactWithRelations[] = [];
  let onThisDayCached: FactWithRelations[] = [];

  // Always load on_this_day from cache so it stays locked for the day.
  // forceRefresh only forces latest facts to re-fetch (preference changes
  // clear the whole cache, so on_this_day still re-rolls when needed).
  onThisDayCached = await getDailyFeedCache('on_this_day', locale);

  if (!forceRefresh) {
    freshCached = await getDailyFeedCache('fresh_facts', locale);
  }

  if (__DEV__)
    console.log(
      `📋 [DailyFeed] Cache: fresh=${freshCached.length}, onThisDay=${onThisDayCached.length}, forceRefresh=${forceRefresh}`
    );

  const needsFresh = freshCached.length === 0;
  const needsOnThisDay = onThisDayCached.length === 0;

  if (!needsFresh && !needsOnThisDay) {
    const sections: DailyFeedSections = {
      freshFacts: freshCached,
      onThisDay: onThisDayCached,
      onThisDayIsWeekFallback: isWeekFallback(onThisDayCached),
    };
    _memoryCache = { date: today, locale, sections };
    return sections;
  }

  // Fetch latest facts
  let freshFacts = freshCached;
  if (needsFresh) {
    if (__DEV__)
      console.log(
        `📋 [DailyFeed] Fetching latest facts: locale="${locale}", limit=${HOME_FEED.LATEST_COUNT}`
      );
    const freshFetched = await getLatestFacts(HOME_FEED.LATEST_COUNT, locale);
    if (__DEV__) console.log(`📋 [DailyFeed] getLatestFacts returned ${freshFetched.length} facts`);
    if (freshFetched.length > 0) {
      await setDailyFeedCache(
        'fresh_facts',
        freshFetched.map((f) => f.id)
      );
      freshFacts = freshFetched;
    }
  }

  // Fetch on this day facts
  let onThisDay = onThisDayCached;
  if (needsOnThisDay) {
    const onThisDayFetched = await getOnThisDayFacts(locale);
    if (onThisDayFetched.length > 0) {
      await setDailyFeedCache(
        'on_this_day',
        onThisDayFetched.map((f) => f.id)
      );
      onThisDay = onThisDayFetched;
    } else {
      // Fallback: try nearby dates (±3 days)
      const weekFacts = await getThisWeekInHistoryFacts(locale);
      if (weekFacts.length > 0) {
        await setDailyFeedCache(
          'on_this_day',
          weekFacts.map((f) => f.id)
        );
        onThisDay = weekFacts;
      }
    }
  }

  // Cache feed images in the background for offline reading
  cacheFactImages([...freshFacts, ...onThisDay]).catch(() => {});

  const sections: DailyFeedSections = {
    freshFacts,
    onThisDay,
    onThisDayIsWeekFallback: isWeekFallback(onThisDay),
  };

  // Store in memory cache
  _memoryCache = { date: today, locale, sections };

  return sections;
}
