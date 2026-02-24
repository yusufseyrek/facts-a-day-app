import AsyncStorage from '@react-native-async-storage/async-storage';

import { PAYWALL_PROMPT, STORAGE_KEYS } from '../config/app';

/**
 * Check if the automatic paywall prompt should be shown.
 * Returns false on first install (grace period) and when within the cooldown window.
 */
export async function shouldShowPaywall(): Promise<boolean> {
  if (__DEV__) return false;

  try {
    const lastShown = await AsyncStorage.getItem(STORAGE_KEYS.PAYWALL_LAST_SHOWN);

    // Never shown before (fresh install / post-onboarding) — show immediately
    if (!lastShown) return true;

    const daysSince = (Date.now() - parseInt(lastShown, 10)) / (1000 * 60 * 60 * 24);
    return daysSince >= PAYWALL_PROMPT.MIN_DAYS_BETWEEN_PROMPTS;
  } catch (error) {
    if (__DEV__) {
      console.error('Error checking paywall timing:', error);
    }
    return false;
  }
}

/**
 * Record that the paywall was shown, resetting the cooldown timer.
 */
export async function markPaywallShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PAYWALL_LAST_SHOWN, Date.now().toString());
  } catch (error) {
    if (__DEV__) {
      console.error('Error marking paywall shown:', error);
    }
  }
}
