import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  InterstitialAd,
  AdEventType,
  TestIds,
  AdsConsent,
} from 'react-native-google-mobile-ads';
import Constants from 'expo-constants';
import { ADS_ENABLED } from '../../config/ads';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';

// Get Interstitial Ad Unit ID based on platform
const getInterstitialAdUnitId = (): string => {
  const isIOS = Platform.OS === 'ios';

  // Get configured Ad Unit ID from app.json
  const iosId = Constants.expoConfig?.extra?.ADMOB_IOS_INTERSTITIAL_ID;
  const androidId = Constants.expoConfig?.extra?.ADMOB_ANDROID_INTERSTITIAL_ID;

  // Use test ID if real ID not configured
  const defaultTestId = TestIds.INTERSTITIAL;

  return isIOS ? (iosId || defaultTestId) : (androidId || defaultTestId);
};

// Create the interstitial ad instance
const adUnitId = getInterstitialAdUnitId();
let interstitial: InterstitialAd | null = null;

// Initialize and load the interstitial ad with consent-based personalization
const loadInterstitialAd = async () => {
  // Check consent status to determine if we should request non-personalized ads
  const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();

  if (!interstitial) {
    interstitial = InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: nonPersonalized,
    });

    // Set up event listeners
    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      console.log('Interstitial ad loaded');
    });

    interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
      console.error('Interstitial ad error:', error);
    });

    interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      console.log('Interstitial ad closed');
      // Preload next ad
      loadInterstitialAd();
    });
  }

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
 * @returns true if ad loaded, false if timeout
 */
const waitForAdToLoad = async (timeoutMs: number = 5000): Promise<boolean> => {
  // If already loaded, resolve immediately
  if (interstitial && interstitial.loaded) {
    return true;
  }

  // If no interstitial instance, try to create and load one
  if (!interstitial) {
    await loadInterstitialAd();
  }

  return new Promise((resolve) => {
    // Set up timeout
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
  
  // If ad not loaded yet, wait for it (with timeout)
  if (!interstitial || !interstitial.loaded) {
    console.log('⏳ Ad not loaded yet, waiting...');
    const loaded = await waitForAdToLoad(5000); // Wait up to 5 seconds
    if (!loaded) {
      console.log('⚠️ Ad did not load in time, skipping');
      return;
    }
  }

  if (interstitial && interstitial.loaded) {
    try {
      console.log('🎬 Showing interstitial ad...');
      
      // Create a promise that resolves when the ad is closed
      const adClosedPromise = new Promise<void>((resolve) => {
        const closeListener = interstitial!.addAdEventListener(AdEventType.CLOSED, () => {
          closeListener(); // Remove listener
          resolve();
        });
      });

      // Show the ad
      await interstitial.show();

      // Wait for the ad to be closed
      await adClosedPromise;

      console.log('✅ Interstitial ad closed');

      // Add a small delay on iOS to ensure the view hierarchy is fully restored
      // This prevents the settings screen from becoming unclickable
      if (Platform.OS === 'ios') {
        await new Promise(resolve => setTimeout(resolve, 300));
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
