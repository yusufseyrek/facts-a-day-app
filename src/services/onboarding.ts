import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as api from './api';
import * as db from './database';

// AsyncStorage keys
export const ONBOARDING_COMPLETE_KEY = '@onboarding_complete';
export const SELECTED_CATEGORIES_KEY = '@selected_categories';
export const DIFFICULTY_PREFERENCE_KEY = '@difficulty_preference';
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

// ====== Device Registration & Metadata ======

export interface InitializationResult {
  success: boolean;
  error?: string;
}

/**
 * Initialize onboarding: register device and fetch metadata
 */
export async function initializeOnboarding(
  deviceLanguage: string
): Promise<InitializationResult> {
  try {
    // Get device information
    const deviceInfo: api.DeviceInfo = {
      platform: Device.osName === 'iOS' ? 'ios' : 'android',
      app_version: Constants.expoConfig?.version || '1.0.0',
      device_model: Device.modelName || 'Unknown',
      os_version: Device.osVersion || 'Unknown',
      language_preference: deviceLanguage,
    };

    // Register device and get device_key
    console.log('Registering device...');
    await api.registerDevice(deviceInfo);

    // Fetch metadata with device language for translations
    console.log('Fetching metadata...');
    const metadata = await api.getMetadata(deviceLanguage);

    // Store metadata in database
    console.log('Storing metadata in database...');
    await db.openDatabase();
    await db.insertCategories(metadata.categories);
    await db.insertContentTypes(metadata.content_types);

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
 * Fetch all facts based on preferences and store in database
 */
export async function fetchAllFacts(
  language: string,
  categories: string[],
  difficulty: string,
  onProgress?: (progress: FetchFactsProgress) => void
): Promise<FetchFactsResult> {
  try {
    // Convert categories array to comma-separated string
    const categoriesParam = categories.join(',');

    // Fetch all facts with retry logic
    console.log('Fetching facts...', { language, categories: categoriesParam, difficulty });

    const facts = await api.getAllFactsWithRetry(
      language,
      categoriesParam,
      difficulty,
      (downloaded, total) => {
        if (onProgress) {
          onProgress({
            downloaded,
            total,
            percentage: total > 0 ? Math.round((downloaded / total) * 100) : 0,
          });
        }
      },
      3 // max retries
    );

    // Convert API facts to database facts format
    const dbFacts: db.Fact[] = facts.map((fact) => ({
      id: fact.id,
      title: fact.title,
      content: fact.content,
      summary: fact.summary,
      difficulty: fact.difficulty,
      content_type: fact.content_type,
      category: fact.category,
      tags: fact.tags ? JSON.stringify(fact.tags) : undefined,
      source_url: fact.source_url,
      reading_time: fact.reading_time,
      word_count: fact.word_count,
      image_url: fact.image_url,
      language: fact.language,
      created_at: fact.created_at,
      updated_at: fact.updated_at,
    }));

    // Store facts in database
    console.log(`Storing ${dbFacts.length} facts in database...`);
    await db.insertFacts(dbFacts);

    return { success: true, count: dbFacts.length };
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
  difficultyPreference: string;
  notificationTime?: Date;
}

/**
 * Save onboarding preferences and mark onboarding as complete
 * ONLY call this AFTER facts have been successfully fetched and stored
 */
export async function completeOnboarding(
  preferences: OnboardingPreferences
): Promise<void> {
  try {
    // Save preferences to AsyncStorage
    await AsyncStorage.setItem(
      SELECTED_CATEGORIES_KEY,
      JSON.stringify(preferences.selectedCategories)
    );

    await AsyncStorage.setItem(
      DIFFICULTY_PREFERENCE_KEY,
      preferences.difficultyPreference
    );

    // Save notification time if provided
    if (preferences.notificationTime) {
      await AsyncStorage.setItem(
        NOTIFICATION_TIME_KEY,
        preferences.notificationTime.toISOString()
      );
    }

    // Mark onboarding as complete
    await setOnboardingComplete();

    console.log('Onboarding completed successfully');
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

export async function getDifficultyPreference(): Promise<string> {
  try {
    const value = await AsyncStorage.getItem(DIFFICULTY_PREFERENCE_KEY);
    return value || 'all';
  } catch (error) {
    console.error('Error getting difficulty preference:', error);
    return 'all';
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
    await AsyncStorage.setItem(
      SELECTED_CATEGORIES_KEY,
      JSON.stringify(categories)
    );
    console.log('Selected categories updated:', categories);
  } catch (error) {
    console.error('Error setting selected categories:', error);
    throw error;
  }
}

/**
 * Update difficulty preference
 */
export async function setDifficultyPreference(difficulty: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DIFFICULTY_PREFERENCE_KEY, difficulty);
    console.log('Difficulty preference updated:', difficulty);
  } catch (error) {
    console.error('Error setting difficulty preference:', error);
    throw error;
  }
}

/**
 * Update notification time
 */
export async function setNotificationTime(time: Date): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_TIME_KEY, time.toISOString());
    console.log('Notification time updated:', time.toISOString());
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

    console.log('Notification times updated:', times);
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
    await AsyncStorage.removeItem(DIFFICULTY_PREFERENCE_KEY);
    await AsyncStorage.removeItem(NOTIFICATION_TIME_KEY);
    await api.clearDeviceKey();
    await db.clearDatabase();
    console.log('Onboarding reset successfully');
  } catch (error) {
    console.error('Error resetting onboarding:', error);
    throw error;
  }
}
