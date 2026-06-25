/**
 * Tracks whether ANY full-screen ad (interstitial, app-open, or rewarded) is
 * currently on screen, so the idle-interstitial engine can PAUSE its
 * "Ads in 3.." countdown instead of running it BEHIND a live ad.
 *
 * The interstitial cooldown timestamp isn't persisted until the ad dismisses, so
 * an idle window that elapses while a full-screen ad is up would otherwise pass
 * its cooldown gate and draw a counting chip behind the ad. Each ad module flips
 * this flag around its show window; `useInactivityInterstitial` reads/subscribes
 * to it.
 *
 * This is a dependency-free leaf module on purpose: adManager and the ad show
 * modules (InterstitialAd/AppOpenAd/RewardedAd) all reference it, and routing the
 * shared state through here avoids an import cycle (adManager → InterstitialAd →
 * AppOpenAd → adManager).
 */
let presenting = false;
const listeners = new Set<(presenting: boolean) => void>();

/** Whether a full-screen ad is currently on screen (or about to be presented). */
export const isFullScreenAdPresenting = (): boolean => presenting;

/** Set by ad modules around their show window. Notifies subscribers on change. */
export const setFullScreenAdPresenting = (value: boolean): void => {
  if (presenting === value) return;
  presenting = value;
  for (const listener of listeners) listener(value);
};

/** Subscribe to present/dismiss transitions. Returns an unsubscribe function. */
export const subscribeFullScreenAdPresenting = (
  listener: (presenting: boolean) => void
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
