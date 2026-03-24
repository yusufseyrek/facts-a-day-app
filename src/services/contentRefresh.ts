import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import { showAppOpenAdForLocaleChange } from '../components/ads/AppOpenAd';
import { API_SETTINGS } from '../config/app';
import { getLocaleFromCode, SupportedLocale } from '../i18n';

import * as api from './api';
import * as db from './database';
import * as onboardingService from './onboarding';
import { extractQuestions } from './questions';
import * as preferencesService from './preferences';

// AsyncStorage keys
const LAST_CONTENT_REFRESH_KEY = '@last_content_refresh';
const STORED_LOCALE_KEY = '@stored_locale';
const QUESTIONS_MIGRATION_KEY = '@questions_migration_v1';
const SLUG_MIGRATION_KEY = '@slug_migration_v1';
const HISTORICAL_MIGRATION_KEY = '@historical_migration_v1';

// Flag: when true, the home screen should force-refresh on next focus
let feedRefreshPending = false;

/**
 * Mark that a feed refresh is needed (e.g. after preference changes).
 * The home screen checks this flag on focus and clears it after refreshing.
 */
export function markFeedRefreshPending(): void {
  feedRefreshPending = true;
  console.log('📋 [FeedRefresh] markFeedRefreshPending called — flag is now TRUE');
}

/**
 * Check and clear the pending feed refresh flag.
 * Returns true if a refresh was pending.
 */
export function consumeFeedRefreshPending(): boolean {
  const was = feedRefreshPending;
  if (feedRefreshPending) {
    feedRefreshPending = false;
  }
  console.log(`📋 [FeedRefresh] consumeFeedRefreshPending called — was=${was}, now=${feedRefreshPending}`);
  return was;
}

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
export function emitFeedRefresh(): void {
  feedRefreshListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Error in feed refresh listener:', error);
    }
  });
}

/**
 * Trigger a feed refresh manually
 * Used by DEV tools to refresh the feed after manipulation
 */
export function triggerFeedRefresh(): void {
  emitFeedRefresh();
}

// ============================================================================
// Cross-tab Discover category selection
// ============================================================================

let pendingDiscoverCategory: string | null = null;

/**
 * Set a category slug to be consumed by the Discover screen on next focus.
 */
export function setPendingDiscoverCategory(slug: string): void {
  pendingDiscoverCategory = slug;
}

/**
 * Consume and clear the pending category slug. Returns null if none is pending.
 */
export function consumePendingDiscoverCategory(): string | null {
  const slug = pendingDiscoverCategory;
  pendingDiscoverCategory = null;
  return slug;
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
export async function getStoredLocale(): Promise<string | null> {
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
 * Check if questions migration is needed
 * Returns true if user has facts but no questions (existing user before trivia feature)
 */
async function needsQuestionsMigration(): Promise<boolean> {
  try {
    // Check if migration was already done
    const migrationDone = await AsyncStorage.getItem(QUESTIONS_MIGRATION_KEY);
    if (migrationDone === 'true') {
      return false;
    }

    const database = await db.openDatabase();

    // Check if there are any facts
    const factsResult = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM facts'
    );
    const factsCount = factsResult?.count || 0;

    if (factsCount === 0) {
      // No facts yet, no migration needed
      // Mark as done so we don't check again
      await AsyncStorage.setItem(QUESTIONS_MIGRATION_KEY, 'true');
      return false;
    }

    // Check if there are any questions
    const questionsResult = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM questions'
    );
    const questionsCount = questionsResult?.count || 0;

    // If we have facts but no questions, we need migration
    if (questionsCount === 0) {
      console.log(`📊 Migration needed: ${factsCount} facts, ${questionsCount} questions`);
      return true;
    }

    // Already have questions, mark migration as done
    await AsyncStorage.setItem(QUESTIONS_MIGRATION_KEY, 'true');
    return false;
  } catch (error) {
    console.error('Error checking questions migration:', error);
    return false;
  }
}

/**
 * Run questions migration for existing users
 * Re-fetches all facts with questions included
 */
async function runQuestionsMigration(locale: SupportedLocale): Promise<void> {
  try {
    console.log('🔄 Running questions migration for existing facts...');

    const categories = await onboardingService.getSelectedCategories();
    if (categories.length === 0) {
      console.log('No categories selected, skipping migration');
      await AsyncStorage.setItem(QUESTIONS_MIGRATION_KEY, 'true');
      return;
    }

    // Fetch all facts with questions
    const facts = await api.getAllFactsWithRetry(
      locale,
      categories.join(','),
      undefined, // no progress callback
      3, // maxRetries
      true // includeQuestions
    );

    // Extract and insert questions
    const dbQuestions = extractQuestions(facts);
    if (dbQuestions.length > 0) {
      await db.insertQuestions(dbQuestions);
      console.log(`✅ Migration complete: Added ${dbQuestions.length} questions for trivia`);
    } else {
      console.log('No questions found in API response');
    }

    // Mark migration as complete
    await AsyncStorage.setItem(QUESTIONS_MIGRATION_KEY, 'true');
  } catch (error) {
    console.error('❌ Questions migration failed:', error);
    // Don't mark as complete so it can retry next time
  }
}

