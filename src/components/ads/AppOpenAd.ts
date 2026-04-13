import { Platform } from 'react-native';
import { AdEventType, AdsConsent, AppOpenAd, TestIds } from 'react-native-google-mobile-ads';

import Constants from 'expo-constants';

import { AD_KEYWORDS, APP_OPEN_ADS } from '../../config/app';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';
import { trackAppOpenAdShown } from '../../services/analytics';
import { isModalScreenActive } from '../../services/badges';
import { shouldShowAds } from '../../services/premiumState';

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
let lastAppOpenAdShownAt: number = 0;
/**
 * On Android, full-screen ads (interstitial, rewarded) run in a separate Activity.
 * When that Activity closes the app's MainActivity resumes, causing a false
 * background→foreground transition that would immediately fire an app-open ad.
 *
 * Instead of a time-window we use a boolean flag:
 *  1. Set `true` before showing any full-screen ad.
 *  2. On the next foreground transition, if the flag is `true` we skip the
 *     app-open ad and reset the flag so subsequent real foregrounds work normally.
 *
 * This is the pattern recommended in invertase/react-native-google-mobile-ads#102.
 */
let skipNextForegroundAppOpenAd = false;

/**
 * Call this before showing any full-screen ad (interstitial, rewarded) so the
 * false foreground event caused by that ad's Activity closing does not trigger
 * an app-open ad.
 */
export const suppressNextForegroundAppOpenAd = (): void => {
  skipNextForegroundAppOpenAd = true;
};

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
    if (__DEV__) console.log('🚀 App open ad already loading, returning existing promise');
    return pendingLoadPromise;
  }

  pendingLoadPromise = (async () => {
    // Clean up previous listeners before creating a new instance
    if (cleanupLoadListeners) {
      cleanupLoadListeners();
      cleanupLoadListeners = null;
    }

    if (__DEV__) console.log('🚀 Loading app open ad with unit ID:', adUnitId);

    const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();

    appOpenAd = AppOpenAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: nonPersonalized,
      keywords: AD_KEYWORDS,
    });

    const loaded = await new Promise<boolean>((resolve) => {
      const unsubLoaded = appOpenAd!.addAdEventListener(AdEventType.LOADED, () => {
        if (__DEV__) console.log('✅ App open ad loaded');
        adLoadedTimestamp = Date.now();
        unsubLoaded();
        unsubError();
        resolve(true);
      });

      const unsubError = appOpenAd!.addAdEventListener(AdEventType.ERROR, (error) => {
        console.warn('App open ad not filled:', error?.message || error);
        console.warn('App open ad load error:', String(error));
        unsubLoaded();
        unsubError();
        resolve(false);
      });

      appOpenAd!.load();
    });

    if (loaded) {
      // Set up CLOSED listener to preload next ad after dismissal
      const unsubClosed = appOpenAd!.addAdEventListener(AdEventType.CLOSED, () => {
        if (__DEV__) console.log('App open ad closed - preloading next');
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
    if (__DEV__) console.log('⚠️ App open ad expired, reloading');
  }

  // Load (or await in-progress load)
  if (__DEV__) console.log('🔄 App open ad not ready, loading on-demand...');
  return await loadAppOpenAd();
};

/**
 * Show an app open ad when the user changes their app language.
 * If no ad is preloaded, waits for it to load (or awaits an in-progress load).
 * Returns true if the ad was shown, false otherwise.
 */
export const showAppOpenAdForLocaleChange = async (): Promise<boolean> => {
  if (!shouldShowAds()) {
    return false;
  }

  // Check consent
  try {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) {
      if (__DEV__) console.log('⚠️ Cannot show app open ad - no consent');
      return false;
    }
  } catch (error) {
    console.error('Error checking consent:', error);
    return false;
  }

  // Ensure ad is loaded (waits for in-progress load or starts new one)
  const adReady = await ensureAdLoaded();
  if (!adReady || !appOpenAd?.loaded) {
    if (__DEV__) console.log('⚠️ App open ad failed to load, skipping');
    return false;
  }

  try {
    if (__DEV__) console.log('🚀 Showing app open ad for locale change...');

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
        if (__DEV__) {
          console.log('✅ App open ad closed');
          console.log('App open ad dismissed');
        }
        cleanup();
        resolve(true);
      });

      const errorListener = appOpenAd!.addAdEventListener(AdEventType.ERROR, (error) => {
        console.error('⚠️ App open ad error during display:', error);
        console.warn('App open ad show error:', String(error));
        cleanup();
        resolve(false);
      });
    });

    trackAppOpenAdShown('locale_change');
    await appOpenAd!.show();
    const result = await adCompletedPromise;

    // Track when ad was shown for cooldown
    lastAppOpenAdShownAt = Date.now();

    // iOS delay to restore view hierarchy
    if (Platform.OS === 'ios') {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Preload next ad after showing
    loadAppOpenAd().catch(console.error);

    return result;
  } catch (error) {
    console.error('Error showing app open ad:', error);
    console.warn('App open ad show error:', String(error));
    // Try to preload for next time
    loadAppOpenAd().catch(console.error);
    return false;
  }
};

