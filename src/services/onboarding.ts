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
 * Initialize onboarding: fetch metadata from API
 */
export async function initializeOnboarding(deviceLanguage: string): Promise<InitializationResult> {
  try {
    // Fetch metadata with device language for translations
    console.log('Fetching metadata...');
    const metadata = await api.getMetadata(deviceLanguage);

    // Store metadata in database
    console.log('Storing metadata in database...');
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
 * Fetch all facts based on preferences and store in database
 */
export async function fetchAllFacts(
  language: string,
  categories: string[],
  onProgress?: (progress: FetchFactsProgress) => void
): Promise<FetchFactsResult> {
  try {
    // Convert categories array to comma-separated string
    const categoriesParam = categories.join(',');

    // Fetch all facts with retry logic (include questions for trivia feature)
    console.log('Fetching facts with questions...', { language, categories: categoriesParam });

    const facts = await api.getAllFactsWithRetry(
      language,
      categoriesParam,
      (downloaded, total) => {
        if (onProgress) {
          onProgress({
            downloaded,
            total,
            percentage: total > 0 ? Math.round((downloaded / total) * 100) : 0,
          });
        }
      },
      3, // max retries
      true // include questions for trivia feature
    );

    // Convert API facts to database facts format
    // Note: API returns `updated_at`, we map it to `last_updated` in DB
    const dbFacts: db.Fact[] = facts.map((fact) => ({
      id: fact.id,
      slug: fact.slug,
      title: fact.title,
      content: fact.content,
      summary: fact.summary,
      category: fact.category,
      source_url: fact.source_url,
      image_url: fact.image_url,
      language: fact.language,
      created_at: fact.created_at,
      last_updated: fact.updated_at,
    }));

    // Extract questions from facts for trivia feature
    const dbQuestions: db.Question[] = [];
    for (const fact of facts) {
      if (fact.questions && fact.questions.length > 0) {
        for (const question of fact.questions) {
          dbQuestions.push({
            id: question.id,
            fact_id: fact.id,
            question_type: question.question_type,
            question_text: question.question_text,
            correct_answer: question.correct_answer,
            wrong_answers: question.wrong_answers ? JSON.stringify(question.wrong_answers) : null,
            explanation: question.explanation,
            difficulty: question.difficulty,
          });
        }
      }
    }

    // Store facts in database
    console.log(`Storing ${dbFacts.length} facts in database...`);
    await db.insertFacts(dbFacts);

    // Store questions in database for trivia feature
    if (dbQuestions.length > 0) {
      console.log(`Storing ${dbQuestions.length} questions in database...`);
      await db.insertQuestions(dbQuestions);
    }

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
    console.log('Selected categories updated:', categories);
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
    await AsyncStorage.removeItem(NOTIFICATION_TIME_KEY);
    await AsyncStorage.removeItem(NOTIFICATION_TIMES_KEY);
    await db.clearDatabase();
    console.log('Onboarding reset successfully');
  } catch (error) {
    console.error('Error resetting onboarding:', error);
    throw error;
  }
}