/**
 * Check if slug migration is needed
 * Returns true if user has facts without slug (existing user before slug field was added)
 */
async function needsSlugMigration(): Promise<boolean> {
  try {
    // Check if migration was already done
    const migrationDone = await AsyncStorage.getItem(SLUG_MIGRATION_KEY);
    if (migrationDone === 'true') {
      return false;
    }

    const database = await db.openDatabase();

    // Check if any facts exist without a slug
    const result = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM facts WHERE slug IS NULL'
    );

    if ((result?.count || 0) > 0) {
      console.log(`📊 Slug migration needed: ${result?.count} facts without slug`);
      return true;
    }

    // All facts have slugs (or no facts exist), mark migration as done
    await AsyncStorage.setItem(SLUG_MIGRATION_KEY, 'true');
    return false;
  } catch (error) {
    console.error('Error checking slug migration:', error);
    return false;
  }
}

/**
 * Run slug migration for existing users
 * Re-fetches all facts to populate the slug field
 */
async function runSlugMigration(locale: SupportedLocale): Promise<void> {
  try {
    console.log('🔄 Running slug migration - re-downloading all facts...');

    const categories = await onboardingService.getSelectedCategories();
    if (categories.length === 0) {
      console.log('No categories selected, skipping slug migration');
      await AsyncStorage.setItem(SLUG_MIGRATION_KEY, 'true');
      return;
    }

    // Fetch all facts with updated slug field
    const facts = await api.getAllFactsWithRetry(
      locale,
      categories.join(','),
      undefined,
      3,
      true // includeQuestions
    );

    // Convert to DB format with slug
    const dbFacts: db.Fact[] = facts.map((fact) => ({
      id: fact.id,
      slug: fact.slug,
      title: fact.title,
      content: fact.content,
      summary: fact.summary,
      category: fact.category,
      source_url: fact.source_url,
      image_url: fact.image_url,
      is_historical: fact.is_historical ? 1 : 0,
      event_month: fact.metadata?.month ?? undefined,
      event_day: fact.metadata?.day ?? undefined,
      event_year: fact.metadata?.event_year ?? undefined,
      metadata: fact.metadata
        ? JSON.stringify({ original_event: fact.metadata.original_event, country: fact.metadata.country })
        : undefined,
      language: fact.language,
      created_at: fact.created_at,
      last_updated: fact.updated_at,
    }));

    // Insert/update facts (preserves scheduling info via ON CONFLICT)
    await db.insertFacts(dbFacts);

    console.log(`✅ Slug migration complete: Updated ${dbFacts.length} facts`);
    await AsyncStorage.setItem(SLUG_MIGRATION_KEY, 'true');
  } catch (error) {
    console.error('❌ Slug migration failed:', error);
    // Don't mark as complete so it can retry next time
  }
}

/**
 * Check if historical facts migration is needed for existing users
 * Returns true if there are facts in DB but no historical facts have been synced yet
 */
async function needsHistoricalMigration(): Promise<boolean> {
  try {
    const migrationDone = await AsyncStorage.getItem(HISTORICAL_MIGRATION_KEY);
    if (migrationDone === 'true') {
      return false;
    }

    const database = await db.openDatabase();

    // Check if any facts exist at all (if no facts, user is new — no migration needed)
    const result = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM facts'
    );

    if ((result?.count || 0) === 0) {
      await AsyncStorage.setItem(HISTORICAL_MIGRATION_KEY, 'true');
      return false;
    }

    // Facts exist but migration hasn't run — we need to re-fetch with historical included
    console.log('📊 Historical migration needed: re-fetching all facts with historical data');
    return true;
  } catch (error) {
    console.error('Error checking historical migration:', error);
    return false;
  }
}

/**
 * Run historical facts migration for existing users
 * Re-fetches all facts with include_historical=true to backfill historical facts
 * and populate is_historical/event_month/event_day/event_year/metadata on existing facts
 */
