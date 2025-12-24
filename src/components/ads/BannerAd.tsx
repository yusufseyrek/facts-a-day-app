import React, { useEffect, useState, useCallback, memo, useRef } from 'react';
import { Platform, View, StyleSheet, LayoutAnimation } from 'react-native';
import { BannerAd as GoogleBannerAd, BannerAdSize, TestIds, AdsConsent } from 'react-native-google-mobile-ads';
import Constants from 'expo-constants';
import { ADS_ENABLED } from '../../config/ads';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';

type BannerAdPosition = 'home' | 'fact-modal';

interface BannerAdProps {
  position: BannerAdPosition;
  onAdLoadChange?: (loaded: boolean) => void;
}

// Retry configuration
const RETRY_DELAYS = [30000, 60000, 120000, 240000, 480000]; // Retry after 30s, 1min, 2min, 4min, 8min
const MAX_RETRIES = 5;

// Get Ad Unit IDs based on position and platform
const getAdUnitId = (position: BannerAdPosition): string => {
  const isIOS = Platform.OS === 'ios';

  // Get configured Ad Unit IDs from app.json
  const homeIOS = Constants.expoConfig?.extra?.ADMOB_IOS_HOME_BANNER_ID;
  const modalIOS = Constants.expoConfig?.extra?.ADMOB_IOS_MODAL_BANNER_ID;
  
  const homeAndroid = Constants.expoConfig?.extra?.ADMOB_ANDROID_HOME_BANNER_ID;
  const modalAndroid = Constants.expoConfig?.extra?.ADMOB_ANDROID_MODAL_BANNER_ID;

  // Use test IDs if real IDs not configured
  const defaultTestId = TestIds.BANNER;

  if (isIOS) {
    switch (position) {
      case 'home':
        return homeIOS || defaultTestId;
      case 'fact-modal':
        return modalIOS || defaultTestId;
    }
  } else {
    switch (position) {
      case 'home':
        return homeAndroid || defaultTestId;
      case 'fact-modal':
        return modalAndroid || defaultTestId;
  }}
};

// Get banner size based on position
const getBannerSize = (position: BannerAdPosition): BannerAdSize => {
  switch (position) {
    case 'fact-modal':
      // Inline adaptive banner - shown between content parts
      return BannerAdSize.INLINE_ADAPTIVE_BANNER;
    case 'home':
    default:
      // Anchored adaptive banner for main screens
      return BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
  }
};

type AdState = 'loading' | 'loaded' | 'error';

const BannerAdComponent: React.FC<BannerAdProps> = ({ position, onAdLoadChange }) => {
  const [canRequestAds, setCanRequestAds] = useState<boolean | null>(null);
  const [requestNonPersonalized, setRequestNonPersonalized] = useState<boolean>(true);
  const [adState, setAdState] = useState<AdState>('loading');
  const [retryCount, setRetryCount] = useState(0);
  
  // Key to force remount the ad component for retry
  const [adKey, setAdKey] = useState(0);
  
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const checkConsent = async () => {
      try {
        // Check if we can request ads at all
        const info = await AdsConsent.getConsentInfo();
        setCanRequestAds(info.canRequestAds);

        // If we can request ads, check if they should be non-personalized
        if (info.canRequestAds) {
          const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();
          setRequestNonPersonalized(nonPersonalized);
        }
      } catch (error) {
        console.error('Error checking consent for banner ad:', error);
        setCanRequestAds(false);
      }
    };

    checkConsent();
  }, []);

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Notify parent when ad load state changes
  useEffect(() => {
    onAdLoadChange?.(adState === 'loaded');
  }, [adState, onAdLoadChange]);

  // Memoized callbacks to prevent re-renders during scroll
  const handleAdLoaded = useCallback(() => {
    // Use a subtle layout animation for height change to prevent jarring layout shifts
    LayoutAnimation.configureNext({
      duration: 150,
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    });
    setAdState('loaded');
    setRetryCount(0); // Reset retry count on success
  }, []);

  const handleAdFailedToLoad = useCallback((error: any) => {
    console.warn(`Banner ad (${position}) failed to load:`, error?.message || error);
    
    // Animate the collapse
    LayoutAnimation.configureNext({
      duration: 150,
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    });
    
    setAdState('error');
    
    // Schedule a retry if we haven't exceeded max retries
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      
      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        setAdState('loading');
        // Change the key to force remount the GoogleBannerAd component
        setAdKey(prev => prev + 1);
      }, delay);
    }
  }, [position, retryCount]);

  // Don't show ads if globally disabled or consent not given
  if (!ADS_ENABLED || canRequestAds === false) {
    return null;
  }

  // Don't render until we know consent status
  if (canRequestAds === null) {
    return null;
  }

  const adUnitId = getAdUnitId(position);
  const adSize = getBannerSize(position);

  // Key insight: Don't render the GoogleBannerAd at all when in error state
  // This ensures no space is reserved by the native ad view
  const shouldRenderAd = adState !== 'error';
  const isVisible = adState === 'loaded';

  return (
    <View
      style={[
        styles.container,
        {
          // Completely collapse when not visible
          height: isVisible ? undefined : 0,
          opacity: isVisible ? 1 : 0,
          // Ensure no minimum height is applied
          minHeight: 0,
        },
      ]}
      // Prevent view collapsing on Android which can cause scroll issues when ad IS visible
      collapsable={!isVisible}
      pointerEvents={isVisible ? 'auto' : 'none'}
    >
      {shouldRenderAd && (
        <View style={styles.adWrapper}>
          <GoogleBannerAd
            key={adKey}
            unitId={adUnitId}
            size={adSize}
            requestOptions={{
              requestNonPersonalizedAdsOnly: requestNonPersonalized
            }}
            onAdLoaded={handleAdLoaded}
            onAdFailedToLoad={handleAdFailedToLoad}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  adWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Memoize the component to prevent unnecessary re-renders during scroll
export const BannerAd = memo(BannerAdComponent);
