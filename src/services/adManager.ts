import AsyncStorage from '@react-native-async-storage/async-storage';
import { showInterstitialAd } from '../components/ads/InterstitialAd';
import { ADS_ENABLED, FACTS_BEFORE_INTERSTITIAL } from '../config/ads';
import { trackInterstitialShown, type InterstitialSource } from './analytics';

// Storage keys
const FACT_VIEW_COUNT_KEY = '@fact_view_count';
const LAST_INTERSTITIAL_DATE_KEY = '@last_interstitial_date';

/**
 * Track fact view and show interstitial ad if threshold is reached
 */
export const trackFactView = async (): Promise<void> => {
  // Don't track or show ads if globally disabled
  if (!ADS_ENABLED) {
    return;
  }

  try {
    // Get current count
    const countStr = await AsyncStorage.getItem(FACT_VIEW_COUNT_KEY);
    const count = countStr ? parseInt(countStr, 10) : 0;

    // Increment count
    const newCount = count + 1;

    // Check if we should show interstitial
    if (newCount >= FACTS_BEFORE_INTERSTITIAL) {
      // Show interstitial ad
      await showInterstitialAd();
      trackInterstitialShown('fact_view');

      // Reset count
      await AsyncStorage.setItem(FACT_VIEW_COUNT_KEY, '0');
      await AsyncStorage.setItem(LAST_INTERSTITIAL_DATE_KEY, new Date().toISOString());
    } else {
      // Update count
      await AsyncStorage.setItem(FACT_VIEW_COUNT_KEY, newCount.toString());
    }
  } catch (error) {
    console.error('Error tracking fact view:', error);
  }
};

/**
 * Reset fact view count (useful for testing)
 */
export const resetFactViewCount = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(FACT_VIEW_COUNT_KEY, '0');
  } catch (error) {
    console.error('Error resetting fact view count:', error);
  }
};

/**
 * Get current fact view count
 */
export const getFactViewCount = async (): Promise<number> => {
  try {
    const countStr = await AsyncStorage.getItem(FACT_VIEW_COUNT_KEY);
    return countStr ? parseInt(countStr, 10) : 0;
  } catch (error) {
    console.error('Error getting fact view count:', error);
    return 0;
  }
};

/**
 * Show interstitial ad before settings change
 */
export const showSettingsInterstitial = async (): Promise<void> => {
  // Don't show ads if globally disabled
  if (!ADS_ENABLED) {
    return;
  }

  try {
    await showInterstitialAd();
    trackInterstitialShown('settings');
  } catch (error) {
    console.error('Error showing settings interstitial:', error);
  }
};
