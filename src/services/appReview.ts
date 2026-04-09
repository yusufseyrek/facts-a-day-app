import { Linking, Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

import { APP_REVIEW, APP_STORE_ID, PLAY_STORE_ID, STORAGE_KEYS, SUPPORT_EMAIL } from '../config/app';

// ---------------------------------------------------------------------------
// Satisfaction prompt queue (consumed by ReviewPromptProvider)
// ---------------------------------------------------------------------------

let _pendingSatisfactionPrompt = false;

export function scheduleSatisfactionPrompt(): void {
  _pendingSatisfactionPrompt = true;
}

export function hasPendingSatisfactionPrompt(): boolean {
  const val = _pendingSatisfactionPrompt;
  _pendingSatisfactionPrompt = false; // consume
  return val;
}

// ---------------------------------------------------------------------------
// Eligibility checks
// ---------------------------------------------------------------------------

async function getPromptHistory(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.REVIEW_PROMPT_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function getDistinctUsageDays(): Promise<number> {
  try {
    const { openDatabase } = await import('./database');
    const db = await openDatabase();
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(DISTINCT view_date) as count FROM (
         SELECT date(story_viewed_at, 'localtime') as view_date
         FROM fact_interactions WHERE story_viewed_at IS NOT NULL
         UNION
         SELECT date(detail_opened_at, 'localtime') as view_date
         FROM fact_interactions WHERE detail_opened_at IS NOT NULL
       )`
    );
    return result?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Check all preconditions before any review prompt can fire.
 */
async function isReviewEligible(): Promise<boolean> {
  try {
    // 1. Cooldown check
    const lastPrompt = await AsyncStorage.getItem(STORAGE_KEYS.LAST_REVIEW_PROMPT);
    if (lastPrompt) {
      const daysSince = (Date.now() - parseInt(lastPrompt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < APP_REVIEW.COOLDOWN_DAYS) {
        return false;
      }
    }

    // 2. Yearly cap check
    const history = await getPromptHistory();
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const promptsThisYear = history.filter((ts) => ts > oneYearAgo).length;
    if (promptsThisYear >= APP_REVIEW.MAX_PROMPTS_PER_YEAR) {
      return false;
    }

    // 3. Minimum engagement: facts viewed
    const factsViewed = await getFactsViewedCount();
    if (factsViewed < APP_REVIEW.MIN_FACTS_VIEWED) {
      return false;
    }

    // 4. Minimum engagement: distinct usage days
    const usageDays = await getDistinctUsageDays();
    if (usageDays < APP_REVIEW.MIN_USAGE_DAYS) {
      return false;
    }

    // 5. StoreReview availability
    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) {
      return false;
    }

    const canRequest = await StoreReview.hasAction();
    if (!canRequest) {
      return false;
    }

    return true;
  } catch (error) {
    if (__DEV__) {
      console.error('Error checking review eligibility:', error);
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Trigger entry points — each returns whether to show the satisfaction modal
// ---------------------------------------------------------------------------

type TriggerResult = 'show_satisfaction' | 'skip';

export async function onBadgeEarned(): Promise<TriggerResult> {
  const eligible = await isReviewEligible();
  return eligible ? 'show_satisfaction' : 'skip';
}

export async function onTriviaCompleted(accuracy: number): Promise<TriggerResult> {
  if (accuracy < APP_REVIEW.GOOD_TRIVIA_SCORE_PERCENT) {
    return 'skip';
  }
  const eligible = await isReviewEligible();
  return eligible ? 'show_satisfaction' : 'skip';
}

export async function onStreakMilestone(streakCount: number): Promise<TriggerResult> {
  if (!APP_REVIEW.STREAK_MILESTONES.includes(streakCount)) {
    return 'skip';
  }
  const eligible = await isReviewEligible();
  return eligible ? 'show_satisfaction' : 'skip';
}

export async function onFavoriteMilestone(totalFavorites: number): Promise<TriggerResult> {
  if (totalFavorites < APP_REVIEW.MIN_FAVORITES_FOR_TRIGGER || totalFavorites % 5 !== 0) {
    return 'skip';
  }
  const eligible = await isReviewEligible();
  return eligible ? 'show_satisfaction' : 'skip';
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export async function recordReviewPromptShown(): Promise<void> {
  try {
    const now = Date.now();
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_REVIEW_PROMPT, now.toString());

    const history = await getPromptHistory();
    history.push(now);
    await AsyncStorage.setItem(STORAGE_KEYS.REVIEW_PROMPT_HISTORY, JSON.stringify(history));
  } catch (error) {
    if (__DEV__) {
      console.error('Error recording review prompt:', error);
    }
  }
}

export async function recordSatisfactionPromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SATISFACTION_PROMPT, Date.now().toString());
    // Also update cooldown so we don't re-prompt too soon
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_REVIEW_PROMPT, Date.now().toString());
  } catch (error) {
    if (__DEV__) {
      console.error('Error recording satisfaction prompt:', error);
    }
  }
}

// ---------------------------------------------------------------------------
// Core review actions
// ---------------------------------------------------------------------------

/**
 * Get the store URL for the app
 */
function getStoreUrl(): string {
  if (Platform.OS === 'ios') {
    return `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
  }
  return `https://play.google.com/store/apps/details?id=${PLAY_STORE_ID}`;
}

/**
 * Open the app store page directly
 */
export async function openStoreForReview(): Promise<boolean> {
  try {
    const url = getStoreUrl();
    const canOpen = await Linking.canOpenURL(url);

    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }
    return false;
  } catch (error) {
    if (__DEV__) {
      console.error('Error opening store for review:', error);
    }
    return false;
  }
}

/**
 * Show the native app review prompt.
 * If fallbackToStore is true and in-app review isn't available, opens the store page.
 */
export async function requestReview(fallbackToStore: boolean = false): Promise<boolean> {
  try {
    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) {
      if (fallbackToStore) {
        return await openStoreForReview();
      }
      return false;
    }

    const canRequest = await StoreReview.hasAction();
    if (!canRequest) {
      if (fallbackToStore) {
        return await openStoreForReview();
      }
      return false;
    }

    await StoreReview.requestReview();
    await recordReviewPromptShown();

    if (__DEV__) {
      console.log('Review prompt shown successfully');
    }
    return true;
  } catch (error) {
    if (__DEV__) {
      console.error('Error requesting review:', error);
    }
    if (fallbackToStore) {
      return await openStoreForReview();
    }
    return false;
  }
}

