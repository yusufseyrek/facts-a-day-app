import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, View } from 'react-native';

import { usePathname } from 'expo-router';

import { INTERSTITIAL_ADS } from '../../config/app';
import { maybeShowInactivityInterstitial } from '../../services/adManager';

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
const BLOCKING_ROUTE_PREFIXES = ['/paywall', '/fact/modal', '/fact/morph', '/fact/sample', '/story'];
const isBlockingRoute = (path: string): boolean =>
  BLOCKING_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));

/**
 * Wraps the app tree and fires an interstitial after the user has been idle
 * in-app — no touch for INTERSTITIAL_ADS.INACTIVITY_SECONDS while foregrounded.
 *
 * A root-level responder CAPTURE that always returns false observes every touch
 * START without claiming the responder (children handle taps/scrolls/gestures
 * normally) and resets the idle clock. The timer is cleared in the background and
 * re-armed on foreground. The ad itself is gated by premium + the global
 * interstitial cooldown in adManager, so idle windows never stack ads.
 */
export function IdleInterstitial({ enabled = true, children }: IdleInterstitialProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest foregrounded route, read at fire time (touches on modal routes don't
  // reach our capture view, so we can't rely on a reset — we check at fire).
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const arm = useCallback(() => {
    clear();
    if (!enabled || AppState.currentState !== 'active') return;
    timerRef.current = setTimeout(() => {
      // Skip on modal routes (paywall purchase flow, fact/story modals) — see
      // BLOCKING_ROUTE_PREFIXES. Fire-and-forget otherwise; adManager gates on
      // premium + the global cooldown.
      if (!isBlockingRoute(pathnameRef.current)) {
        maybeShowInactivityInterstitial().catch(() => {});
      }
      // Re-arm so a still-idle user is re-evaluated next window (the cooldown
      // skips the ad until it elapses).
      arm();
    }, INTERSTITIAL_ADS.INACTIVITY_SECONDS * 1000);
  }, [clear, enabled]);

  const onTouchStartCapture = useCallback(() => {
    arm();
    return false;
  }, [arm]);

  useEffect(() => {
    arm();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') arm();
      else clear();
    });
    return () => {
      clear();
      sub.remove();
    };
  }, [arm, clear]);

  return (
    <View style={{ flex: 1 }} onStartShouldSetResponderCapture={onTouchStartCapture}>
      {children}
    </View>
  );
}