async function runHistoricalMigration(locale: SupportedLocale): Promise<void> {
  try {
    console.log('🔄 Running historical migration - re-downloading all facts with historical data...');

    const categories = await onboardingService.getSelectedCategories();
    if (categories.length === 0) {
      console.log('No categories selected, skipping historical migration');
      await AsyncStorage.setItem(HISTORICAL_MIGRATION_KEY, 'true');
      return;
    }

    const facts = await api.getAllFactsWithRetry(
      locale,
      categories.join(','),
      undefined,
      3,
      true, // includeQuestions
      true // includeHistorical
    );

    const dbFacts: db.Fact[] = facts.map((fact) => ({
      id: fact.id,
      slug: fact.slug,
      title: fact.title,
      content: fact.content,
      summary: fact.summary,
      category: fact.category,
      source_url: fact.source_url,
      image_url: fact.image_url,
      is_historical: fact.is_historical ? 1 : 0,
      event_month: fact.metadata?.month ?? undefined,
      event_day: fact.metadata?.day ?? undefined,
      event_year: fact.metadata?.event_year ?? undefined,
      metadata: fact.metadata
        ? JSON.stringify({ original_event: fact.metadata.original_event, country: fact.metadata.country })
        : undefined,
      language: fact.language,
      created_at: fact.created_at,
      last_updated: fact.updated_at,
    }));

    // Insert/update facts (preserves scheduling info via ON CONFLICT)
    await db.insertFacts(dbFacts);

    // Extract and insert questions
    const dbQuestions = extractQuestions(facts);
    if (dbQuestions.length > 0) {
      await db.insertQuestions(dbQuestions);
    }

    console.log(`✅ Historical migration complete: Synced ${dbFacts.length} facts`);
    await AsyncStorage.setItem(HISTORICAL_MIGRATION_KEY, 'true');
  } catch (error) {
    console.error('❌ Historical migration failed:', error);
    // Don't mark as complete so it can retry next time
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
      console.log(
        `🌍 Locale changed from "${localeStatus.storedLocale}" to "${currentLocale}" - triggering full refresh...`
      );

      // Emit locale-change status for UI loading indicator
      emitRefreshStatus('locale-change');

      // Load and show app open ad alongside content refresh
      // Both run in parallel - ad displays while content downloads
      const [languageChangeResult] = await Promise.all([
        preferencesService.handleLanguageChange(currentLocale),
        showAppOpenAdForLocaleChange().catch((error) => {
          console.error('Failed to show app open ad for locale change:', error);
        }),
      ]);

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

    // Check if we need to run questions migration for existing users
    // This is a one-time migration for users who had facts before trivia feature was added
    if (await needsQuestionsMigration()) {
      await runQuestionsMigration(currentLocale);
    }

    // Check if we need to run slug migration for existing users
    // This is a one-time migration for users who had facts before slug field was added
    if (await needsSlugMigration()) {
      await runSlugMigration(currentLocale);
    }

    // Check if we need to run historical facts migration for existing users
    // This is a one-time migration to backfill historical facts
    if (await needsHistoricalMigration()) {
      await runHistoricalMigration(currentLocale);
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
      // Include questions for trivia feature
      // Paginate to ensure all updates are fetched (not just the first batch)
      const categoriesParam = categories.join(',');
      const batchSize = API_SETTINGS.FACTS_BATCH_SIZE;
      let offset = 0;
      const allIncrementalFacts: api.FactResponse[] = [];

      let response = await api.getFacts({
        language: currentLocale,
        categories: categoriesParam,
        since_updated: lastFactUpdatedAt,
        limit: batchSize,
        offset,
        include_questions: true,
        include_historical: true,
      });

      allIncrementalFacts.push(...response.facts);

      while (response.pagination.has_more) {
        offset += batchSize;
        response = await api.getFacts({
          language: currentLocale,
          categories: categoriesParam,
          since_updated: lastFactUpdatedAt,
          limit: batchSize,
          offset,
          include_questions: true,
          include_historical: true,
        });
        allIncrementalFacts.push(...response.facts);
      }

      if (allIncrementalFacts.length > 0) {
        // Convert API facts to database format
        // Note: API returns `updated_at`, we map it to `last_updated` in DB
        const dbFacts: db.Fact[] = allIncrementalFacts.map((fact) => ({
          id: fact.id,
          slug: fact.slug,
          title: fact.title,
          content: fact.content,
          summary: fact.summary,
          category: fact.category,
          source_url: fact.source_url,
          image_url: fact.image_url,
          is_historical: fact.is_historical ? 1 : 0,
          event_month: fact.metadata?.month ?? undefined,
          event_day: fact.metadata?.day ?? undefined,
          event_year: fact.metadata?.event_year ?? undefined,
          metadata: fact.metadata
            ? JSON.stringify({ original_event: fact.metadata.original_event, country: fact.metadata.country })
            : undefined,
          language: fact.language,
          created_at: fact.created_at,
          last_updated: fact.updated_at,
        }));

        // Extract questions from facts for trivia feature
        const dbQuestions = extractQuestions(allIncrementalFacts);

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

        // Insert questions (INSERT OR REPLACE handles duplicates)
        if (dbQuestions.length > 0) {
          await db.insertQuestions(dbQuestions);
          console.log(`🧠 Synced ${dbQuestions.length} questions for trivia`);
        }

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
