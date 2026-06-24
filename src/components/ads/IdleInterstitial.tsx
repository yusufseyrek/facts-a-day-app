import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePathname } from 'expo-router';

import { INTERSTITIAL_ADS } from '../../config/app';
import { canShowInactivityInterstitial, maybeShowInactivityInterstitial } from '../../services/adManager';
import { isModalScreenActive } from '../../services/badges';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES } from '../Typography';

interface IdleInterstitialProps {
  /** Disable the idle timer (e.g. during onboarding / first session). */
  enabled?: boolean;
  children: ReactNode;
}

// Native-modal routes where an interstitial must NOT fire: presenting a
// full-screen ad VC over an already-presented modal conflicts on iOS, and the
// paywall is a purchase flow. Touches on these modals also sit on a VC above our
// root capture view, so they never reset the idle clock — the route check (not a
// touch reset) is what protects them. Matched by path prefix.
const BLOCKING_ROUTE_PREFIXES = ['/paywall', '/fact/modal', '/fact/sample', '/story'];
const isBlockingRoute = (path: string): boolean =>
  BLOCKING_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));

// Seconds of "Ads in 3.. 2.. 1.." shown before the ad. The idle window opens
// the countdown this many seconds early so the ad still fires at exactly
// INACTIVITY_SECONDS.
const COUNTDOWN_SECONDS = 3;

/**
 * Wraps the app tree and fires an interstitial after the user has been idle
 * in-app — no touch for INTERSTITIAL_ADS.INACTIVITY_SECONDS while foregrounded.
 * A short bottom-right "Ads in 3.. 2.. 1.." countdown precedes the ad; any touch
 * during it (or the idle window) resets the clock and hides it.
 *
 * A root-level responder CAPTURE that always returns false observes every touch
 * START without claiming the responder (children handle taps/scrolls/gestures
 * normally) and resets the idle clock. The timer is cleared in the background and
 * re-armed on foreground. The ad itself is gated by premium + the global
 * interstitial cooldown in adManager, so idle windows never stack ads.
 */
export function IdleInterstitial({ enabled = true, children }: IdleInterstitialProps) {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const insets = useSafeAreaInsets();
  const { media } = useResponsive();

  // Latest foregrounded route, read at fire time (touches on modal routes don't
  // reach our capture view, so we can't rely on a reset — we check at fire).
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // arm() is referenced from inside timers (re-arm after fire / on a blocked
  // window); a ref keeps those callbacks pointing at the latest arm.
  const armRef = useRef<() => void>(undefined);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const runCountdown = useCallback(() => {
    let n = COUNTDOWN_SECONDS;
    setCountdown(n);
    countdownTimerRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdown(null);
        maybeShowInactivityInterstitial().catch(() => {});
        // Re-arm so a still-idle user is re-evaluated next window (the cooldown
        // skips the ad until it elapses).
        armRef.current?.();
      } else {
        setCountdown(n);
      }
    }, 1000);
  }, []);

  const arm = useCallback(() => {
    clearTimers();
    setCountdown(null);
    if (!enabled || AppState.currentState !== 'active') return;
    idleTimerRef.current = setTimeout(
      () => {
        // Skip on modal routes / the in-tab fact overlay — see BLOCKING_ROUTE_PREFIXES
        // and isModalScreenActive. Re-arm to re-evaluate next window.
        if (isBlockingRoute(pathnameRef.current) || isModalScreenActive()) {
          armRef.current?.();
          return;
        }
        // Only run the countdown when an interstitial will actually follow
        // (cooldown elapsed, ads enabled, not premium) — no ghost countdowns.
        canShowInactivityInterstitial()
          .then((can) => (can ? runCountdown() : armRef.current?.()))
          .catch(() => armRef.current?.());
      },
      Math.max(0, INTERSTITIAL_ADS.INACTIVITY_SECONDS - COUNTDOWN_SECONDS) * 1000
    );
  }, [clearTimers, enabled, runCountdown]);

  useEffect(() => {
    armRef.current = arm;
  }, [arm]);

  const onTouchStartCapture = useCallback(() => {
    arm();
    return false;
  }, [arm]);

  useEffect(() => {
    arm();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') arm();
      else clearTimers();
    });
    return () => {
      clearTimers();
      sub.remove();
    };
  }, [arm, clearTimers]);

  return (
    <View style={{ flex: 1 }} onStartShouldSetResponderCapture={onTouchStartCapture}>
      {children}
      {countdown != null && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: insets.right + 16,
            bottom: insets.bottom + media.tabBarHeight + 24,
            backgroundColor: 'rgba(10,12,20,0.92)',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
            paddingHorizontal: 14,
            paddingVertical: 10,
            zIndex: 9999,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontFamily: FONT_FAMILIES.semibold, fontSize: 14 }}>
            Ads in {countdown}…
          </Text>
        </View>
      )}
    </View>
  );
}
