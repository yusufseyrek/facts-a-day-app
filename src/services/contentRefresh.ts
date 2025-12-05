import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from './api';
import * as db from './database';
import * as onboardingService from './onboarding';
import * as preferencesService from './preferences';
import { getLocaleFromCode, SupportedLocale } from '../i18n';
import * as Localization from 'expo-localization';
import { showInterstitialAd } from '../components/ads/InterstitialAd';
import { ADS_ENABLED } from '../config/ads';

// AsyncStorage keys
const LAST_CONTENT_REFRESH_KEY = '@last_content_refresh';
const STORED_LOCALE_KEY = '@stored_locale';

// Minimum interval between refreshes (1 hour in milliseconds)
// Note: No longer used - app now refreshes on every open
const REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

// Event listeners for feed refresh
type FeedRefreshListener = () => void;
const feedRefreshListeners: Set<FeedRefreshListener> = new Set();

// Event listeners for background refresh status (loading indicator)
export type RefreshStatus = 'idle' | 'refreshing' | 'locale-change';
type RefreshStatusListener = (status: RefreshStatus) => void;
const refreshStatusListeners: Set<RefreshStatusListener> = new Set();

// Track current refresh status so new subscribers get the current state immediately
let currentRefreshStatus: RefreshStatus = 'idle';

/**
 * Subscribe to refresh status changes
 * Used to show loading indicators in the UI
 * Immediately emits current status to new subscribers
 */
export function onRefreshStatusChange(listener: RefreshStatusListener): () => void {
  refreshStatusListeners.add(listener);
  
  // Immediately emit current status to new subscriber
  // This ensures late subscribers (like home screen mounting after refresh started) get the current state
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

/**
 * Get current refresh status (for checking state without subscribing)
 */
export function getRefreshStatus(): RefreshStatus {
  return currentRefreshStatus;
}

/**
 * Emit refresh status change to all listeners
 */
function emitRefreshStatus(status: RefreshStatus): void {
  currentRefreshStatus = status;
  console.log(`📊 Refresh status: ${status}`);
  refreshStatusListeners.forEach((listener) => {
    try {
      listener(status);
    } catch (error) {
      console.error('Error in refresh status listener:', error);
    }
  });
}

/**
 * Subscribe to feed refresh events
 * Called when new or updated facts are written to the database
 */
export function onFeedRefresh(listener: FeedRefreshListener): () => void {
  feedRefreshListeners.add(listener);
  return () => {
    feedRefreshListeners.delete(listener);
  };
}

/**
 * Emit feed refresh event to all listeners
 */
function emitFeedRefresh(): void {
  feedRefreshListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Error in feed refresh listener:', error);
    }
  });
}

export interface RefreshResult {
  success: boolean;
  updated: {
    categories: number;
    facts: number;
  };
  error?: string;
}

/**
 * Check if content should be refreshed based on last refresh time
 * Returns true if more than 1 hour has passed since last refresh
 * Note: This function is kept for potential future use but is no longer
 * called by refreshAppContent() - app now refreshes on every open
 */
export async function shouldRefreshContent(): Promise<boolean> {
  try {
    const lastRefreshStr = await AsyncStorage.getItem(LAST_CONTENT_REFRESH_KEY);

    if (!lastRefreshStr) {
      // Never refreshed before
      return true;
    }

    const lastRefresh = new Date(lastRefreshStr);
    const now = new Date();
    const timeSinceRefresh = now.getTime() - lastRefresh.getTime();

    return timeSinceRefresh >= REFRESH_INTERVAL;
  } catch (error) {
    console.error('Error checking refresh status:', error);
    // If we can't check, assume we should refresh
    return true;
  }
}

/**
 * Update the last refresh timestamp
 */
async function updateLastRefreshTime(): Promise<void> {
  try {
    const now = new Date().toISOString();
    await AsyncStorage.setItem(LAST_CONTENT_REFRESH_KEY, now);
  } catch (error) {
    console.error('Error updating last refresh time:', error);
  }
}

/**
 * Get the current device locale from system settings.
 * This respects per-app language selection on iOS 13+ and Android 13+.
 */
