import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { INTERSTITIAL_ADS } from '../config/app';
import { canShowInactivityInterstitial, maybeShowInactivityInterstitial } from '../services/adManager';
import {
  isFullScreenAdPresenting,
  subscribeFullScreenAdPresenting,
} from '../services/fullScreenAdState';

// Seconds of "Ads in 3.. 2.. 1.." shown before the ad. The idle window opens
// the countdown this many seconds early so the ad still fires at exactly
// INACTIVITY_SECONDS.
export const COUNTDOWN_SECONDS = 3;

interface UseInactivityInterstitialOptions {
  /**
   * Master gate. When false the idle timer never arms (and any pending timer is
   * cleared) — e.g. during onboarding, or while a screen is unfocused.
   */
  enabled: boolean;
  /**
   * Evaluated when the idle window elapses (before the countdown starts). Return
   * true to skip firing this window and re-arm instead — used by the global
   * instance to skip blocking routes / active modals. Read fresh at fire time.
   */
  shouldSkipAtFire?: () => boolean;
}

/**
 * Shared idle-interstitial engine: after INTERSTITIAL_ADS.INACTIVITY_SECONDS of
 * no reported activity (while foregrounded + enabled), runs a short countdown and
 * fires an inactivity interstitial. The timer is cleared in the background and
 * re-armed on foreground. The ad itself is gated by premium + the global
 * interstitial cooldown in adManager, so idle windows never stack ads.
 *
 * This hook is intentionally render-agnostic: it owns the timers and exposes the
 * countdown value + a `reportActivity` resetter, but does NOT capture touches or
 * draw the overlay. Each consumer wires its own activity source (a root responder
 * capture) and renders the countdown where it will actually be visible — the
 * global tree for normal screens, or inside a native-modal screen (e.g. the story
 * view) whose touches/overlays don't reach the root.
 */
export function useInactivityInterstitial({
  enabled,
  shouldSkipAtFire,
}: UseInactivityInterstitialOptions) {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // arm() is referenced from inside timers (re-arm after fire / on a skipped
  // window); a ref keeps those callbacks pointing at the latest arm.
  const armRef = useRef<() => void>(undefined);

  // Read the skip predicate fresh at fire time, without making arm() depend on it.
  const skipRef = useRef(shouldSkipAtFire);
  useEffect(() => {
    skipRef.current = shouldSkipAtFire;
  });

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
    // A full-screen ad began presenting between the idle window's async gate
    // (canShowInactivityInterstitial) and now — don't draw a countdown behind it;
    // re-arm and re-evaluate next window. Belt-and-suspenders with the gate and
    // the present-subscription clear below.
    if (isFullScreenAdPresenting()) {
      armRef.current?.();
      return;
    }
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
        // Re-check the skip predicate at the actual fire moment, not just when the
        // window opened: a blocking route or modal can appear DURING the 3s
        // countdown (e.g. a fact modal opens), and we must not drop an ad over it.
        if (skipRef.current?.()) {
          armRef.current?.();
          return;
        }
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
        // Skip this window (and re-arm) if the consumer says so — e.g. a blocking
        // route or an active modal for the global instance.
        if (skipRef.current?.()) {
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

  // Reset the idle clock — call on every observed interaction.
  const reportActivity = useCallback(() => {
    arm();
  }, [arm]);

  // Pause the idle engine while ANY full-screen ad (interstitial / app-open /
  // rewarded) is on screen. Otherwise the re-armed idle window — or a second idle
  // instance — runs a "Ads in 3.." countdown BEHIND the live ad (its cooldown
  // gate passes because the cooldown timestamp isn't written until the ad
  // dismisses). Clearing on present hides any in-flight countdown; re-arming on
  // dismiss restarts the idle clock for the next window (then gated by cooldown).
  useEffect(() => {
    return subscribeFullScreenAdPresenting((presenting) => {
      if (presenting) {
        clearTimers();
        setCountdown(null);
      } else {
        armRef.current?.();
      }
    });
  }, [clearTimers]);

  useEffect(() => {
    arm();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        arm();
      } else {
        clearTimers();
        setCountdown(null);
      }
    });
    return () => {
      clearTimers();
      sub.remove();
    };
  }, [arm, clearTimers]);

  return { countdown, reportActivity };
}
