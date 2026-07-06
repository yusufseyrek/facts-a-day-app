import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useRouter, useSegments } from 'expo-router';

import { PAYWALL_PROMPT } from '../config/app';
import { waitForHomeScreenReady } from '../contexts/splashGate';
import { isBlockingOverlayActive, isModalScreenActive } from '../services/badges';
import { shouldShowPaywall } from '../services/paywallTiming';
import { getIsPremium } from '../services/premiumState';

/**
 * Auto-shows the paywall at most once every PAYWALL_PROMPT.MIN_DAYS_BETWEEN_PROMPTS
 * days on a COLD START, for non-premium users who have finished onboarding.
 *
 * Cold-start only by construction: this hook lives in AppContent, which mounts
 * once per JS context (a fresh launch). Returning from the background does NOT
 * remount it, so warm foregrounds never trigger the prompt — matching the
 * product decision to keep this to true app launches (and sidestepping any
 * overlap with the foreground app-open ad, which is background→active only). If
 * the app IS backgrounded during the pre-show window we cancel outright, so a
 * timer that iOS suspends and re-fires on resume can't surface the paywall on a
 * foreground return.
 *
 * `shouldShowPaywall()` owns the TIMING (first-launch grace + cooldown +
 * __DEV__/error fail-closed). This hook owns the PLACEMENT:
 *   1. Wait for the home screen to actually paint — the same splash gate the
 *      SplashOverlay awaits — so the paywall never mounts behind the splash
 *      (which the guards below can't observe).
 *   2. A short settle delay so the user registers home before the paywall.
 *   3. Show only when sitting on a main tab screen with no modal/overlay up.
 *
 * @param enabled Pass `isOnboardingComplete === true`; the check is deferred
 *                until onboarding is done so a fresh install is never paywalled
 *                mid-onboarding.
 */
export function useColdStartPaywall(enabled: boolean): void {
  const router = useRouter();
  const segments = useSegments();

  // The effect below only re-runs when `enabled` flips, so it must read the LIVE
  // route at fire time rather than closing over the mount-time segments value.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    if (!enabled || getIsPremium()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Backgrounding before the paywall shows would convert this cold-start prompt
    // into a foreground one on the next return (iOS suspends the pending timer and
    // fires it on resume) — cancel so it stays strictly cold-start.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'background') cancelled = true;
    });

    void (async () => {
      // Runs once per cold start. shouldShowPaywall() also seeds the grace-period
      // clock on the very first launch (returning false), so nothing shows then.
      const due = await shouldShowPaywall();
      if (cancelled || !due) return;

      // Don't race the JS splash overlay: it renders above the app tree, so the
      // placement guards below can't see it. Wait for the home screen to paint
      // (resolves immediately if it already has; capped by the gate's timeout).
      await waitForHomeScreenReady();
      if (cancelled) return;

      timer = setTimeout(() => {
        if (cancelled) return;
        // Re-check placement guards at fire time — state may have moved during
        // the delay (a late IAP result, a push navigating to a fact, etc.).
        if (getIsPremium()) return;
        if (segmentsRef.current[0] !== '(tabs)') return;
        if (isModalScreenActive() || isBlockingOverlayActive()) return;
        router.push('/paywall?source=app_open');
      }, PAYWALL_PROMPT.DELAY_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      appStateSub.remove();
    };
    // router is a stable expo-router singleton; segments are read via ref, so
    // only the onboarding gate re-arms this.
  }, [enabled]);
}
