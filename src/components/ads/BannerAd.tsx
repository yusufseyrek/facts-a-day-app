import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { BannerAd as GoogleBannerAd, BannerAdSize, TestIds, AdsConsent } from 'react-native-google-mobile-ads';
import { YStack } from 'tamagui';
import Constants from 'expo-constants';
import { ADS_ENABLED } from '../../config/ads';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';

type BannerAdPosition = 'home' | 'favorites' | 'fact-modal-1' | 'fact-modal-2';

interface BannerAdProps {
  position: BannerAdPosition;
  onAdLoadChange?: (loaded: boolean) => void;
}

// Get Ad Unit IDs based on position and platform
const getAdUnitId = (position: BannerAdPosition): string => {
  const isIOS = Platform.OS === 'ios';

  // Get configured Ad Unit IDs from app.json
  const homeIOS = Constants.expoConfig?.extra?.ADMOB_IOS_HOME_BANNER_ID;
  const favoritesIOS = Constants.expoConfig?.extra?.ADMOB_IOS_FAVORITES_BANNER_ID;
  const modal1IOS = Constants.expoConfig?.extra?.ADMOB_IOS_MODAL_BANNER_ID;
  const modal2IOS = Constants.expoConfig?.extra?.ADMOB_IOS_MODAL_BANNER_2_ID;
  
  const homeAndroid = Constants.expoConfig?.extra?.ADMOB_ANDROID_HOME_BANNER_ID;
  const favoritesAndroid = Constants.expoConfig?.extra?.ADMOB_ANDROID_FAVORITES_BANNER_ID;
  const modal1Android = Constants.expoConfig?.extra?.ADMOB_ANDROID_MODAL_BANNER_ID;
  const modal2Android = Constants.expoConfig?.extra?.ADMOB_ANDROID_MODAL_BANNER_2_ID;

  // Use test IDs if real IDs not configured
  const defaultTestId = TestIds.BANNER;

  if (isIOS) {
    switch (position) {
      case 'home':
        return homeIOS || defaultTestId;
      case 'favorites':
        return favoritesIOS || defaultTestId;
      case 'fact-modal-1':
        return modal1IOS || defaultTestId;
      case 'fact-modal-2':
        return modal2IOS || defaultTestId;
    }
  } else {
    switch (position) {
      case 'home':
        return homeAndroid || defaultTestId;
      case 'favorites':
        return favoritesAndroid || defaultTestId;
      case 'fact-modal-1':
        return modal1Android || defaultTestId;
      case 'fact-modal-2':
        return modal2Android || defaultTestId;
    }
  }
};

// Get banner size based on position
const getBannerSize = (position: BannerAdPosition): BannerAdSize => {
  switch (position) {
    case 'fact-modal-1':
      // Inline adaptive banner - shown between content parts
      return BannerAdSize.INLINE_ADAPTIVE_BANNER;
    case 'fact-modal-2':
      // Full banner - shown at the end of content
      return BannerAdSize.INLINE_ADAPTIVE_BANNER;
    case 'home':
    case 'favorites':
    default:
      // Anchored adaptive banner for main screens
      return BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
  }
};

export const BannerAd: React.FC<BannerAdProps> = ({ position, onAdLoadChange }) => {
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
    <YStack 
      alignItems="center" 
      justifyContent="center" 
      paddingVertical={adLoaded ? "$2" : "$0"}
      height={adLoaded ? "auto" : 0}
      overflow="hidden"
    >
      <GoogleBannerAd
        unitId={adUnitId}
        size={adSize}
        requestOptions={{
          requestNonPersonalizedAdsOnly: requestNonPersonalized
        }}
        onAdLoaded={() => {
          setAdLoaded(true);
        }}
        onAdFailedToLoad={(error) => {
          console.error(`Banner ad (${position}) failed to load:`, error);
          setAdLoaded(false);
        }}
      />
    </YStack>
  );
};
