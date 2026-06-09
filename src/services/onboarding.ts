import AsyncStorage from '@react-native-async-storage/async-storage';

import * as api from './api';
import * as db from './database';

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
 * Initialize onboarding: validate connectivity by fetching metadata. Facts and
 * categories are served on demand from the API now, so there's nothing to
 * download into a local mirror here — a successful metadata fetch is enough to
 * proceed.
 */
export async function initializeOnboarding(deviceLanguage: string): Promise<InitializationResult> {
  try {
    if (__DEV__) console.log('Fetching metadata...');
    await api.getMetadata(deviceLanguage);
    await db.openDatabase();
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
 * No-op retained for callers during the transition: facts are no longer
 * downloaded into a local mirror at onboarding. The home screen fetches the
 * feed on demand from the API, so onboarding completes immediately.
 */
export async function fetchAllFacts(
  _language: string,
  _categories: string[],
  onProgress?: (progress: FetchFactsProgress) => void,
  onFirstBatchReady?: () => void
): Promise<FetchFactsResult> {
  try {
    onProgress?.({ downloaded: 0, total: 0, percentage: 100 });
    onFirstBatchReady?.();
    return { success: true, count: 0 };
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

    // Fresh installs already pull every fact (with audio_url) during
    // onboarding, so flag the audio migration as done — no need to refetch
    // on first post-onboarding launch. (Flag key mirrors factAudioMigration.ts.)
    await AsyncStorage.setItem('@audio_migration_v1_done', '1').catch(() => {});

    // Fresh installs only see facts that currently exist on the server (the
    // backend never returns deleted facts), so there is no historical
    // deletion backlog to walk. Pin the deletion-sync cursor to "now" so
    // the first refresh after onboarding only fetches *future* deletions.
    // Key mirrors LAST_DELETED_SYNC_AT_KEY in contentRefresh.ts.
    await AsyncStorage.setItem('@last_deleted_sync_at', new Date().toISOString()).catch(() => {});

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
