import { useSyncExternalStore } from 'react';

/**
 * Session-scoped "the user closed the banner" flag. When the user taps the
 * banner's close [X] (which opens the soft paywall), banners stay hidden for the
 * rest of the session — a one-tap reprieve that nudges toward the ad-free
 * upgrade without permanently giving up ad revenue (it resets on cold start).
 */
let _dismissed = false;
const listeners = new Set<() => void>();

export const areBannersDismissedForSession = (): boolean => _dismissed;

export const dismissBannersForSession = (): void => {
  if (_dismissed) return;
  _dismissed = true;
  for (const l of listeners) l();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Re-renders the caller when banners are dismissed for the session. */
export const useBannersDismissedForSession = (): boolean =>
  useSyncExternalStore(subscribe, areBannersDismissedForSession, areBannersDismissedForSession);