function getDeviceLocale(): SupportedLocale {
  const deviceLanguage = Localization.getLocales()[0]?.languageCode || 'en';
  return getLocaleFromCode(deviceLanguage);
}

/**
 * Get the stored locale from AsyncStorage
 * Returns null if no locale has been stored yet
 */
async function getStoredLocale(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORED_LOCALE_KEY);
  } catch (error) {
    console.error('Error getting stored locale:', error);
    return null;
  }
}

/**
 * Save the current locale to AsyncStorage
 */
async function saveCurrentLocale(locale: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORED_LOCALE_KEY, locale);
    console.log(`📍 Stored locale saved: ${locale}`);
  } catch (error) {
    console.error('Error saving current locale:', error);
  }
}

/**
 * Check if the device locale has changed compared to the stored locale
 */
async function hasLocaleChanged(): Promise<{ changed: boolean; currentLocale: SupportedLocale; storedLocale: string | null }> {
  const currentLocale = getDeviceLocale();
  const storedLocale = await getStoredLocale();
  
  return {
    changed: storedLocale !== null && storedLocale !== currentLocale,
    currentLocale,
    storedLocale,
  };
}

/**
 * Get the most recent fact update timestamp from database
 * Used to fetch only new or updated facts from API
 */
async function getLastFactUpdatedAt(): Promise<string | null> {
  try {
    const database = await db.openDatabase();
    const result = await database.getFirstAsync<{ max_last_updated: string | null }>(
      'SELECT MAX(last_updated) as max_last_updated FROM facts'
    );
    return result?.max_last_updated || null;
  } catch (error) {
    console.error('Error getting last fact timestamp:', error);
    return null;
  }
}

/**
 * Get existing fact IDs from database
 * Used to determine which facts are new vs updated
 */
async function getExistingFactIds(factIds: number[]): Promise<number[]> {
  if (factIds.length === 0) {
    return [];
  }

  try {
    const database = await db.openDatabase();
    // Create placeholders for IN clause
    const placeholders = factIds.map(() => '?').join(',');
    const result = await database.getAllAsync<{ id: number }>(
      `SELECT id FROM facts WHERE id IN (${placeholders})`,
      factIds
    );
    return result.map((row) => row.id);
  } catch (error) {
    console.error('Error getting existing fact IDs:', error);
    return [];
  }
}

/**
 * Refresh app content from API: metadata and new facts
 * This runs every time the app opens (no time interval restriction)
 * Runs in the background and doesn't block app startup
 * Silently fails if offline or network issues occur
 * 
 * On initial load, checks if locale has changed compared to DB.
 * If locale changed: triggers full refresh (fetch all facts, insert/update)
 * and shows an interstitial ad
 */
