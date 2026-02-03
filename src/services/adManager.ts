import { showInterstitialAd } from '../components/ads/InterstitialAd';
import { INTERSTITIAL_ADS } from '../config/app';

import { trackInterstitialShown } from './analytics';
import { getFactsViewedCount } from './appReview';
import { shouldShowAds } from './premiumState';

/** Timestamp of the last interstitial ad shown (ms) */
let lastInterstitialShownAt = 0;

/**
 * Check if enough time has passed since the last interstitial
 */
const isCooldownElapsed = (): boolean => {
  if (lastInterstitialShownAt === 0) return true;
  const elapsed = (Date.now() - lastInterstitialShownAt) / 1000;
  return elapsed >= INTERSTITIAL_ADS.COOLDOWN_SECONDS;
};

/**
 * Show interstitial ad immediately (no cooldown check)
 * Used for settings changes where an ad is always shown during the transition.
 */
export const showSettingsInterstitial = async (): Promise<void> => {
  if (!shouldShowAds()) {
    return;
  }

  try {
    await showInterstitialAd();
    trackInterstitialShown('settings');
  } catch (error) {
    console.error('Error showing settings interstitial:', error);
  }
};

/**
 * Show interstitial ad before trivia results (no cooldown check)
 */
export const showTriviaResultsInterstitial = async (): Promise<void> => {
  if (!shouldShowAds()) {
    return;
  }

  try {
    await showInterstitialAd();
    trackInterstitialShown('trivia_results');
  } catch (error) {
    console.error('Error showing trivia results interstitial:', error);
  }
};

/**
 * Check if interstitial ad should be shown based on fact view count
 * Shows ad every N fact views (configured in INTERSTITIAL_ADS.FACTS_BETWEEN_ADS)
 * with a cooldown timer between ads
 */
export const maybeShowFactViewInterstitial = async (): Promise<void> => {
  if (!shouldShowAds()) {
    return;
  }

  try {
    const viewCount = await getFactsViewedCount();

    if (viewCount > 0 && viewCount % INTERSTITIAL_ADS.FACTS_BETWEEN_ADS === 0) {
      if (!isCooldownElapsed()) {
        return;
      }
      console.log(`📺 Showing interstitial ad after ${viewCount} fact views`);
      await showInterstitialAd();
      lastInterstitialShownAt = Date.now();
      trackInterstitialShown('fact_view');
    }
  } catch (error) {
    console.error('Error showing fact view interstitial:', error);
  }
};
