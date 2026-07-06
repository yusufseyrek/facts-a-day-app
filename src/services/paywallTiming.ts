import AsyncStorage from '@react-native-async-storage/async-storage';

import { PAYWALL_PROMPT, STORAGE_KEYS } from '../config/app';

/**
 * Whether the automatic (cold-start) paywall prompt is due.
 *
 * - First launch (no record): seeds the cooldown clock to "now" and returns
 *   false, so a brand-new user gets a full MIN_DAYS_BETWEEN_PROMPTS grace period
 *   before the first auto-prompt instead of being paywalled on day one.
 * - Otherwise: due once MIN_DAYS_BETWEEN_PROMPTS have elapsed since the paywall
 *   was last shown — auto OR manual, because every paywall mount calls
 *   markPaywallShown(), so opening it from settings also resets the timer.
 * - Always false in __DEV__ and on any storage error (fail closed — never nag).
 */
export async function shouldShowPaywall(): Promise<boolean> {
  if (__DEV__) return false;

  try {
    const lastShown = await AsyncStorage.getItem(STORAGE_KEYS.PAYWALL_LAST_SHOWN);

    // First launch — start the clock now so the first prompt is deferred a full
    // interval (grace period) rather than firing on day one.
    if (!lastShown) {
      await markPaywallShown();
      return false;
    }

    const daysSince = (Date.now() - parseInt(lastShown, 10)) / (1000 * 60 * 60 * 24);
    return daysSince >= PAYWALL_PROMPT.MIN_DAYS_BETWEEN_PROMPTS;
  } catch {
    // Only reachable in production (dev short-circuits above). Fail closed —
    // never nag on a storage hiccup.
    return false;
  }
}

/**
 * Record that the paywall was shown, resetting the cooldown timer. Called on
 * every paywall mount (auto and manual) and to seed the clock on first launch.
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
