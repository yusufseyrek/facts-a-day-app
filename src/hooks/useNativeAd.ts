import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  AdsConsent,
  NativeAd,
  NativeMediaAspectRatio,
  TestIds,
} from 'react-native-google-mobile-ads';

import Constants from 'expo-constants';

import { AD_KEYWORDS, ADS_ENABLED, NATIVE_ADS } from '../config/app';
import { usePremium } from '../contexts/PremiumContext';
import { shouldRequestNonPersonalizedAdsOnly } from '../services/adsConsent';

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
  /** Preferred media aspect ratio for the ad request. Only used on initial mount. Defaults to LANDSCAPE. */
  aspectRatio?: NativeMediaAspectRatio;
  /** Unique key to trigger a new ad request (handles FlashList view recycling). */
  requestKey?: string;
}

export function useNativeAd(options: UseNativeAdOptions = {}) {
  const { skip = false, aspectRatio = NativeMediaAspectRatio.LANDSCAPE, requestKey } = options;
  const { isPremium } = usePremium();
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);
  const [error, setError] = useState<Error | null>(null);
  const nativeAdRef = useRef<NativeAd | null>(null);

  useEffect(() => {
    // Don't load native ads if skipped, ads are disabled, or user is premium
    if (skip || !ADS_ENABLED || !NATIVE_ADS.ACTIVE || isPremium) {
      setIsLoading(false);
      setNativeAd(null);
      return;
    }

    // Reset state for new request (handles FlashList recycling)
    setNativeAd(null);
    setIsLoading(true);
    setError(null);

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
          aspectRatio,
          keywords: AD_KEYWORDS,
        });

        if (!cancelled) {
          nativeAdRef.current = ad;
          setNativeAd(ad);
          setIsLoading(false);
        } else {
          ad.destroy();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          setIsLoading(false);
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
  }, [requestKey, isPremium]);

  return { nativeAd, isLoading, error };
}
