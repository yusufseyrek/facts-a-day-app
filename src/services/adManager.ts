import { showInterstitialAd } from '../components/ads/InterstitialAd';
import { INTERSTITIAL_ADS } from '../config/app';

import { trackInterstitialShown, type InterstitialSource } from './analytics';
import { getFactsViewedCount } from './appReview';
import { shouldShowAds } from './premiumState';

/** Timestamp of the last interstitial ad shown (ms) */
let lastInterstitialShownAt = 0;

/** When true, the next non-notification fact view should show a deferred interstitial */
let deferredFactViewInterstitial = false;

/**
 * Check if enough time has passed since the last interstitial
 */
const isCooldownElapsed = (): boolean => {
  if (lastInterstitialShownAt === 0) return true;
  const elapsed = (Date.now() - lastInterstitialShownAt) / 1000;
  return elapsed >= INTERSTITIAL_ADS.COOLDOWN_SECONDS;
};

/**
 * Show an interstitial ad if cooldown has elapsed, updating the cooldown timer on success.
 * Returns true if an ad was shown.
 */
const maybeShowInterstitial = async (source: InterstitialSource): Promise<boolean> => {
  if (!INTERSTITIAL_ADS.ENABLED) return false;
  if (!shouldShowAds()) return false;
  if (!isCooldownElapsed()) return false;

  try {
    await showInterstitialAd();
    lastInterstitialShownAt = Date.now();
    trackInterstitialShown(source);
    return true;
  } catch (error) {
    console.error(`Error showing ${source} interstitial:`, error);
    return false;
  }
};

/**
 * Show interstitial ad during settings changes (respects cooldown)
 */
export const showSettingsInterstitial = (): Promise<boolean> => maybeShowInterstitial('settings');

/**
 * Show interstitial ad before trivia results (respects cooldown)
 */
export const showTriviaResultsInterstitial = (): Promise<boolean> =>
  maybeShowInterstitial('trivia_results');

/**
 * Show interstitial ad during quick quiz (respects cooldown)
 */
export const showQuickQuizInterstitial = (): Promise<boolean> =>
  maybeShowInterstitial('quick_quiz');

/**
 * Show interstitial ad based on fact view count (respects cooldown).
 * Shows ad every N fact views (configured in INTERSTITIAL_ADS.FACTS_BETWEEN_ADS).
 *
 * When `skipThisTime` is true (e.g. fact opened from a notification where an app-open
 * ad was already shown), the interstitial is deferred to the next non-skipped fact view.
 */
export const maybeShowFactViewInterstitial = async (opts?: {
  skipThisTime?: boolean;
}): Promise<void> => {
  if (!INTERSTITIAL_ADS.ENABLED) return;
  if (!shouldShowAds()) return;

  try {
    const skipThisTime = opts?.skipThisTime ?? false;

    // A previous view was skipped — show the deferred ad on this (non-notification) view
    if (deferredFactViewInterstitial && !skipThisTime) {
      deferredFactViewInterstitial = false;
      await maybeShowInterstitial('fact_view');
      return;
    }

    const viewCount = await getFactsViewedCount();
    const isAtBoundary =
      viewCount > 0 && viewCount % INTERSTITIAL_ADS.FACTS_BETWEEN_ADS === 0;

    if (isAtBoundary) {
      if (skipThisTime) {
        deferredFactViewInterstitial = true;
      } else {
        await maybeShowInterstitial('fact_view');
      }
    }
  } catch (error) {
    console.error('Error showing fact view interstitial:', error);
  }
};
