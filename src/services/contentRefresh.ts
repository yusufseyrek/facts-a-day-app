import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from './api';
import * as db from './database';
import * as onboardingService from './onboarding';
import { i18n } from '../i18n';

// AsyncStorage keys
const LAST_CONTENT_REFRESH_KEY = '@last_content_refresh';
const LOCALE_STORAGE_KEY = '@app_locale';

// Minimum interval between refreshes (1 hour in milliseconds)
const REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

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
 * Get current app locale from AsyncStorage or fallback to i18n.locale
 */
async function getCurrentLocale(): Promise<string> {
  try {
    const savedLocale = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    return savedLocale || i18n.locale || 'en';
  } catch (error) {
    console.error('Error getting current locale:', error);
    return i18n.locale || 'en';
  }
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
 * Refresh app content from API: metadata and new facts
 * This runs in the background and doesn't block app startup
 * Silently fails if offline or network issues occur
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

    // Check if we should refresh
    const shouldRefresh = await shouldRefreshContent();
    if (!shouldRefresh) {
      console.log('⏭️  Skipping refresh - last refresh was less than 1 hour ago');
      result.success = true;
      return result;
    }

    // Get current user preferences
    const language = await getCurrentLocale();
    const categories = await onboardingService.getSelectedCategories();

    // Step 1: Fetch and update metadata (categories)
    console.log('📦 Fetching metadata...');
    const metadata = await api.getMetadata(language);

    await db.insertCategories(metadata.categories);
    result.updated.categories = metadata.categories.length;

    console.log(`✅ Updated ${result.updated.categories} categories`);

    // Step 2: Fetch new or updated facts since last update
    const lastFactUpdatedAt = await getLastFactUpdatedAt();

    if (lastFactUpdatedAt) {
      console.log(`📥 Fetching facts updated after ${lastFactUpdatedAt}...`);

      // Fetch only new or updated facts using since_updated parameter
      const categoriesParam = categories.join(',');
      const response = await api.getFacts({
        language,
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
          reading_time: fact.reading_time,
          word_count: fact.word_count,
          image_url: fact.image_url,
          language: fact.language,
          created_at: fact.created_at,
          last_updated: fact.last_updated,
        }));

        // Insert new or updated facts (INSERT OR REPLACE handles duplicates)
        await db.insertFacts(dbFacts);
        result.updated.facts = dbFacts.length;

        console.log(`✅ Updated ${result.updated.facts} facts (new or modified)`);
      } else {
        console.log('✅ No new or updated facts available');
      }
    } else {
      console.log('ℹ️  No existing facts - skipping incremental fetch');
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
