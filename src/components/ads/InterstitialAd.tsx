import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { AdEventType, AdsConsent,InterstitialAd, TestIds } from 'react-native-google-mobile-ads';

import Constants from 'expo-constants';

import { ADS_ENABLED } from '../../config/ads';
import { getAdKeywords } from '../../services/adKeywords';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';

// Get Interstitial Ad Unit ID based on platform
const getInterstitialAdUnitId = (): string => {
  const isIOS = Platform.OS === 'ios';

  // Get configured Ad Unit ID from app.json
  const iosId = Constants.expoConfig?.extra?.ADMOB_IOS_INTERSTITIAL_ID;
  const androidId = Constants.expoConfig?.extra?.ADMOB_ANDROID_INTERSTITIAL_ID;

  // Use test ID if real ID not configured
  const defaultTestId = TestIds.INTERSTITIAL;

  return isIOS ? iosId || defaultTestId : androidId || defaultTestId;
};

// Create the interstitial ad instance
const adUnitId = getInterstitialAdUnitId();
let interstitial: InterstitialAd | null = null;
let adLoadFailed: boolean = false; // Track if ad failed to load (e.g., no-fill)

// Initialize and load the interstitial ad with consent-based personalization
const loadInterstitialAd = async () => {
  // Reset failed state when attempting to load
  adLoadFailed = false;

  // Check consent status to determine if we should request non-personalized ads
  const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();

  // Get current keywords for ad targeting (fresh keywords each load)
  const keywords = getAdKeywords();

  // TODO: Remove after testing
  console.log('[InterstitialAd] Loading with keywords:', keywords);

  // Always recreate the interstitial to use fresh keywords
  // The previous instance will be garbage collected
  interstitial = InterstitialAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: nonPersonalized,
    keywords,
  });

  // Set up event listeners
  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    console.log('Interstitial ad loaded');
    adLoadFailed = false;
  });

  interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
    console.error('Interstitial ad error:', error);
    adLoadFailed = true;
  });

  interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    console.log('Interstitial ad closed');
    // Preload next ad (will get fresh keywords)
    loadInterstitialAd();
  });

  // Load the ad
  interstitial.load();
};

// Hook to use interstitial ads
export const useInterstitialAd = () => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Initialize and load the first ad
    loadInterstitialAd().catch(console.error);

    // Set up listener to update loaded state
    if (interstitial) {
      const loadedListener = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        setIsLoaded(true);
      });

      const closedListener = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        setIsLoaded(false);
      });

      return () => {
        loadedListener();
        closedListener();
      };
    }
  }, []);

  const showAd = async (): Promise<boolean> => {
    if (interstitial && isLoaded) {
      try {
        await interstitial.show();
        return true;
      } catch (error) {
        console.error('Error showing interstitial ad:', error);
        return false;
      }
    }
    return false;
  };

  return { showAd, isLoaded };
};

/**
 * Wait for the interstitial ad to be loaded (with timeout)
 * @param timeoutMs Maximum time to wait for ad to load
 * @returns true if ad loaded, false if timeout or error
 */
const waitForAdToLoad = async (timeoutMs: number = 3000): Promise<boolean> => {
  // If already loaded, resolve immediately
  if (interstitial && interstitial.loaded) {
    return true;
  }

  // If ad already failed to load (e.g., no-fill), skip waiting
  if (adLoadFailed) {
    console.log('⚠️ Ad already failed to load, skipping wait');
    return false;
  }

  // If no interstitial instance, try to create and load one
  if (!interstitial) {
    await loadInterstitialAd();
  }

  // Check again after loading attempt - if it failed immediately, don't wait
  if (adLoadFailed) {
    console.log('⚠️ Ad failed to load immediately, skipping wait');
    return false;
  }

  return new Promise((resolve) => {
    // Set up timeout (reduced from 5s to 3s for better UX)
    const timeout = setTimeout(() => {
      console.log('⏱️ Ad load timeout reached');
      resolve(false);
    }, timeoutMs);

    // Set up load listener
    if (interstitial) {
      const loadedListener = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        clearTimeout(timeout);
        loadedListener(); // Remove listener
        console.log('✅ Ad loaded successfully while waiting');
        resolve(true);
      });

      const errorListener = interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
        clearTimeout(timeout);
        errorListener(); // Remove listener
        console.error('❌ Ad failed to load while waiting:', error);
        resolve(false);
      });
    } else {
      clearTimeout(timeout);
      resolve(false);
    }
  });
};

// Export function to show interstitial ad (for use without hook)
export const showInterstitialAd = async (): Promise<void> => {
  // Don't show ads if globally disabled
  if (!ADS_ENABLED) {
    return;
  }

  // Check if user has given consent to show ads
  try {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) {
      console.log('⚠️ Cannot show interstitial ad - no consent');
      return;
    }
  } catch (error) {
    console.error('Error checking consent:', error);
    return;
  }

  console.log('📺 Attempting to show interstitial ad...');

  // If ad already failed to load, skip immediately without waiting
  if (adLoadFailed) {
    console.log('⚠️ Ad already failed to load (no-fill), skipping immediately');
    return;
  }

  // If ad not loaded yet, wait for it (with timeout)
  if (!interstitial || !interstitial.loaded) {
    console.log('⏳ Ad not loaded yet, waiting...');
    const loaded = await waitForAdToLoad(3000); // Wait up to 3 seconds
    if (!loaded) {
      console.log('⚠️ Ad did not load in time, skipping');
      return;
    }
  }

  if (interstitial && interstitial.loaded) {
    try {
      console.log('🎬 Showing interstitial ad...');

      // Create a promise that resolves when the ad is closed OR errors
      // This prevents hanging if the ad fails to display (e.g., view controller conflict)
      const adClosedPromise = new Promise<void>((resolve) => {
        let resolved = false;

        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            closeListener();
            errorListener();
            resolve();
          }
        };

        const closeListener = interstitial!.addAdEventListener(AdEventType.CLOSED, () => {
          console.log('✅ Interstitial ad closed');
          cleanup();
        });

        // Also listen for errors during ad display
        const errorListener = interstitial!.addAdEventListener(AdEventType.ERROR, (error) => {
          console.error('⚠️ Interstitial ad error during display:', error);
          cleanup();
        });
      });

      // Show the ad
      await interstitial.show();

      // Wait for the ad to be closed or error out
      await adClosedPromise;

      // Add a small delay on iOS to ensure the view hierarchy is fully restored
      // This prevents the settings screen from becoming unclickable
      if (Platform.OS === 'ios') {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error('Error showing interstitial ad:', error);
    }
  } else {
    // If ad still not loaded, load it for next time
    console.log('⚠️ Ad still not loaded, loading for next time');
    loadInterstitialAd().catch(console.error);
  }
};

// Preload interstitial ad (call this when app starts)
export const preloadInterstitialAd = async () => {
  // Don't preload ads if globally disabled
  if (!ADS_ENABLED) {
    return;
  }

  // Check if user has given consent before preloading
  try {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) {
      console.log('⚠️ Cannot preload interstitial ad - no consent');
      return;
    }
  } catch (error) {
    console.error('Error checking consent for preload:', error);
    return;
  }

  await loadInterstitialAd();
};
