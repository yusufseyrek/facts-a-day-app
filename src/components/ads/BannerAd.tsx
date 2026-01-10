import React, { useEffect, useState, useCallback, memo, useRef } from 'react';
import { Platform, View, StyleSheet, LayoutAnimation } from 'react-native';
import {
  BannerAd as GoogleBannerAd,
  BannerAdSize,
  TestIds,
  AdsConsent,
} from 'react-native-google-mobile-ads';
import Constants from 'expo-constants';
import { ADS_ENABLED, AD_RETRY } from '../../config/ads';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';
import { getAdKeywords, subscribeToKeywords } from '../../services/adKeywords';

type BannerAdPosition = 'home' | 'fact-modal';

interface BannerAdProps {
  position: BannerAdPosition;
  onAdLoadChange?: (loaded: boolean) => void;
}

const getAdUnitId = (position: BannerAdPosition): string => {
  const isIOS = Platform.OS === 'ios';
  const config = Constants.expoConfig?.extra;
  const testId = TestIds.BANNER;

  if (isIOS) {
    return position === 'home'
      ? config?.ADMOB_IOS_MAIN_BANNER_ID || testId
      : config?.ADMOB_IOS_FACT_DETAIL_BANNER_ID || testId;
  }
  return position === 'home'
    ? config?.ADMOB_ANDROID_MAIN_BANNER_ID || testId
    : config?.ADMOB_ANDROID_FACT_DETAIL_BANNER_ID || testId;
};

const getBannerSize = (position: BannerAdPosition): BannerAdSize => {
  return position === 'fact-modal'
    ? BannerAdSize.INLINE_ADAPTIVE_BANNER
    : BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
};

type AdState = 'loading' | 'loaded' | 'error';

function BannerAdComponent({ position, onAdLoadChange }: BannerAdProps) {
  const [canRequestAds, setCanRequestAds] = useState<boolean | null>(null);
  const [requestNonPersonalized, setRequestNonPersonalized] = useState(true);
  const [adState, setAdState] = useState<AdState>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [adKey, setAdKey] = useState(0);
  const [keywords, setKeywords] = useState<string[]>(getAdKeywords);

  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to keyword changes
  useEffect(() => {
    const unsubscribe = subscribeToKeywords((newKeywords) => {
      setKeywords(newKeywords);
    });
    return unsubscribe;
  }, []);

  // Check consent on mount
  useEffect(() => {
    const checkConsent = async () => {
      try {
        const info = await AdsConsent.getConsentInfo();
        setCanRequestAds(info.canRequestAds);
        if (info.canRequestAds) {
          setRequestNonPersonalized(await shouldRequestNonPersonalizedAdsOnly());
        }
      } catch {
        setCanRequestAds(false);
      }
    };
    checkConsent();
  }, []);

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  // Notify parent of load state changes
  useEffect(() => {
    onAdLoadChange?.(adState === 'loaded');
  }, [adState, onAdLoadChange]);

  const handleAdLoaded = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 150,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    setAdState('loaded');
    setRetryCount(0);
  }, []);

  const handleAdFailedToLoad = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 150,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    setAdState('error');

    if (retryCount < AD_RETRY.MAX_RETRIES) {
      const delay = AD_RETRY.DELAYS[retryCount] || AD_RETRY.DELAYS[AD_RETRY.DELAYS.length - 1];
      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        setAdState('loading');
        setAdKey((prev) => prev + 1);
      }, delay);
    }
  }, [retryCount]);

  if (!ADS_ENABLED || canRequestAds === false || canRequestAds === null) {
    return null;
  }

  const isVisible = adState === 'loaded';

  return (
    <View
      style={[
        styles.container,
        {
          height: isVisible ? undefined : 0,
          opacity: isVisible ? 1 : 0,
        },
      ]}
      collapsable={!isVisible}
      pointerEvents={isVisible ? 'auto' : 'none'}
    >
      {adState !== 'error' && (
        <View style={styles.adWrapper}>
          <GoogleBannerAd
            key={adKey}
            unitId={getAdUnitId(position)}
            size={getBannerSize(position)}
            requestOptions={{
              requestNonPersonalizedAdsOnly: requestNonPersonalized,
              keywords,
            }}
            onAdLoaded={handleAdLoaded}
            onAdFailedToLoad={handleAdFailedToLoad}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 0,
  },
  adWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const BannerAd = memo(BannerAdComponent);
