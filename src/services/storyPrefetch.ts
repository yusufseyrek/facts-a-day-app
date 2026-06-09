import * as api from './api';

import type { FactsFeedResponse } from './api';

/**
 * Lightweight in-memory prefetch cache for story feeds.
 *
 * Opening a story used to fire `api.getFactsFeed` only after the screen mounted,
 * so the first card waited on a full network round-trip. The story-button row is
 * visible well before a tap, so we warm the feed ahead of time (on row mount and
 * on press-in) and the story screen reads the result instantly when present.
 *
 * Keyed by `locale|categories` so a prefetch matches the exact request the
 * story screen makes. Entries expire after TTL so a returning user gets fresh
 * facts rather than a stale page.
 */

// One story page — must match STORY_FETCH_LIMIT in app/story/[category].tsx.
const STORY_FETCH_LIMIT = 100;
// How long a warmed feed stays usable before we re-fetch (ms).
const PREFETCH_TTL_MS = 60_000;

interface Entry {
  at: number;
  // The settled response, or null while the request is still in flight.
  data: FactsFeedResponse | null;
  promise: Promise<FactsFeedResponse | null>;
}

const cache = new Map<string, Entry>();

function keyFor(locale: string, categories: string): string {
  return `${locale}|${categories}`;
}

/**
 * Resolve the comma-separated `categories` param the story screen would use for
 * a given category slug. 'mix' expands to the user's selected categories; any
 * other slug is used as-is. Kept here so callers can prefetch with just a slug.
 */
function categoriesParam(category: string, selectedForMix: string[]): string {
  return category === 'mix' ? selectedForMix.join(',') : category;
}

/**
 * Warm the story feed for a category. Idempotent and deduped: concurrent calls
 * for the same key share one in-flight request, and a fresh cached entry is
 * reused. Errors are swallowed (best-effort) — the screen still fetches on miss.
 */
export function prefetchStory(
  locale: string,
  category: string,
  selectedForMix: string[]
): void {
  const categories = categoriesParam(category, selectedForMix);
  const key = keyFor(locale, categories);

  const existing = cache.get(key);
  if (existing && Date.now() - existing.at < PREFETCH_TTL_MS) {
    return; // fresh (or in-flight) — nothing to do
  }

  const entry: Entry = {
    at: Date.now(),
    data: null,
    promise: api
      .getFactsFeed({ language: locale, categories, limit: STORY_FETCH_LIMIT })
      .then((res) => {
        const cur = cache.get(key);
        if (cur) cur.data = res;
        return res;
      })
      .catch(() => {
        // Drop the failed entry so the next attempt retries instead of caching null.
        cache.delete(key);
        return null;
      }),
  };
  cache.set(key, entry);
}

/**
 * Consume a prefetched (or in-flight) story feed for the exact params the screen
 * uses. Returns the response if a usable entry exists (awaiting an in-flight
 * one), or null on miss/expiry so the caller fetches normally. The entry is
 * removed once taken so a later revisit re-warms rather than serving a stale page.
 */
export async function takePrefetchedStory(
  locale: string,
  categories: string
): Promise<FactsFeedResponse | null> {
  const key = keyFor(locale, categories);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at >= PREFETCH_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  return entry.data ?? (await entry.promise);
}
