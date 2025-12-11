import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { BannerAd as GoogleBannerAd, BannerAdSize, TestIds, AdsConsent } from 'react-native-google-mobile-ads';
import { YStack } from 'tamagui';
import Constants from 'expo-constants';
import { ADS_ENABLED } from '../../config/ads';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';

type BannerAdPosition = 'home' | 'modal';

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
    return position === 'home' ? (homeIOS || defaultTestId) : (modalIOS || defaultTestId);
  } else {
    return position === 'home' ? (homeAndroid || defaultTestId) : (modalAndroid || defaultTestId);
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
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
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
