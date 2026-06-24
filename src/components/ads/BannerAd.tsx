import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, LayoutAnimation, Platform, Pressable, StyleSheet, View } from 'react-native';
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

/**
 * react-native-google-mobile-ads hands onAdFailedToLoad a NativeError but types
 * it as a plain `Error`. At runtime it carries `userInfo.code` (the bare code,
 * e.g. 'no-fill') and `code` (the namespaced form, e.g. 'googleMobileAds/no-fill').
 * NativeError isn't exported, so we narrow it structurally.
 */
type BannerAdError = Error & {
  code?: string;
  userInfo?: { code?: string; message?: string };
};

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
  const [adKey, setAdKey] = useState(0);

  // Retry bookkeeping lives in refs, not state: the native onAdFailedToLoad
  // callback fires seconds after the request and must read the live attempt
  // count, never a value captured in a stale render closure.
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  // A retry can come due while the app is backgrounded (banner off-screen). We
  // don't request then — we set this so the next foreground issues it at once.
  const pendingRetryRef = useRef(false);
  // Mirrors adState for callbacks that must not depend on render state, so their
  // useCallback deps stay empty and the installed native handler never goes stale.
  const adStateRef = useRef<AdState>('loading');
  // Previous AppState, so we react only to real background→active round-trips,
  // not transient iOS inactive→active blips (Control Center, the ATT/permission
  // prompt, an in-app sheet) that would otherwise churn a healthy banner.
  const appStateRef = useRef(AppState.currentState);

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

  // Keep the ref in sync so the stable failure/foreground callbacks can read the
  // current state without taking it as a dependency.
  useEffect(() => {
    adStateRef.current = adState;
  }, [adState]);

  // Re-request on a true background→foreground round-trip. This (a) runs a retry
  // that came due while we were hidden, (b) resumes a banner that ended in
  // error/loading, and (c) on iOS recovers a banner whose WKWebView the OS tore
  // down during suspension (it loaded fine but renders blank on return). We
  // ignore transient iOS inactive→active blips so a healthy, paying banner is
  // never churned on a benign interruption.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (next !== 'active' || !mountedRef.current) return;

      const hadPending = pendingRetryRef.current;
      pendingRetryRef.current = false;
      const cameFromBackground = prev === 'background';
      // Reload when a deferred retry is due, OR we returned from real background
      // with nothing showing, OR iOS returned from real background even with a
      // "loaded" banner (its WebView may now be a blank husk). Never tear down a
      // healthy loaded banner on Android or on a mere inactive→active blip.
      const shouldReload =
        hadPending ||
        (cameFromBackground && (adStateRef.current !== 'loaded' || Platform.OS === 'ios'));
      if (!shouldReload) return;

      retryCountRef.current = 0;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      setAdState('loading');
      setAdKey((k) => k + 1);
    });
    return () => sub.remove();
  }, []);

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
    // Filled — reset the backoff so the next failure starts fast again.
    retryCountRef.current = 0;
    pendingRetryRef.current = false;
  }, [animateBannerResize]);

  // Schedule the next re-request. The schedule front-loads a fast first retry (a
  // no-fill is usually transient and a re-request seconds later commonly fills),
  // then backs off, and once exhausted keeps retrying forever at a steady,
  // policy-safe interval — a long-lived banner must never permanently give up.
  // Each delay is jittered so failures don't re-request in lockstep across users.
  const scheduleRetry = useCallback(() => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    const attempt = retryCountRef.current;
    const base =
      attempt < AD_RETRY.DELAYS.length ? AD_RETRY.DELAYS[attempt] : AD_RETRY.STEADY_INTERVAL_MS;
    const jitter = 1 + (Math.random() * 2 - 1) * AD_RETRY.JITTER_FRACTION;
    const delay = Math.round(base * jitter);

    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      if (!mountedRef.current) return;
      // Don't burn a request on an off-screen banner; defer to the next foreground.
      if (AppState.currentState !== 'active') {
        pendingRetryRef.current = true;
        return;
      }
      retryCountRef.current += 1;
      setAdState('loading');
      setAdKey((prev) => prev + 1);
    }, delay);
  }, []);

  const handleAdFailedToLoad = useCallback(
    (error?: Error) => {
      if (!mountedRef.current) return;
      // Only animate the visible loaded→collapsed transition. Animating
      // loading→error / error→error ticks (already 0-height) just arms the
      // global iOS LayoutAnimation needlessly — risking collisions with
      // navigation/sheet commits, now that retries are far more frequent.
      if (adStateRef.current === 'loaded') animateBannerResize();
      setAdState('error');

      // Don't retry unrecoverable config errors (e.g. missing app id) — the
      // request can never succeed and retrying only wastes it. Everything else
      // (no-fill, network-error, timeout, …) falls through to the backoff.
      const err = error as BannerAdError | undefined;
      const code = err?.userInfo?.code ?? err?.code?.split('/').pop();
      if (code && (AD_RETRY.NON_RETRYABLE_CODES as readonly string[]).includes(code)) {
        return;
      }
      scheduleRetry();
    },
    [animateBannerResize, scheduleRetry]
  );

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
