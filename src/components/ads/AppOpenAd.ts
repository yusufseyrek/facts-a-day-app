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
let adLoadedTimestamp: number = 0;

// Store unsubscribe functions for current listeners
let cleanupLoadListeners: (() => void) | null = null;

// Shared promise so multiple callers can await the same in-progress load
let pendingLoadPromise: Promise<boolean> | null = null;

/**
 * Load the app open ad and return a promise that resolves when loaded.
 * If a load is already in progress, returns the existing promise so callers
 * can await the same load instead of starting a duplicate.
 */
const loadAppOpenAd = (): Promise<boolean> => {
  // If already loading, return existing promise so callers can await it
  if (pendingLoadPromise) {
    console.log('🚀 App open ad already loading, returning existing promise');
    return pendingLoadPromise;
  }

  pendingLoadPromise = (async () => {
    // Clean up previous listeners before creating a new instance
    if (cleanupLoadListeners) {
      cleanupLoadListeners();
      cleanupLoadListeners = null;
    }

    console.log('🚀 Loading app open ad with unit ID:', adUnitId);

    const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();

    appOpenAd = AppOpenAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: nonPersonalized,
    });

    const loaded = await new Promise<boolean>((resolve) => {
      const unsubLoaded = appOpenAd!.addAdEventListener(AdEventType.LOADED, () => {
        console.log('✅ App open ad loaded');
        adLoadedTimestamp = Date.now();
        trackAppOpenAdLoaded();
        unsubLoaded();
        unsubError();
        resolve(true);
      });

      const unsubError = appOpenAd!.addAdEventListener(AdEventType.ERROR, (error) => {
        console.error('App open ad load error:', error);
        trackAppOpenAdError({ phase: 'load', error: String(error) });
        unsubLoaded();
        unsubError();
        resolve(false);
      });

      appOpenAd!.load();
    });

    if (loaded) {
      // Set up CLOSED listener to preload next ad after dismissal
      const unsubClosed = appOpenAd!.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('App open ad closed - preloading next');
        loadAppOpenAd().catch(console.error);
      });

      cleanupLoadListeners = () => {
        unsubClosed();
      };
    }

    return loaded;
  })();

  // Clear the pending promise when done (success or failure)
  pendingLoadPromise.finally(() => {
    pendingLoadPromise = null;
  });

  return pendingLoadPromise;
};

/**
 * Check if the loaded ad has expired (older than 4 hours)
 */
const isAdExpired = (): boolean => {
  if (adLoadedTimestamp === 0) return true;
  return Date.now() - adLoadedTimestamp > APP_OPEN_ADS.AD_EXPIRY_MS;
};

/**
 * Ensure an ad is loaded and ready to show.
 * Waits for an in-progress load or starts a new one if needed.
 * Returns true if an ad is ready to show.
 */
const ensureAdLoaded = async (): Promise<boolean> => {
  // If ad is already loaded and not expired, it's ready
  if (appOpenAd?.loaded && !isAdExpired()) {
    return true;
  }

  // If expired, we need a fresh load
  if (appOpenAd?.loaded && isAdExpired()) {
    console.log('⚠️ App open ad expired, reloading');
  }

  // Load (or await in-progress load)
  console.log('🔄 App open ad not ready, loading on-demand...');
  return await loadAppOpenAd();
};

/**
 * Show an app open ad when the user changes their app language.
 * If no ad is preloaded, waits for it to load (or awaits an in-progress load).
 * Returns true if the ad was shown, false otherwise.
 */
export const showAppOpenAdForLocaleChange = async (): Promise<boolean> => {
  if (!ADS_ENABLED) {
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

  // Ensure ad is loaded (waits for in-progress load or starts new one)
  const adReady = await ensureAdLoaded();
  if (!adReady || !appOpenAd?.loaded) {
    console.log('⚠️ App open ad failed to load, skipping');
    return false;
  }

  try {
    console.log('🚀 Showing app open ad for locale change...');

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

    trackAppOpenAdShown();
    await appOpenAd!.show();
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

  if (!ADS_ENABLED) {
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
