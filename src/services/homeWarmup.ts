import { Image } from 'expo-image';

import { queryClient } from '../config/queryClient';
import { onThisDayQueryOptions } from '../hooks/useHomeFeed';
import { homeFeedQueryOptions } from '../hooks/useHomeFeedData';

import { getMetadata } from './api';

/**
 * Pre-renders the home screen's world while the user is looking at something
 * else (the onboarding success animation): fetches every query the home screen
 * reads on mount into the shared React Query cache, then warms the images of
 * the first visible cards into expo-image's disk cache. When the home screen
 * mounts afterwards, its first commit renders full content — no skeleton
 * phase, no image pop-in above the fold.
 *
 * Never rejects; on a dead network the home screen just falls back to its own
 * loading/empty states, exactly as without warming. Callers should still cap
 * how long they wait (Promise.race) so navigation can't be stranded.
 */

// What the first frame actually shows: the hero card plus the peek of the
// next, and the top of On This Day. Only these gate the caller's navigation.
const BLOCKING_LATEST_IMAGES = 3;
const BLOCKING_ON_THIS_DAY_IMAGES = 2;

// Just-below-the-fold images (rest of the Latest carousel, first Keep Reading
// thumbnails, more On This Day) warm in the background without blocking.
const BACKGROUND_LATEST_IMAGES = 12;
const BACKGROUND_ON_THIS_DAY_IMAGES = 4;

function imageUrlsOf(facts: Array<{ image_url?: string | null }>, count: number): string[] {
  return facts
    .slice(0, count)
    .map((fact) => fact.image_url)
    .filter((url): url is string => !!url);
}

export async function warmUpHomeScreen(locale: string): Promise<void> {
  // The fetches go through the same query options the home hooks use, so they
  // populate exactly the cache entries the home screen will read. fetchQuery
  // respects staleTime — a re-run after a recent warm is a free cache hit.
  const [feed, onThisDay] = await Promise.all([
    queryClient.fetchInfiniteQuery(homeFeedQueryOptions(locale)).catch(() => null),
    queryClient.fetchQuery(onThisDayQueryOptions(locale)).catch(() => null),
    // Category story buttons (and Discover) read metadata through
    // getMetadata's own React Query caching; one call makes theirs instant.
    getMetadata(locale).catch(() => null),
  ]);

  const latestFacts = feed?.pages[0]?.facts ?? [];
  const onThisDayFacts = onThisDay
    ? onThisDay.exact.length > 0
      ? onThisDay.exact
      : onThisDay.week
    : [];

  const blockingUrls = [
    ...imageUrlsOf(latestFacts, BLOCKING_LATEST_IMAGES),
    ...imageUrlsOf(onThisDayFacts, BLOCKING_ON_THIS_DAY_IMAGES),
  ];
  const backgroundUrls = [
    ...imageUrlsOf(latestFacts.slice(BLOCKING_LATEST_IMAGES), BACKGROUND_LATEST_IMAGES),
    ...imageUrlsOf(onThisDayFacts.slice(BLOCKING_ON_THIS_DAY_IMAGES), BACKGROUND_ON_THIS_DAY_IMAGES),
  ];

  // 'disk' matches ImageFactCard's Android cachePolicy; on iOS the
  // memory-disk policy reads through to the same disk cache.
  if (backgroundUrls.length > 0) {
    Image.prefetch(backgroundUrls, { cachePolicy: 'disk' }).catch(() => false);
  }
  if (blockingUrls.length > 0) {
    await Image.prefetch(blockingUrls, { cachePolicy: 'disk' }).catch(() => false);
  }
}
