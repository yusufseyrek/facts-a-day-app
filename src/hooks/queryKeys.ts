export const homeKeys = {
  all: ['home'] as const,
  dailyFeed: (locale: string) => ['home', 'dailyFeed', locale] as const,
  keepReading: (locale: string) => ['home', 'keepReading', locale] as const,
  readingStreak: () => ['home', 'readingStreak'] as const,
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
  byIds: (locale: string, ids: number[]) =>
    ['facts', 'byIds', locale, ids.join(',')] as const,
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
};

export const statsKeys = {
  all: ['stats'] as const,
};
