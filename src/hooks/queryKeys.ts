export const homeKeys = {
  all: ['home'] as const,
  dailyFeed: (locale: string) => ['home', 'dailyFeed', locale] as const,
  keepReading: (locale: string) => ['home', 'keepReading', locale] as const,
};

/**
 * Queries derived from LOCAL state (SQLite) — reading streak, stats, etc.
 * Deliberately NOT under a disk-persisted root: the source of truth is the
 * local DB, so we recompute on mount rather than risk showing a stale snapshot
 * restored from a second (AsyncStorage) cache. React Query's in-memory cache
 * still dedupes within a session; we just never persist these to disk.
 */
export const localStateKeys = {
  all: ['local'] as const,
  readingStreak: () => ['local', 'readingStreak'] as const,
};

/**
 * Keys for facts served on-demand from the API (the cursor feed + hydration
 * endpoints that replace the local facts mirror). React Query's cache is the
 * fact store now, so these back every fact-rendering surface.
 */
export const factKeys = {
  all: ['facts'] as const,
  feed: (locale: string, categories?: string) =>
    ['facts', 'feed', locale, categories ?? null] as const,
  onThisDay: (locale: string) => ['facts', 'onThisDay', locale] as const,
  byIds: (locale: string, ids: number[]) => ['facts', 'byIds', locale, ids.join(',')] as const,
  search: (locale: string, q: string, categories?: string) =>
    ['facts', 'search', locale, q, categories ?? null] as const,
  detail: (locale: string, id: number) => ['facts', 'detail', locale, id] as const,
  trivia: (mode: string, locale: string, slug?: string) =>
    ['facts', 'trivia', mode, locale, slug ?? null] as const,
};

/**
 * Reference metadata (categories, languages, content types). Near-static and
 * shared across screens, so it's cached with a long staleTime and persisted to
 * disk — Discover and others render category chips instantly without a network
 * round-trip after the first fetch.
 */
export const metadataKeys = {
  all: ['metadata'] as const,
  byLocale: (locale: string) => ['metadata', locale ?? 'default'] as const,
  // Story themes live under the persisted 'metadata' root so the event button
  // row paints instantly on a warm open, same as the category buttons.
  storyThemes: (locale: string) => ['metadata', 'storyThemes', locale] as const,
};

export const statsKeys = {
  all: ['stats'] as const,
};

/**
 * Server-backed trivia hub data. Availability (daily/mixed playable counts) is
 * stable enough to cache with a staleTime; it lives OUTSIDE the persisted roots
 * (facts/home/metadata) on purpose — we'd rather refetch on a cold open than
 * render a stale count from disk. The leaderboard is intentionally NOT cached
 * here: it's live, so it revalidates on every read via the shared ETag layer
 * (a cheap 304 when unchanged) instead of a staleTime window.
 */
export const triviaKeys = {
  all: ['trivia'] as const,
  availability: (locale: string) => ['trivia', 'availability', locale] as const,
};
