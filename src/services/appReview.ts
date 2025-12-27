import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

// Storage keys
const FACTS_VIEWED_COUNT_KEY = '@facts_viewed_count';
const REVIEW_REQUESTED_KEY = '@review_requested';
const LAST_REVIEW_PROMPT_KEY = '@last_review_prompt';

// Configuration
const FACTS_THRESHOLD_FOR_REVIEW = 10; // Ask for review after 10 facts viewed
const MIN_DAYS_BETWEEN_PROMPTS = 15; // Don't ask again for 15 days

/**
 * Track that a fact has been viewed
 * Returns true if review prompt should be shown
 */
export async function trackFactView(): Promise<boolean> {
  try {
    // Check if review has already been requested
    const reviewRequested = await AsyncStorage.getItem(REVIEW_REQUESTED_KEY);
    if (reviewRequested === 'true') {
      return false; // Don't show again if already requested once
    }

    // Check if we've prompted recently
    const lastPromptDate = await AsyncStorage.getItem(LAST_REVIEW_PROMPT_KEY);
    if (lastPromptDate) {
      const daysSinceLastPrompt =
        (Date.now() - parseInt(lastPromptDate, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceLastPrompt < MIN_DAYS_BETWEEN_PROMPTS) {
        return false; // Too soon to prompt again
      }
    }

    // Increment view count
    const currentCount = await getFactsViewedCount();
    const newCount = currentCount + 1;
    await AsyncStorage.setItem(FACTS_VIEWED_COUNT_KEY, newCount.toString());

    // Check if threshold reached
    if (newCount >= FACTS_THRESHOLD_FOR_REVIEW) {
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
    const count = await AsyncStorage.getItem(FACTS_VIEWED_COUNT_KEY);
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
    await AsyncStorage.setItem(REVIEW_REQUESTED_KEY, 'true');
    await AsyncStorage.setItem(LAST_REVIEW_PROMPT_KEY, Date.now().toString());

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
      FACTS_VIEWED_COUNT_KEY,
      REVIEW_REQUESTED_KEY,
      LAST_REVIEW_PROMPT_KEY,
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
