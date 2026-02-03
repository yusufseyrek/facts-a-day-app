import { Platform } from 'react-native';
import {
  AdEventType,
  AdsConsent,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

import Constants from 'expo-constants';

import { trackRewardedAdError, trackRewardedAdLoaded } from '../../services/analytics';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';
import { canShowRewardedAds } from '../../services/premiumState';

// Get Rewarded Ad Unit ID based on platform
const getRewardedAdUnitId = (): string => {
  const isIOS = Platform.OS === 'ios';

  const iosId = Constants.expoConfig?.extra?.ADMOB_IOS_REWARDED_ID;
  const androidId = Constants.expoConfig?.extra?.ADMOB_ANDROID_REWARDED_ID;

  const defaultTestId = TestIds.REWARDED;

  return isIOS ? iosId || defaultTestId : androidId || defaultTestId;
};

const adUnitId = getRewardedAdUnitId();
let rewarded: RewardedAd | null = null;
let adLoadFailed: boolean = false;
let isLoading: boolean = false;

// Store unsubscribe functions for current listeners
let cleanupLoadListeners: (() => void) | null = null;

// Initialize and load the rewarded ad with consent-based personalization
const loadRewardedAd = async () => {
  if (isLoading) {
    console.log('📺 Rewarded ad already loading, skipping duplicate call');
    return;
  }

  // Clean up previous listeners before creating a new instance
  if (cleanupLoadListeners) {
    cleanupLoadListeners();
    cleanupLoadListeners = null;
  }

  adLoadFailed = false;
  isLoading = true;

  console.log('📺 Loading rewarded ad with unit ID:', adUnitId);

  const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();

  rewarded = RewardedAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: nonPersonalized,
  });

  const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
    console.log('Rewarded ad loaded');
    adLoadFailed = false;
    isLoading = false;
    trackRewardedAdLoaded();
  });

  const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, (error) => {
    console.warn('Rewarded ad not filled:', error?.message || error);
    adLoadFailed = true;
    isLoading = false;
    trackRewardedAdError({ phase: 'load', error: String(error?.message || error) });
  });

  const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
    console.log('Rewarded ad closed - preloading next');
    // Preload next ad after this one is closed
    loadRewardedAd();
  });

  cleanupLoadListeners = () => {
    unsubLoaded();
    unsubError();
    unsubClosed();
  };

  rewarded.load();
};

/**
 * Wait for the rewarded ad to be loaded (with timeout)
 */
const waitForAdToLoad = async (timeoutMs: number = 5000): Promise<boolean> => {
  if (rewarded && rewarded.loaded) {
    return true;
  }

  if (adLoadFailed) {
    // Reset flag and try loading again instead of giving up
    console.log('⚠️ Previous rewarded ad load failed, retrying...');
    await loadRewardedAd();
  } else if (!rewarded && !isLoading) {
    await loadRewardedAd();
  }

  // If it loaded synchronously (unlikely but possible) or already failed again
  if (rewarded && rewarded.loaded) {
    return true;
  }

  if (adLoadFailed) {
    console.log('⚠️ Rewarded ad failed to load on retry');
    return false;
  }

  return new Promise((resolve) => {
    if (!rewarded) {
      resolve(false);
      return;
    }

    let resolved = false;

    const loadedListener = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      console.log('✅ Rewarded ad loaded successfully while waiting');
      cleanup();
      resolve(true);
    });

    const errorListener = rewarded.addAdEventListener(AdEventType.ERROR, (error) => {
      console.warn('Rewarded ad failed to load while waiting:', error?.message || error);
      cleanup();
      resolve(false);
    });

    const timeout = setTimeout(() => {
      console.log('⏱️ Rewarded ad load timeout reached');
      cleanup();
      resolve(false);
    }, timeoutMs);

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        loadedListener();
        errorListener();
      }
    };
  });
};

/**
 * Show a rewarded ad and return whether the reward was earned.
 * Returns true if the user watched the full ad and earned the reward.
 * Returns false if the user dismissed early, ad failed, or consent not given.
 * Note: Available for all users including premium (for extra trivia hints)
 */
export const showRewardedAd = async (): Promise<boolean> => {
  if (!canShowRewardedAds()) {
    return false;
  }

  // Check consent
  try {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) {
      console.log('⚠️ Cannot show rewarded ad - no consent');
      return false;
    }
  } catch (error) {
    console.error('Error checking consent:', error);
    return false;
  }

  console.log('📺 Attempting to show rewarded ad...');

  // Wait for ad to load if not ready (also retries on previous failure)
  if (!rewarded || !rewarded.loaded) {
    console.log('⏳ Rewarded ad not loaded yet, waiting...');
    const loaded = await waitForAdToLoad(5000);
    if (!loaded) {
      console.log('⚠️ Rewarded ad did not load in time, skipping');
      return false;
    }
  }

  if (rewarded && rewarded.loaded) {
    try {
      console.log('🎬 Showing rewarded ad...');

      // iOS delay to prevent view controller conflicts
      if (Platform.OS === 'ios') {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Remove the load-phase CLOSED listener to prevent conflict with the
      // show-phase CLOSED listener below. It will be re-attached when
      // loadRewardedAd() is called to preload the next ad.
      if (cleanupLoadListeners) {
        cleanupLoadListeners();
        cleanupLoadListeners = null;
      }

      // Track whether reward was earned
      let rewardEarned = false;

      const adCompletedPromise = new Promise<boolean>((resolve) => {
        let resolved = false;

        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            rewardListener();
            closeListener();
            errorListener();
          }
        };

        const rewardListener = rewarded!.addAdEventListener(
          RewardedAdEventType.EARNED_REWARD,
          () => {
            console.log('✅ Rewarded ad - reward earned');
            rewardEarned = true;
          }
        );

        const closeListener = rewarded!.addAdEventListener(AdEventType.CLOSED, () => {
          console.log('✅ Rewarded ad closed');
          cleanup();
          resolve(rewardEarned);
        });

        const errorListener = rewarded!.addAdEventListener(AdEventType.ERROR, (error) => {
          console.error('⚠️ Rewarded ad error during display:', error);
          trackRewardedAdError({ phase: 'show', error: String(error?.message || error) });
          cleanup();
          resolve(false);
        });
      });

      await rewarded.show();
      const result = await adCompletedPromise;

      // iOS delay to restore view hierarchy
      if (Platform.OS === 'ios') {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Preload next ad after showing
      loadRewardedAd().catch(console.error);

      return result;
    } catch (error) {
      console.error('Error showing rewarded ad:', error);
      // Try to preload for next time
      loadRewardedAd().catch(console.error);
      return false;
    }
  } else {
    console.log('⚠️ Rewarded ad still not loaded, loading for next time');
    loadRewardedAd().catch(console.error);
    return false;
  }
};

/**
 * Check if a rewarded ad is currently loaded and ready to show
 */
export const isRewardedAdLoaded = (): boolean => {
  return !!rewarded && rewarded.loaded && !adLoadFailed;
};

/**
 * Preload rewarded ad (call this when app starts)
 * Note: Available for all users including premium (for extra trivia hints)
 */
export const preloadRewardedAd = async () => {
  console.log('📺 Preloading rewarded ad...');

  if (!canShowRewardedAds()) {
    console.log('⚠️ Rewarded ad preload skipped - ads disabled');
    return;
  }

  try {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) {
      console.log('⚠️ Cannot preload rewarded ad - no consent');
      return;
    }
  } catch (error) {
    console.error('Error checking consent for rewarded ad preload:', error);
    return;
  }

  await loadRewardedAd();
};
