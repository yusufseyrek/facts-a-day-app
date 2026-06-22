import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, View } from 'react-native';

import { INTERSTITIAL_ADS } from '../../config/app';
import { maybeShowInactivityInterstitial } from '../../services/adManager';

interface IdleInterstitialProps {
  /** Disable the idle timer (e.g. during onboarding / first session). */
  enabled?: boolean;
  children: ReactNode;
}

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
      // Fire-and-forget; adManager gates on premium + the global cooldown.
      maybeShowInactivityInterstitial().catch(() => {});
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
