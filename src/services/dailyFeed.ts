import { HOME_FEED } from '../config/app';

import {
  getDailyFeedCache,
  getRandomUnscheduledFactsWithFallback,
  setDailyFeedCache,
} from './database';

import type { FactWithRelations } from './database';

export interface DailyFeedSections {
  popular: FactWithRelations[];
  worthKnowing: FactWithRelations[];
}

/**
 * Load Popular and Worth Knowing sections for the given locale.
 * Checks the daily cache first; fetches and persists with a single DB query
 * only for sections that are missing. Sections are locked for the rest of the day.
 */
export async function loadDailyFeedSections(locale: string): Promise<DailyFeedSections> {
  const [popularCached, worthKnowingCached] = await Promise.all([
    getDailyFeedCache('popular', locale),
    getDailyFeedCache('worth_knowing', locale),
  ]);

  const needsPopular = popularCached.length === 0;
  const needsWorthKnowing = worthKnowingCached.length === 0;

  if (!needsPopular && !needsWorthKnowing) {
    return { popular: popularCached, worthKnowing: worthKnowingCached };
  }

  const totalNeeded =
    (needsPopular ? HOME_FEED.POPULAR_COUNT : 0) +
    (needsWorthKnowing ? HOME_FEED.WORTH_KNOWING_COUNT : 0);

  const fetched = await getRandomUnscheduledFactsWithFallback(totalNeeded, locale);

  let offset = 0;
  let popular = popularCached;
  let worthKnowing = worthKnowingCached;

  if (needsPopular) {
    const slice = fetched.slice(offset, offset + HOME_FEED.POPULAR_COUNT);
    if (slice.length > 0) {
      await setDailyFeedCache('popular', slice.map((f) => f.id));
    }
    popular = slice;
    offset += HOME_FEED.POPULAR_COUNT;
  }

  if (needsWorthKnowing) {
    const slice = fetched.slice(offset, offset + HOME_FEED.WORTH_KNOWING_COUNT);
    if (slice.length > 0) {
      await setDailyFeedCache('worth_knowing', slice.map((f) => f.id));
    }
    worthKnowing = slice;
  }

  return { popular, worthKnowing };
}
