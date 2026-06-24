import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import { HOME_FEED } from '../config/app';
import { queryClient } from '../config/queryClient';
import { factKeys, metadataKeys } from '../hooks/queryKeys';
import { getLocaleFromCode, SupportedLocale } from '../i18n';

import { type FeedRefreshSource, trackFeedRefresh } from './analytics';

/**
 * Cross-screen feed-refresh signaling + locale-change detection.
 *
 * The heavy background sync engine (full fact download into local SQLite, delta
 * sync, deletion sync, backfill, content migrations) was removed when the app
 * moved to fetching facts on demand from the API. What remains is the
 * lightweight event bus screens use to invalidate their React Query caches when
 * preferences/locale change, plus the stored-locale helpers used at startup.
 */

const STORED_LOCALE_KEY = '@stored_locale';

// ============================================================================
// Feed-refresh pending flag (preference changes → home re-fetch on focus)
// ============================================================================

export function markFeedRefreshPending(): void {
  // Signal that a preference change should refresh the feed. Consumed by screens
  // re-running their queries on focus; kept as the public signal callers use.
}

// ============================================================================
// Event listeners
// ============================================================================

type FeedRefreshListener = () => void;
const feedRefreshListeners: Set<FeedRefreshListener> = new Set();

// Status of the (now removed) background refresh. The overlay still renders from
// this type, but it is permanently 'idle' — there is no background sync to track.
export type RefreshStatus = 'idle' | 'refreshing' | 'locale-change';

export function onFeedRefresh(listener: FeedRefreshListener): () => void {
  feedRefreshListeners.add(listener);
  return () => {
    feedRefreshListeners.delete(listener);
  };
}

export function emitFeedRefresh(): void {
  feedRefreshListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Error in feed refresh listener:', error);
    }
  });
}

export function triggerFeedRefresh(): void {
  emitFeedRefresh();
}

// ============================================================================
// Home content refresh — the single entry point for refetching home content
// ============================================================================

/**
 * Re-validate everything the home screen renders: the shared fact feed, On This
 * Day, and the category / story-theme buttons. This is the ONE place that
 * decides when home content refetches — every automatic trigger (home becomes
 * visible, app returns to foreground) and the manual pull-to-refresh route
 * through here (see useHomeContentRefresh + the home screen).
 *
 * invalidateQueries does a silent background refetch: cached pages stay on
 * screen, no spinner, scroll untouched, and the ETag layer turns an unchanged
 * response into a cheap 304. Returns a promise that settles once the feed and
 * On This Day refetches finish, so pull-to-refresh can keep its spinner up.
 *
 * Automatic callers are gated by CONTENT_REFRESH_MIN_AGE_MS so rapid
 * back-navigation can't re-fetch every loaded page of the cursor feed each
 * time; pass { force: true } (pull-to-refresh) to bypass the gate.
 */
export function refreshHomeContent(
  locale: string,
  opts: { source: FeedRefreshSource; force?: boolean }
): Promise<void> {
  const feedKey = factKeys.feed(locale);

  if (!opts.force) {
    const feedState = queryClient.getQueryState(feedKey);
    const age = Date.now() - (feedState?.dataUpdatedAt ?? 0);
    if (feedState?.fetchStatus === 'fetching' || age < HOME_FEED.CONTENT_REFRESH_MIN_AGE_MS) {
      return Promise.resolve();
    }
  }

  trackFeedRefresh(opts.source);

  // Story themes ride a separate cache fetched imperatively by the button row
  // (not a useQuery observer), so invalidating only marks it stale — emitting
  // re-runs its loader, whose fetchQuery then sees the stale entry and hits the
  // network. Fire the emit alongside the feed invalidations.
  queryClient.invalidateQueries({ queryKey: metadataKeys.storyThemes(locale) });
  emitFeedRefresh();

  return Promise.all([
    queryClient.invalidateQueries({ queryKey: feedKey }),
    queryClient.invalidateQueries({ queryKey: factKeys.onThisDay(locale) }),
  ]).then(() => {});
}

// ============================================================================
// Locale detection (drives the one-time locale-change UX at startup)
// ============================================================================

function getDeviceLocale(): SupportedLocale {
  const deviceLanguage = Localization.getLocales()[0]?.languageCode || 'en';
  return getLocaleFromCode(deviceLanguage);
}

export async function getStoredLocale(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORED_LOCALE_KEY);
  } catch (error) {
    console.error('Error getting stored locale:', error);
    return null;
  }
}

export async function saveCurrentLocale(locale: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORED_LOCALE_KEY, locale);
  } catch (error) {
    console.error('Error saving current locale:', error);
  }
}

export async function hasLocaleChanged(): Promise<{
  changed: boolean;
  currentLocale: SupportedLocale;
  storedLocale: string | null;
}> {
  const currentLocale = getDeviceLocale();
  const storedLocale = await getStoredLocale();
  return {
    changed: storedLocale !== null && storedLocale !== currentLocale,
    currentLocale,
    storedLocale,
  };
}
