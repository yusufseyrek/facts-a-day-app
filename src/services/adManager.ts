import AsyncStorage from '@react-native-async-storage/async-storage';

import { showInterstitialAd } from '../components/ads/InterstitialAd';
import { INTERSTITIAL_ADS, STORAGE_KEYS } from '../config/app';

import { type InterstitialSource, trackInterstitialShown } from './analytics';
import { shouldShowAds } from './premiumState';

/** Timestamp of the last interstitial ad shown (ms) */
let lastInterstitialShownAt = 0;

/**
 * Check if enough time has passed since the last interstitial
 */
const isCooldownElapsed = (): boolean => {
  if (lastInterstitialShownAt === 0) return true;
  const elapsed = (Date.now() - lastInterstitialShownAt) / 1000;
  return elapsed >= INTERSTITIAL_ADS.COOLDOWN_SECONDS;
};

/**
 * Show an interstitial ad if cooldown has elapsed, updating the cooldown timer on success.
 * Returns true if an ad was shown.
 */
const maybeShowInterstitial = async (source: InterstitialSource): Promise<boolean> => {
  if (!INTERSTITIAL_ADS.ENABLED) return false;
  if (!shouldShowAds()) return false;
  if (!isCooldownElapsed()) return false;

  try {
    await showInterstitialAd();
    lastInterstitialShownAt = Date.now();
    trackInterstitialShown(source);
    return true;
  } catch (error) {
    console.error(`Error showing ${source} interstitial:`, error);
    return false;
  }
};

/**
 * Increment a persistent integer counter in AsyncStorage and return the new value.
 */
const incrementCounter = async (key: string): Promise<number> => {
  const raw = await AsyncStorage.getItem(key);
  const next = (raw ? parseInt(raw, 10) || 0 : 0) + 1;
  await AsyncStorage.setItem(key, next.toString());
  return next;
};

/**
 * Show interstitial ad after a trivia game completion.
 * Fires every Nth completion (configured in INTERSTITIAL_ADS.TRIVIAS_BETWEEN_ADS)
 * and respects the global cooldown.
 */
export const maybeShowTriviaResultsInterstitial = async (): Promise<boolean> => {
  if (!INTERSTITIAL_ADS.ENABLED) return false;
  if (!shouldShowAds()) return false;

  try {
    const count = await incrementCounter(STORAGE_KEYS.TRIVIAS_COMPLETED_COUNT);
    if (count > 0 && count % INTERSTITIAL_ADS.TRIVIAS_BETWEEN_ADS === 0) {
      return await maybeShowInterstitial('trivia_results');
    }
    return false;
  } catch (error) {
    console.error('Error showing trivia results interstitial:', error);
    return false;
  }
};

/**
 * Show interstitial ad after a category-save action.
 * Fires every Nth save (configured in INTERSTITIAL_ADS.CATEGORY_CHANGES_BETWEEN_ADS)
 * and respects the global cooldown.
 */
export const maybeShowCategoryChangeInterstitial = async (): Promise<boolean> => {
  if (!INTERSTITIAL_ADS.ENABLED) return false;
  if (!shouldShowAds()) return false;

  try {
    const count = await incrementCounter(STORAGE_KEYS.CATEGORY_CHANGES_COUNT);
    if (count > 0 && count % INTERSTITIAL_ADS.CATEGORY_CHANGES_BETWEEN_ADS === 0) {
      return await maybeShowInterstitial('settings');
    }
    return false;
  } catch (error) {
    console.error('Error showing category change interstitial:', error);
    return false;
  }
};