/**
 * Show an app open ad when the app returns to foreground.
 * Enforces a cooldown to avoid showing too frequently.
 */
export const showAppOpenAdOnForeground = async (): Promise<boolean> => {
  if (!shouldShowAds()) {
    return false;
  }

  // Don't show over modals (fact detail, paywall) — causes view controller conflicts
  if (isModalScreenActive()) {
    return false;
  }

  const now = Date.now();

  // Suppress if another full-screen ad was just shown — Android briefly
  // backgrounds the app when that ad's Activity closes, which would otherwise
  // double up with an app-open ad. Reset the flag so the next real foreground
  // transition works normally.
  if (skipNextForegroundAppOpenAd) {
    if (__DEV__) console.log('⏭️ Skipping foreground app-open ad — full-screen ad just shown');
    skipNextForegroundAppOpenAd = false;
    return false;
  }

  // Enforce cooldown
  if (now - lastAppOpenAdShownAt < APP_OPEN_ADS.FOREGROUND_COOLDOWN_MS) {
    return false;
  }

  // Check consent
  try {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) {
      return false;
    }
  } catch (error) {
    console.error('Error checking consent:', error);
    return false;
  }

  // Ensure ad is loaded (waits for in-progress load or starts new one)
  const adReady = await ensureAdLoaded();
  if (!adReady || !appOpenAd?.loaded) {
    return false;
  }

  try {
    if (__DEV__) console.log('🚀 Showing app open ad on foreground...');

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
        if (__DEV__) {
          console.log('✅ App open ad closed (foreground)');
          console.log('App open ad dismissed');
        }
        cleanup();
        resolve(true);
      });

      const errorListener = appOpenAd!.addAdEventListener(AdEventType.ERROR, (error) => {
        console.error('⚠️ App open ad error during display:', error);
        console.warn('App open ad show error:', String(error));
        cleanup();
        resolve(false);
      });
    });

    trackAppOpenAdShown('foreground');
    await appOpenAd!.show();
    const result = await adCompletedPromise;

    // Track when ad was shown for cooldown
    lastAppOpenAdShownAt = Date.now();

    // iOS delay to restore view hierarchy
    if (Platform.OS === 'ios') {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Preload next ad after showing
    loadAppOpenAd().catch(console.error);

    return result;
  } catch (error) {
    console.error('Error showing app open ad on foreground:', error);
    console.warn('App open ad show error:', String(error));
    loadAppOpenAd().catch(console.error);
    return false;
  }
};

/**
 * Preload app open ad (call this when app starts)
 */
export const preloadAppOpenAd = async () => {
  if (__DEV__) console.log('🚀 Preloading app open ad...');

  if (!shouldShowAds()) {
    if (__DEV__) console.log('⚠️ App open ad preload skipped - ads disabled');
    return;
  }

  try {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) {
      if (__DEV__) console.log('⚠️ Cannot preload app open ad - no consent');
      return;
    }
  } catch (error) {
    console.error('Error checking consent for app open ad preload:', error);
    return;
  }

  await loadAppOpenAd();
};
