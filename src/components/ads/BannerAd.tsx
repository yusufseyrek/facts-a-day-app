import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  AdsConsent,
  BannerAd as GoogleBannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

import { AD_KEYWORDS, AD_RETRY } from '../../config/app';
import { useInsideTabs } from '../../contexts/InsideTabsContext';
import { usePremium } from '../../contexts/PremiumContext';
import { useTranslation } from '../../i18n';
import { shouldRequestNonPersonalizedAdsOnly } from '../../services/adsConsent';
import { trackAdRevenue } from '../../services/analytics';
import { shouldShowAds } from '../../services/premiumState';
import { X } from '../icons';

type CollapsiblePlacement = 'top' | 'bottom';

interface BannerAdProps {
  onAdLoadChange?: (loaded: boolean) => void;
  collapsible?: CollapsiblePlacement;
  /**
   * Pad the safe-area bottom so the banner clears the floating native tab bar
   * / home indicator (iOS) or the edge-to-edge system navigation bar (Android,
   * non-tab screens only — inside tabs the Material bottom nav already
   * consumes the bottom edge). Leave false where a sibling below the banner
   * already handles the inset (e.g. FactModal's action bar).
   */
  respectBottomInset?: boolean;
  /** Where this banner renders — segments ad-revenue analytics (e.g. 'fact_modal'). */
  placement?: string;
}

const getAdUnitId = (): string => {
  const isIOS = Platform.OS === 'ios';
  const config = Constants.expoConfig?.extra;
  const testId = TestIds.BANNER;

  if (isIOS) {
    return config?.ADMOB_IOS_BANNER_ID || testId;
  }
  return config?.ADMOB_ANDROID_BANNER_ID || testId;
};

type AdState = 'loading' | 'loaded' | 'error';

function BannerAdComponent({
  onAdLoadChange,
  collapsible,
  respectBottomInset,
  placement,
}: BannerAdProps) {
  // Subscribe to premium context so component re-renders when premium status changes
  // (shouldShowAds() reads module-level state which doesn't trigger re-renders on its own)
  usePremium();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Inside the (tabs) group the bottom edge is owned by the tab bar (Material
  // bottom nav on Android / floating glass bar on iOS); outside it, Android's
  // mandatory edge-to-edge would put the banner behind the system nav bar.
  // Context (set by the tabs layout), NOT useSegments: segments track the
  // FOCUSED route, so a covered-but-mounted tab banner would misread them.
  const inTabs = useInsideTabs();
  const [canRequestAds, setCanRequestAds] = useState<boolean | null>(null);
  const [requestNonPersonalized, setRequestNonPersonalized] = useState(true);
  const [adState, setAdState] = useState<AdState>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [adKey, setAdKey] = useState(0);

  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AdMob load/fail callbacks arrive from native seconds after mount — often
  // exactly while the host screen is being dismissed. Ignore them once
  // unmounted so a late event can't schedule state updates or animations
  // during teardown.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
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

  // Close [X]: open the compact remove-ads paywall (a native form sheet). It
  // intentionally does NOT hide the banner — that would be a free ad-removal.
  // The banner only goes away if the user actually upgrades (premium flips
  // shouldShowAds() off); dismissing the sheet leaves the banner in place.
  const handleCloseBanner = useCallback(() => {
    router.push('/remove-ads?source=ad_close');
  }, [router]);

  // LayoutAnimation.configureNext is GLOBAL: it arms the NEXT commit, whatever
  // that is. A banner callback landing as the user closes the screen would arm
  // the navigation-pop commit that deletes the whole subtree — on Android
  // Fabric that combination is a known native crash (MountingManager
  // "unable to find viewState"). iOS-only; Android takes the plain re-layout.
  const animateBannerResize = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    LayoutAnimation.configureNext({
      duration: 150,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
  }, []);

  const handleAdLoaded = useCallback(() => {
    if (!mountedRef.current) return;
    animateBannerResize();
    setAdState('loaded');
    setRetryCount(0);
  }, [animateBannerResize]);

  const handleAdFailedToLoad = useCallback(() => {
    if (!mountedRef.current) return;
    animateBannerResize();
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

  if (!shouldShowAds() || canRequestAds === false || canRequestAds === null) {
    return null;
  }

  const isVisible = adState === 'loaded';
  const bottomPad =
    respectBottomInset && isVisible && (Platform.OS === 'ios' || !inTabs) ? insets.bottom : 0;

  return (
    <View
      style={[
        styles.container,
        {
          height: isVisible ? undefined : 0,
          opacity: isVisible ? 1 : 0,
          paddingBottom: bottomPad,
        },
      ]}
      collapsable={!isVisible}
      pointerEvents={isVisible ? 'auto' : 'none'}
    >
      {adState !== 'error' && (
        <View style={styles.adWrapper}>
          <GoogleBannerAd
            key={adKey}
            unitId={getAdUnitId()}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{
              requestNonPersonalizedAdsOnly: requestNonPersonalized,
              keywords: AD_KEYWORDS,
              ...(collapsible && {
                networkExtras: { collapsible },
              }),
            }}
            onAdLoaded={handleAdLoaded}
            onAdFailedToLoad={handleAdFailedToLoad}
            onPaid={(revenue) => {
              trackAdRevenue({
                format: 'banner',
                value: revenue.value,
                currency: revenue.currency,
                precision: revenue.precision,
                placement,
                adUnitId: getAdUnitId(),
              });
            }}
          />
          {/* Close affordance: a small corner [X] that opens the remove-ads
              paywall. Sits in the corner so it doesn't obscure the creative;
              only shown once the ad is up. Does NOT hide the banner — only an
              actual upgrade removes ads. */}
          {isVisible && (
            <Pressable
              onPress={handleCloseBanner}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('a11y_closeButton')}
              style={styles.closeButton}
            >
              <X size={11} color="#FFFFFF" />
            </Pressable>
          )}
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
  closeButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});

export const BannerAd = memo(BannerAdComponent);
