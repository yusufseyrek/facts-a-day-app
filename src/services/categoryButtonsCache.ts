import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Session + disk cache for the home screen's category story-button row, so
 * the row renders the previous state immediately on remount instead of
 * flashing a skeleton while the async load (AsyncStorage -> metadata) runs.
 * Keyed by locale because the `name` field is localized.
 *
 * Lives in a service (not the component) so resetOnboarding can clear it:
 * a stale cached row from a previous onboarding run must not survive into
 * the next one, where it can shadow the freshly selected categories.
 */

export interface CachedCategoryItem {
  slug: string;
  name: string;
  icon?: string;
  color_hex?: string;
  isMix?: boolean;
}

export type CachedCategoryRow = {
  items: CachedCategoryItem[];
  unseenStatus: Record<string, boolean>;
};

const CACHE_KEY_PREFIX = '@category_buttons_cache_v1_';
const memCache = new Map<string, CachedCategoryRow>();
const hydrationByLocale = new Map<string, Promise<CachedCategoryRow | null>>();

export function getCachedRowSync(locale: string): CachedCategoryRow | null {
  return memCache.get(locale) ?? null;
}

export function setCachedRow(locale: string, data: CachedCategoryRow): void {
  // Never cache a degraded row (empty, or only the Mix button). Persisting one
  // would make the buttons "disappear" on the next cold start until the live
  // load ran. Only real category buttons are worth caching.
  const hasRealCategories = data.items.some((it) => !it.isMix);
  if (!hasRealCategories) return;
  memCache.set(locale, data);
  AsyncStorage.setItem(CACHE_KEY_PREFIX + locale, JSON.stringify(data)).catch(() => {});
}

export function hydrateCachedRow(locale: string): Promise<CachedCategoryRow | null> {
  const existing = hydrationByLocale.get(locale);
  if (existing) return existing;
  const promise = (async () => {
    const fromMem = memCache.get(locale);
    if (fromMem) return fromMem;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY_PREFIX + locale);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedCategoryRow;
      memCache.set(locale, parsed);
      return parsed;
    } catch {
      return null;
    }
  })();
  hydrationByLocale.set(locale, promise);
  return promise;
}

/** Drop every locale's cached row (memory + disk). Called on onboarding reset. */
export async function clearCategoryButtonsCache(): Promise<void> {
  memCache.clear();
  hydrationByLocale.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_KEY_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {
    // Best-effort: a missed disk entry only means one extra stale paint, and
    // the membership check in the story row reloads past it.
  }
}
