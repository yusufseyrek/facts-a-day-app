import React, { useEffect, useState, useCallback, memo, useRef, forwardRef, useImperativeHandle } from 'react';
import { Platform, View, StyleSheet, LayoutAnimation } from 'react-native';
import { BannerAd as GoogleBannerAd, BannerAdSize, TestIds, AdsConsent } from 'react-native-google-mobile-ads';
import Constants from 'expo-constants';
import { ADS_ENABLED, BANNER_REFRESH_INTERVAL } from '../../config/ads';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';
import { getAdKeywords, subscribeToKeywords } from '../../services/adKeywords';

type BannerAdPosition = 'home' | 'fact-modal';

interface BannerAdProps {
  position: BannerAdPosition;
  onAdLoadChange?: (loaded: boolean) => void;
  /** Enable timer-based auto refresh (default: true) */
  autoRefresh?: boolean;
}

export interface BannerAdRef {
  refresh: () => void;
}

// Retry configuration
const RETRY_DELAYS = [30000, 60000, 120000, 240000, 480000];
const MAX_RETRIES = 5;

const getAdUnitId = (position: BannerAdPosition): string => {
  const isIOS = Platform.OS === 'ios';
  const config = Constants.expoConfig?.extra;
  const testId = TestIds.BANNER;

  if (isIOS) {
    return position === 'home' 
      ? config?.ADMOB_IOS_HOME_BANNER_ID || testId
      : config?.ADMOB_IOS_MODAL_BANNER_ID || testId;
  }
  return position === 'home'
    ? config?.ADMOB_ANDROID_HOME_BANNER_ID || testId
    : config?.ADMOB_ANDROID_MODAL_BANNER_ID || testId;
};

const getBannerSize = (position: BannerAdPosition): BannerAdSize => {
  return position === 'fact-modal' 
    ? BannerAdSize.INLINE_ADAPTIVE_BANNER 
    : BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
};

type AdState = 'loading' | 'loaded' | 'error';

const BannerAdComponent = forwardRef<BannerAdRef, BannerAdProps>(({ 
  position, 
  onAdLoadChange,
  autoRefresh = true,
}, ref) => {
  const [canRequestAds, setCanRequestAds] = useState<boolean | null>(null);
  const [requestNonPersonalized, setRequestNonPersonalized] = useState(true);
  const [adState, setAdState] = useState<AdState>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [adKey, setAdKey] = useState(0);
  const [keywords, setKeywords] = useState<string[]>(getAdKeywords);
  
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const googleAdRef = useRef<GoogleBannerAd>(null);

  // Subscribe to keyword changes
  useEffect(() => {
    const unsubscribe = subscribeToKeywords((newKeywords) => {
      setKeywords(newKeywords);
      // TODO: Remove after testing
      console.log('[BannerAd] Keywords updated:', newKeywords);
    });
    return unsubscribe;
  }, []);

  // Log keywords on mount and when they change
  // TODO: Remove after testing
  useEffect(() => {
    console.log(`[BannerAd:${position}] Current keywords:`, keywords);
  }, [keywords, position]);

  const refreshAd = useCallback(() => {
    googleAdRef.current?.load();
  }, []);

  useImperativeHandle(ref, () => ({ refresh: refreshAd }), [refreshAd]);

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

  // Timer-based auto refresh
  useEffect(() => {
    if (!autoRefresh || adState !== 'loaded') return;

    refreshTimerRef.current = setInterval(() => {
      refreshAd();
    }, BANNER_REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, adState, refreshAd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
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
    
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        setAdState('loading');
        setAdKey(prev => prev + 1);
      }, delay);
    }
  }, [retryCount]);

  if (!ADS_ENABLED || canRequestAds === false || canRequestAds === null) {
    return null;
  }

  const isVisible = adState === 'loaded';

  return (
    <View
      style={[styles.container, { 
        height: isVisible ? undefined : 0, 
        opacity: isVisible ? 1 : 0 
      }]}
      collapsable={!isVisible}
      pointerEvents={isVisible ? 'auto' : 'none'}
    >
      {adState !== 'error' && (
        <View style={styles.adWrapper}>
          <GoogleBannerAd
            ref={googleAdRef}
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
});

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