/**
 * Open feedback email for users who aren't enjoying the app
 */
export async function openFeedbackEmail(): Promise<void> {
  try {
    const subject = encodeURIComponent('Facts A Day Feedback');
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
    await Linking.openURL(url);
  } catch (error) {
    if (__DEV__) {
      console.error('Error opening feedback email:', error);
    }
  }
}

// ---------------------------------------------------------------------------
// Fact view tracking (simplified — no longer triggers review)
// ---------------------------------------------------------------------------

/**
 * Get the current count of facts viewed
 */
export async function getFactsViewedCount(): Promise<number> {
  try {
    const count = await AsyncStorage.getItem(STORAGE_KEYS.FACTS_VIEWED_COUNT);
    return count ? parseInt(count, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Track that a fact has been viewed (increment counter only).
 */
export async function trackFactView(): Promise<void> {
  try {
    const currentCount = await getFactsViewedCount();
    await AsyncStorage.setItem(STORAGE_KEYS.FACTS_VIEWED_COUNT, (currentCount + 1).toString());
  } catch (error) {
    if (__DEV__) {
      console.error('Error tracking fact view:', error);
    }
  }
}

/**
 * Handle fact viewed event — increment counter and maybe show interstitial ad.
 * Review prompts are no longer triggered from here.
 */
export async function onFactViewed(source?: string): Promise<void> {
  try {
    await trackFactView();

    const { maybeShowFactViewInterstitial } = await import('./adManager');
    await maybeShowFactViewInterstitial({ skipThisTime: source === 'notification' });
  } catch (error) {
    if (__DEV__) {
      console.error('Error in onFactViewed:', error);
    }
  }
}

// ---------------------------------------------------------------------------
// Testing utility
// ---------------------------------------------------------------------------

export async function resetReviewTracking(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.FACTS_VIEWED_COUNT,
      STORAGE_KEYS.LAST_REVIEW_PROMPT,
      STORAGE_KEYS.REVIEW_PROMPT_HISTORY,
      STORAGE_KEYS.LAST_SATISFACTION_PROMPT,
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
