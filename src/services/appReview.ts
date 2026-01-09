import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

import { STORAGE_KEYS, APP_REVIEW } from '../config/app';

/**
 * Track that a fact has been viewed
 * Returns true if review prompt should be shown
 */
export async function trackFactView(): Promise<boolean> {
  try {
    // Check if review has already been requested
    const reviewRequested = await AsyncStorage.getItem(STORAGE_KEYS.REVIEW_REQUESTED);
    if (reviewRequested === 'true') {
      return false; // Don't show again if already requested once
    }

    // Check if we've prompted recently
    const lastPromptDate = await AsyncStorage.getItem(STORAGE_KEYS.LAST_REVIEW_PROMPT);
    if (lastPromptDate) {
      const daysSinceLastPrompt =
        (Date.now() - parseInt(lastPromptDate, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceLastPrompt < APP_REVIEW.MIN_DAYS_BETWEEN_PROMPTS) {
        return false; // Too soon to prompt again
      }
    }

    // Increment view count
    const currentCount = await getFactsViewedCount();
    const newCount = currentCount + 1;
    await AsyncStorage.setItem(STORAGE_KEYS.FACTS_VIEWED_COUNT, newCount.toString());

    // Check if threshold reached
    if (newCount >= APP_REVIEW.FACTS_THRESHOLD) {
      return true;
    }

    return false;
  } catch (error) {
    if (__DEV__) {
      console.error('Error tracking fact view:', error);
    }
    return false;
  }
}

/**
 * Get the current count of facts viewed
 */
export async function getFactsViewedCount(): Promise<number> {
  try {
    const count = await AsyncStorage.getItem(STORAGE_KEYS.FACTS_VIEWED_COUNT);
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    if (__DEV__) {
      console.error('Error getting facts viewed count:', error);
    }
    return 0;
  }
}

/**
 * Show the native app review prompt
 * Returns true if successfully shown, false otherwise
 */
export async function requestReview(): Promise<boolean> {
  try {
    // Check if review functionality is available
    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) {
      if (__DEV__) {
        console.log('Store review is not available on this device');
      }
      return false;
    }

    // Check if we can request review (iOS has limits)
    const canRequest = await StoreReview.hasAction();
    if (!canRequest) {
      if (__DEV__) {
        console.log('Cannot request review at this time');
      }
      return false;
    }

    // Show the review prompt
    await StoreReview.requestReview();

    // Mark as requested and update last prompt date
    await AsyncStorage.setItem(STORAGE_KEYS.REVIEW_REQUESTED, 'true');
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_REVIEW_PROMPT, Date.now().toString());

    if (__DEV__) {
      console.log('Review prompt shown successfully');
    }

    return true;
  } catch (error) {
    if (__DEV__) {
      console.error('Error requesting review:', error);
    }
    return false;
  }
}

/**
 * Reset review tracking (for testing purposes)
 */
export async function resetReviewTracking(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.FACTS_VIEWED_COUNT,
      STORAGE_KEYS.REVIEW_REQUESTED,
      STORAGE_KEYS.LAST_REVIEW_PROMPT,
    ]);
    if (__DEV__) {
      console.log('Review tracking reset');
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Error resetting review tracking:', error);
    }
  }
}

/**
 * Check if review prompt should be shown and show it if appropriate
 * Call this after a fact is viewed
 */
export async function checkAndRequestReview(): Promise<void> {
  try {
    const shouldShow = await trackFactView();
    if (shouldShow) {
      // Small delay to avoid interrupting the user experience
      setTimeout(async () => {
        await requestReview();
      }, 1000);
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Error checking and requesting review:', error);
    }
  }
}