export async function refreshAppContent(): Promise<RefreshResult> {
  const result: RefreshResult = {
    success: false,
    updated: {
      categories: 0,
      facts: 0,
    },
  };

  try {
    console.log('🔄 Starting background content refresh...');

    // Check if locale has changed since last app open
    const localeStatus = await hasLocaleChanged();
    const currentLocale = localeStatus.currentLocale;
    
    if (localeStatus.changed) {
      // Locale has changed - trigger full refresh with new language
      console.log(`🌍 Locale changed from "${localeStatus.storedLocale}" to "${currentLocale}" - triggering full refresh...`);
      
      // Emit locale-change status for UI loading indicator
      emitRefreshStatus('locale-change');
      
      // Show interstitial ad in parallel with language update (don't block the refresh)
      if (ADS_ENABLED) {
        console.log('📺 Showing interstitial ad for locale change (in parallel)...');
        // Fire and forget - don't await, let it run in parallel
        showInterstitialAd().catch((error) => {
          console.error('Error showing interstitial ad:', error);
        });
      }
      
      const languageChangeResult = await preferencesService.handleLanguageChange(currentLocale);
      
      if (languageChangeResult.success) {
        // Save the new locale after successful refresh
        await saveCurrentLocale(currentLocale);
        await updateLastRefreshTime();
        
        result.success = true;
        result.updated.facts = languageChangeResult.factsCount || 0;
        console.log(`✅ Locale change refresh completed: ${result.updated.facts} facts updated`);
      } else {
        console.error('❌ Locale change refresh failed:', languageChangeResult.error);
        result.error = languageChangeResult.error;
      }
      
      // Emit idle status when done
      emitRefreshStatus('idle');
      
      return result;
    }

    // No locale change - proceed with regular incremental refresh
    // Emit refreshing status for UI loading indicator
    emitRefreshStatus('refreshing');
    
    // Also save current locale if this is the first time (storedLocale is null)
    if (localeStatus.storedLocale === null) {
      await saveCurrentLocale(currentLocale);
      console.log(`📍 First app open - stored locale: ${currentLocale}`);
    }

    // Get current user preferences
    const categories = await onboardingService.getSelectedCategories();

    // Step 1: Fetch and update metadata (categories)
    const metadata = await api.getMetadata(currentLocale);

    await db.insertCategories(metadata.categories);
    result.updated.categories = metadata.categories.length;

    // Step 2: Fetch new or updated facts since last update
    const lastFactUpdatedAt = await getLastFactUpdatedAt();

    if (lastFactUpdatedAt) {
      // Fetch only new or updated facts using since_updated parameter
      const categoriesParam = categories.join(',');
      const response = await api.getFacts({
        language: currentLocale,
        categories: categoriesParam,
        since_updated: lastFactUpdatedAt,
        limit: 1000, // Reasonable limit for incremental fetch
      });

      if (response.facts.length > 0) {
        // Convert API facts to database format
        const dbFacts: db.Fact[] = response.facts.map((fact) => ({
          id: fact.id,
          title: fact.title,
          content: fact.content,
          summary: fact.summary,
          category: fact.category,
          source_url: fact.source_url,
          image_url: fact.image_url,
          language: fact.language,
          created_at: fact.created_at,
          last_updated: fact.last_updated,
        }));

        // Check which facts already exist in database
        const factIds = dbFacts.map((f) => f.id);
        const existingFactIds = await getExistingFactIds(factIds);
        const existingIdsSet = new Set(existingFactIds);

        // Separate new and updated facts
        const newFacts = dbFacts.filter((f) => !existingIdsSet.has(f.id));
        const updatedFacts = dbFacts.filter((f) => existingIdsSet.has(f.id));

        // Insert new or updated facts (INSERT OR REPLACE handles duplicates)
        await db.insertFacts(dbFacts);
        result.updated.facts = dbFacts.length;

        // Log new and updated facts separately with IDs
        if (newFacts.length > 0) {
          const newIds = newFacts.map((f) => f.id).join(', ');
          console.log(`✨ Fetched ${newFacts.length} new facts: [${newIds}]`);
        }
        if (updatedFacts.length > 0) {
          const updatedIds = updatedFacts.map((f) => f.id).join(', ');
          console.log(`🔄 Updated ${updatedFacts.length} facts: [${updatedIds}]`);
        }

        // Notify listeners to refresh the feed
        emitFeedRefresh();
      } else {
        console.log('✅ No new or updated facts available');
      }
    }

    // Update last refresh timestamp
    await updateLastRefreshTime();

    result.success = true;
    console.log('✅ Background content refresh completed successfully');

  } catch (error) {
    console.error('❌ Content refresh failed:', error);
    result.error = error instanceof Error ? error.message : 'Unknown error';

    // Don't throw - silently fail for offline scenarios
    // The app will continue using cached data
  } finally {
    // Always emit idle status when done (success or error)
    emitRefreshStatus('idle');
  }

  return result;
}

/**
 * Force refresh content regardless of last refresh time
 * Useful for manual refresh or settings changes
 */
export async function forceRefreshContent(): Promise<RefreshResult> {
  // Clear last refresh time to force refresh
  try {
    await AsyncStorage.removeItem(LAST_CONTENT_REFRESH_KEY);
  } catch (error) {
    console.error('Error clearing refresh timestamp:', error);
  }

  return refreshAppContent();
}
