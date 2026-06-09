import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import { getLocaleFromCode, SupportedLocale } from '../i18n';

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

let feedRefreshPending = false;

export function markFeedRefreshPending(): void {
  feedRefreshPending = true;
}

export function consumeFeedRefreshPending(): boolean {
  const was = feedRefreshPending;
  feedRefreshPending = false;
  return was;
}

// ============================================================================
// Event listeners
// ============================================================================

type FeedRefreshListener = () => void;
const feedRefreshListeners: Set<FeedRefreshListener> = new Set();

export type RefreshStatus = 'idle' | 'refreshing' | 'locale-change';
type RefreshStatusListener = (status: RefreshStatus) => void;
const refreshStatusListeners: Set<RefreshStatusListener> = new Set();

let currentRefreshStatus: RefreshStatus = 'idle';

/**
 * No background refresh runs anymore, so there's never an in-flight refresh to
 * wait on. Kept as a resolved no-op for callers that serialized DB writes
 * against the old sync.
 */
export async function waitForActiveRefresh(): Promise<void> {
  // no-op
}

export function onRefreshStatusChange(listener: RefreshStatusListener): () => void {
  refreshStatusListeners.add(listener);
  if (currentRefreshStatus !== 'idle') {
    try {
      listener(currentRefreshStatus);
    } catch (error) {
      console.error('Error in refresh status listener (initial emit):', error);
    }
  }
  return () => {
    refreshStatusListeners.delete(listener);
  };
}

export function getRefreshStatus(): RefreshStatus {
  return currentRefreshStatus;
}

/** Update + broadcast the refresh status (used by locale-change overlay). */
export function setRefreshStatus(status: RefreshStatus): void {
  currentRefreshStatus = status;
  refreshStatusListeners.forEach((listener) => {
    try {
      listener(status);
    } catch (error) {
      console.error('Error in refresh status listener:', error);
    }
  });
}

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
