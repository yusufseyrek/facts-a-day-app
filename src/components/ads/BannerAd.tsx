import React, { useEffect, useState, useCallback, memo } from 'react';
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

const BannerAdComponent: React.FC<BannerAdProps> = ({ position, onAdLoadChange }) => {
  const [canRequestAds, setCanRequestAds] = useState<boolean | null>(null);
  const [requestNonPersonalized, setRequestNonPersonalized] = useState<boolean>(true);
  const [adLoaded, setAdLoaded] = useState<boolean>(false);

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

  // Notify parent when ad load state changes
  useEffect(() => {
    onAdLoadChange?.(adLoaded);
  }, [adLoaded, onAdLoadChange]);

  // Memoized callbacks to prevent re-renders during scroll
  const handleAdLoaded = useCallback(() => {
    // Use a subtle layout animation for height change to prevent jarring layout shifts
    LayoutAnimation.configureNext({
      duration: 150,
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    });
    setAdLoaded(true);
  }, []);

  const handleAdFailedToLoad = useCallback((error: any) => {
    console.error(`Banner ad (${position}) failed to load:`, error);
    setAdLoaded(false);
  }, [position]);

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

  return (
    <View
      style={[
        styles.container,
        {
          height: adLoaded ? undefined : 0,
          opacity: adLoaded ? 1 : 0,
        },
      ]}
      // Prevent view collapsing on Android which can cause scroll issues
      collapsable={false}
      pointerEvents={adLoaded ? 'auto' : 'none'}
    >
      <View style={styles.adWrapper}>
        <GoogleBannerAd
          unitId={adUnitId}
          size={adSize}
          requestOptions={{
            requestNonPersonalizedAdsOnly: requestNonPersonalized
          }}
          onAdLoaded={handleAdLoaded}
          onAdFailedToLoad={handleAdFailedToLoad}
        />
      </View>
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
