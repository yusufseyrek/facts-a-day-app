import { Platform } from 'react-native';
import {
  AdEventType,
  AdsConsent,
  AppOpenAd,
  TestIds,
} from 'react-native-google-mobile-ads';

import Constants from 'expo-constants';

import { ADS_ENABLED, APP_OPEN_ADS } from '../../config/app';
import {
  trackAppOpenAdDismissed,
  trackAppOpenAdError,
  trackAppOpenAdLoaded,
  trackAppOpenAdShown,
} from '../../services/analytics';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';

// Get App Open Ad Unit ID based on platform
const getAppOpenAdUnitId = (): string => {
  const isIOS = Platform.OS === 'ios';

  const iosId = Constants.expoConfig?.extra?.ADMOB_IOS_APP_OPEN_ID;
  const androidId = Constants.expoConfig?.extra?.ADMOB_ANDROID_APP_OPEN_ID;

  const defaultTestId = TestIds.APP_OPEN;

  return isIOS ? iosId || defaultTestId : androidId || defaultTestId;
};

const adUnitId = getAppOpenAdUnitId();
let appOpenAd: AppOpenAd | null = null;
let adLoadFailed: boolean = false;
let isLoading: boolean = false;
let adLoadedTimestamp: number = 0;

// Store unsubscribe functions for current listeners
let cleanupLoadListeners: (() => void) | null = null;

// Initialize and load the app open ad with consent-based personalization
const loadAppOpenAd = async () => {
  if (isLoading) {
    console.log('🚀 App open ad already loading, skipping duplicate call');
    return;
  }

  // Clean up previous listeners before creating a new instance
  if (cleanupLoadListeners) {
    cleanupLoadListeners();
    cleanupLoadListeners = null;
  }

  adLoadFailed = false;
  isLoading = true;

  console.log('🚀 Loading app open ad with unit ID:', adUnitId);

  const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();

  appOpenAd = AppOpenAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: nonPersonalized,
  });

  const unsubLoaded = appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
    console.log('App open ad loaded');
    adLoadFailed = false;
    isLoading = false;
    adLoadedTimestamp = Date.now();
    trackAppOpenAdLoaded();
  });

  const unsubError = appOpenAd.addAdEventListener(AdEventType.ERROR, (error) => {
    console.error('App open ad error:', error);
    adLoadFailed = true;
    isLoading = false;
    trackAppOpenAdError({ phase: 'load', error: String(error) });
  });

  const unsubClosed = appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
    console.log('App open ad closed - preloading next');
    // Preload next ad after this one is closed
    loadAppOpenAd();
  });

  cleanupLoadListeners = () => {
    unsubLoaded();
    unsubError();
    unsubClosed();
  };

  appOpenAd.load();
};

/**
 * Check if the loaded ad has expired (older than 4 hours)
 */
const isAdExpired = (): boolean => {
  if (adLoadedTimestamp === 0) return true;
  return Date.now() - adLoadedTimestamp > APP_OPEN_ADS.AD_EXPIRY_MS;
};

/**
 * Show an app open ad when user returns from background.
 * Returns true if the ad was shown, false otherwise.
 */
export const showAppOpenAd = async (backgroundSeconds: number): Promise<boolean> => {
  if (!ADS_ENABLED || !APP_OPEN_ADS.ACTIVE) {
    return false;
  }

  // Check consent
  try {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) {
      console.log('⚠️ Cannot show app open ad - no consent');
      return false;
    }
  } catch (error) {
    console.error('Error checking consent:', error);
    return false;
  }

  // Check if ad is loaded
  if (!appOpenAd || !appOpenAd.loaded) {
    console.log('⚠️ App open ad not loaded, loading for next time');
    loadAppOpenAd().catch(console.error);
    return false;
  }

  // Check if ad has expired
  if (isAdExpired()) {
    console.log('⚠️ App open ad expired, reloading');
    loadAppOpenAd().catch(console.error);
    return false;
  }

  try {
    console.log('🚀 Showing app open ad...');

    // iOS delay to prevent view controller conflicts
    if (Platform.OS === 'ios') {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Remove the load-phase CLOSED listener to prevent conflict
    if (cleanupLoadListeners) {
      cleanupLoadListeners();
      cleanupLoadListeners = null;
    }

    const adCompletedPromise = new Promise<boolean>((resolve) => {
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          closeListener();
          errorListener();
        }
      };

      const closeListener = appOpenAd!.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('✅ App open ad closed');
        trackAppOpenAdDismissed();
        cleanup();
        resolve(true);
      });

      const errorListener = appOpenAd!.addAdEventListener(AdEventType.ERROR, (error) => {
        console.error('⚠️ App open ad error during display:', error);
        trackAppOpenAdError({ phase: 'show', error: String(error) });
        cleanup();
        resolve(false);
      });
    });

    trackAppOpenAdShown({ backgroundSeconds: Math.round(backgroundSeconds) });
    await appOpenAd.show();
    const result = await adCompletedPromise;

    // iOS delay to restore view hierarchy
    if (Platform.OS === 'ios') {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Preload next ad after showing
    loadAppOpenAd().catch(console.error);

    return result;
  } catch (error) {
    console.error('Error showing app open ad:', error);
    trackAppOpenAdError({ phase: 'show', error: String(error) });
    // Try to preload for next time
    loadAppOpenAd().catch(console.error);
    return false;
  }
};

/**
 * Preload app open ad (call this when app starts)
 */
export const preloadAppOpenAd = async () => {
  console.log('🚀 Preloading app open ad...');

  if (!ADS_ENABLED || !APP_OPEN_ADS.ACTIVE) {
    console.log('⚠️ App open ad preload skipped - ads disabled');
    return;
  }

  try {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) {
      console.log('⚠️ Cannot preload app open ad - no consent');
      return;
    }
  } catch (error) {
    console.error('Error checking consent for app open ad preload:', error);
    return;
  }

  await loadAppOpenAd();
};
