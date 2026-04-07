import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_SETTINGS } from '../config/app';

import * as api from './api';
import * as db from './database';
import { extractQuestions } from './questions';

// AsyncStorage keys
export const ONBOARDING_COMPLETE_KEY = '@onboarding_complete';
export const SELECTED_CATEGORIES_KEY = '@selected_categories';
export const NOTIFICATION_TIME_KEY = '@notification_time';
export const NOTIFICATION_TIMES_KEY = '@notification_times'; // For multiple times (premium)

// ====== Onboarding Status ======

/**
 * Check if onboarding has been completed
 */
export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return value === 'true';
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return false;
  }
}

/**
 * Mark onboarding as complete
 */
async function setOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
  } catch (error) {
    console.error('Error setting onboarding complete:', error);
    throw error;
  }
}

// ====== Initialization ======

export interface InitializationResult {
  success: boolean;
  error?: string;
}

/**
 * Initialize onboarding: fetch metadata from API
 */
export async function initializeOnboarding(deviceLanguage: string, includePremium?: boolean): Promise<InitializationResult> {
  try {
    // Fetch metadata with device language for translations
    if (__DEV__) console.log('Fetching metadata...');
    const metadata = await api.getMetadata(deviceLanguage, includePremium);

    // Store metadata in database
    if (__DEV__) console.log('Storing metadata in database...');
    await db.openDatabase();
    await db.insertCategories(metadata.categories);

    return { success: true };
  } catch (error) {
    console.error('Initialization error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ====== Facts Fetching ======

export interface FetchFactsProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

export interface FetchFactsResult {
  success: boolean;
  count?: number;
  error?: string;
}

/**
 * Convert API facts to database format
 */
function mapFactsToDb(facts: api.FactResponse[]): db.Fact[] {
  return facts.map((fact) => ({
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
}

/**
 * Fetch all facts incrementally and store each batch in database as it arrives.
 * The first batch (latest 500 facts) is written to DB and signals readiness
 * so the user can proceed to the home screen while remaining facts download.
 */
export async function fetchAllFacts(
  language: string,
  categories: string[],
  onProgress?: (progress: FetchFactsProgress) => void,
  onFirstBatchReady?: () => void
): Promise<FetchFactsResult> {
  try {
    const categoriesParam = categories.join(',');

    let totalInserted = 0;

    const result = await api.fetchFactsIncrementally({
      language,
      categories: categoriesParam,
      initialBatchSize: API_SETTINGS.INITIAL_BATCH_SIZE,
      remainingBatchSize: API_SETTINGS.FACTS_BATCH_SIZE,
      concurrency: API_SETTINGS.BATCH_CONCURRENCY,
      includeQuestions: true,
      includeHistorical: true,
      onBatchReady: async (facts, isInitialBatch) => {
        const dbFacts = mapFactsToDb(facts);

        await db.insertFacts(dbFacts);

        const dbQuestions = extractQuestions(facts);
        if (dbQuestions.length > 0) {
          await db.insertQuestions(dbQuestions);
        }

        totalInserted += dbFacts.length;

        if (isInitialBatch) {
          onFirstBatchReady?.();
        }
      },
      onProgress: (downloaded, total) => {
        if (onProgress) {
          onProgress({
            downloaded,
            total,
            percentage: total > 0 ? Math.round((downloaded / total) * 100) : 0,
          });
        }
      },
    });

    return { success: true, count: totalInserted };
  } catch (error) {
    console.error('Fetch facts error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ====== Complete Onboarding ======

export interface OnboardingPreferences {
  selectedCategories: string[];
  notificationTime?: Date; // Deprecated - kept for backward compatibility
  notificationTimes?: Date[]; // New field for multiple times
}

/**
 * Save onboarding preferences and mark onboarding as complete
 * ONLY call this AFTER facts have been successfully fetched and stored
 */
export async function completeOnboarding(preferences: OnboardingPreferences): Promise<void> {
  try {
    // Save preferences to AsyncStorage
    await AsyncStorage.setItem(
      SELECTED_CATEGORIES_KEY,
      JSON.stringify(preferences.selectedCategories)
    );

    // Save notification times if provided (new multi-time feature)
    if (preferences.notificationTimes && preferences.notificationTimes.length > 0) {
      const timeStrings = preferences.notificationTimes.map((time) => time.toISOString());
      await AsyncStorage.setItem(NOTIFICATION_TIMES_KEY, JSON.stringify(timeStrings));
      // Also save first time as single time for backward compatibility
      await AsyncStorage.setItem(
        NOTIFICATION_TIME_KEY,
        preferences.notificationTimes[0].toISOString()
      );
    }
    // Fallback to single notification time if provided
    else if (preferences.notificationTime) {
      await AsyncStorage.setItem(NOTIFICATION_TIME_KEY, preferences.notificationTime.toISOString());
    }

    // Mark onboarding as complete
    await setOnboardingComplete();

    if (__DEV__) console.log('Onboarding completed successfully');
  } catch (error) {
    console.error('Error completing onboarding:', error);
    throw error;
  }
}

// ====== Get Saved Preferences ======

export async function getSelectedCategories(): Promise<string[]> {
  try {
    const value = await AsyncStorage.getItem(SELECTED_CATEGORIES_KEY);
    return value ? JSON.parse(value) : [];
  } catch (error) {
    console.error('Error getting selected categories:', error);
    return [];
  }
}

export async function getNotificationTime(): Promise<Date | null> {
  try {
    const value = await AsyncStorage.getItem(NOTIFICATION_TIME_KEY);
    return value ? new Date(value) : null;
  } catch (error) {
    console.error('Error getting notification time:', error);
    return null;
  }
}

export async function getNotificationTimes(): Promise<string[]> {
  try {
    const value = await AsyncStorage.getItem(NOTIFICATION_TIMES_KEY);
    if (value) {
      return JSON.parse(value);
    }

    // Fallback to single time if not set
    const singleTime = await getNotificationTime();
    return singleTime ? [singleTime.toISOString()] : [];
  } catch (error) {
    console.error('Error getting notification times:', error);
    return [];
  }
}

// ====== Update Preferences ======

/**
 * Update selected categories
 */
export async function setSelectedCategories(categories: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SELECTED_CATEGORIES_KEY, JSON.stringify(categories));
    if (__DEV__) console.log('Selected categories updated:', categories);
  } catch (error) {
    console.error('Error setting selected categories:', error);
    throw error;
  }
}

/**
 * Update notification time
 */
export async function setNotificationTime(time: Date): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_TIME_KEY, time.toISOString());
    if (__DEV__) console.log('Notification time updated:', time.toISOString());
  } catch (error) {
    console.error('Error setting notification time:', error);
    throw error;
  }
}

/**
 * Update multiple notification times (for premium users)
 */
export async function setNotificationTimes(times: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_TIMES_KEY, JSON.stringify(times));

    // Also update the single time key with the first time for backward compatibility
    if (times.length > 0) {
      await AsyncStorage.setItem(NOTIFICATION_TIME_KEY, times[0]);
    }

    if (__DEV__) console.log('Notification times updated:', times);
  } catch (error) {
    console.error('Error setting notification times:', error);
    throw error;
  }
}

// ====== Reset Onboarding ======

/**
 * Reset onboarding state (for testing or re-onboarding)
 */
export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    await AsyncStorage.removeItem(SELECTED_CATEGORIES_KEY);
    await AsyncStorage.removeItem(NOTIFICATION_TIME_KEY);
    await AsyncStorage.removeItem(NOTIFICATION_TIMES_KEY);
    await db.clearDatabase();
    if (__DEV__) console.log('Onboarding reset successfully');
  } catch (error) {
    console.error('Error resetting onboarding:', error);
    throw error;
  }
}
