import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import Constants from 'expo-constants';
import {
  AdsConsent,
  NativeAd,
  NativeMediaAspectRatio,
  TestIds,
} from 'react-native-google-mobile-ads';

import { ADS_ENABLED, NATIVE_ADS } from '../config/app';
import { trackNativeAdError, trackNativeAdLoaded } from '../services/analytics';
import { shouldRequestNonPersonalizedAdsOnly } from '../services/adsConsent';
import { shouldShowAds } from '../services/premiumState';

const getNativeAdUnitId = (): string => {
  const config = Constants.expoConfig?.extra;
  if (Platform.OS === 'ios') {
    return config?.ADMOB_IOS_NATIVE_ID || TestIds.NATIVE;
  }
  return config?.ADMOB_ANDROID_NATIVE_ID || TestIds.NATIVE;
};

interface UseNativeAdOptions {
  /** Skip loading the ad (useful when ad is provided externally) */
  skip?: boolean;
}

export function useNativeAd(options: UseNativeAdOptions = {}) {
  const { skip = false } = options;
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);
  const [error, setError] = useState<Error | null>(null);
  const nativeAdRef = useRef<NativeAd | null>(null);

  useEffect(() => {
    // Don't load native ads if skipped, ads are disabled, or user is premium
    if (skip || !ADS_ENABLED || !NATIVE_ADS.ACTIVE || !shouldShowAds()) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadAd = async () => {
      try {
        const consentInfo = await AdsConsent.getConsentInfo();
        if (!consentInfo.canRequestAds) {
          setIsLoading(false);
          return;
        }

        const nonPersonalized = await shouldRequestNonPersonalizedAdsOnly();
        const ad = await NativeAd.createForAdRequest(getNativeAdUnitId(), {
          requestNonPersonalizedAdsOnly: nonPersonalized,
          aspectRatio: NativeMediaAspectRatio.LANDSCAPE,
        });

        if (!cancelled) {
          nativeAdRef.current = ad;
          setNativeAd(ad);
          setIsLoading(false);
          trackNativeAdLoaded();
        } else {
          ad.destroy();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          setIsLoading(false);
          trackNativeAdError({ error: String(err) });
        }
      }
    };

    loadAd();

    return () => {
      cancelled = true;
      if (nativeAdRef.current) {
        nativeAdRef.current.destroy();
        nativeAdRef.current = null;
      }
    };
  }, []);

  return { nativeAd, isLoading, error };
}
