import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import Constants from 'expo-constants';

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

// Initialize and load the interstitial ad
const loadInterstitialAd = () => {
  if (!interstitial) {
    interstitial = InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: false,
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
    loadInterstitialAd();

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

// Export function to show interstitial ad (for use without hook)
export const showInterstitialAd = async (isPremium: boolean): Promise<void> => {
  // Don't show ads for premium users
  if (isPremium) {
    return;
  }

  if (interstitial && interstitial.loaded) {
    try {
      await interstitial.show();
    } catch (error) {
      console.error('Error showing interstitial ad:', error);
    }
  } else {
    // If ad not loaded yet, load it for next time
    loadInterstitialAd();
  }
};

// Preload interstitial ad (call this when app starts)
export const preloadInterstitialAd = () => {
  loadInterstitialAd();
};
