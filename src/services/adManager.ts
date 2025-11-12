import AsyncStorage from '@react-native-async-storage/async-storage';
import { showInterstitialAd } from '../components/ads/InterstitialAd';
import { ADS_ENABLED } from '../config/ads';

// Storage keys
const FACT_VIEW_COUNT_KEY = '@fact_view_count';
const LAST_INTERSTITIAL_DATE_KEY = '@last_interstitial_date';

// Configuration
const FACTS_BEFORE_INTERSTITIAL = 3; // Show interstitial after every 3 fact views

/**
 * Track fact view and show interstitial ad if threshold is reached
 * @param isPremium - Whether user is premium (to skip ads)
 */
export const trackFactView = async (isPremium: boolean): Promise<void> => {
  // Don't track or show ads if globally disabled
  if (!ADS_ENABLED) {
    return;
  }

  // Don't track or show ads for premium users
  if (isPremium) {
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
      await showInterstitialAd(isPremium);

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
 * Reset fact view count (useful for testing or when user becomes premium)
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
 * @param isPremium - Whether user is premium (to skip ads)
 */
export const showSettingsInterstitial = async (isPremium: boolean): Promise<void> => {
  // Don't show ads if globally disabled
  if (!ADS_ENABLED) {
    return;
  }

  // Don't show ads for premium users
  if (isPremium) {
    return;
  }

  try {
    await showInterstitialAd(isPremium);
  } catch (error) {
    console.error('Error showing settings interstitial:', error);
  }
};
