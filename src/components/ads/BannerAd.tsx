import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { BannerAd as GoogleBannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { YStack } from 'tamagui';
import { useIsPremium } from '../../contexts/SubscriptionContext';
import Constants from 'expo-constants';
import { ADS_ENABLED } from '../../config/ads';

type BannerAdPosition = 'home' | 'modal';

interface BannerAdProps {
  position: BannerAdPosition;
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

export const BannerAd: React.FC<BannerAdProps> = ({ position }) => {
  // Don't show ads if globally disabled
  if (!ADS_ENABLED) {
    return null;
  }

  const isPremium = useIsPremium();

  // Don't show ads for premium users
  if (isPremium) {
    return null;
  }

  const adUnitId = getAdUnitId(position);

  return (
    <YStack alignItems="center" justifyContent="center" paddingVertical="$2">
      <GoogleBannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: false,
        }}
        onAdFailedToLoad={(error) => {
          console.error(`Banner ad (${position}) failed to load:`, error);
        }}
      />
    </YStack>
  );
};
