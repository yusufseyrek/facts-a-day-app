import { showInterstitialAd } from '../components/ads/InterstitialAd';
import { ADS_ENABLED, INTERSTITIAL_ADS } from '../config/app';

import { trackInterstitialShown } from './analytics';
import { getFactsViewedCount } from './appReview';

/**
 * Show interstitial ad before trivia results
 */
export const showTriviaResultsInterstitial = async (): Promise<void> => {
  // Don't show ads if globally disabled
  if (!ADS_ENABLED) {
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
 */
export const maybeShowFactViewInterstitial = async (): Promise<void> => {
  // Don't show ads if globally disabled
  if (!ADS_ENABLED) {
    return;
  }

  try {
    const viewCount = await getFactsViewedCount();

    // Show interstitial every N views (e.g., on view 5, 10, 15, etc.)
    if (viewCount > 0 && viewCount % INTERSTITIAL_ADS.FACTS_BETWEEN_ADS === 0) {
      console.log(`📺 Showing interstitial ad after ${viewCount} fact views`);
      await showInterstitialAd();
      trackInterstitialShown('fact_view');
    }
  } catch (error) {
    console.error('Error showing fact view interstitial:', error);
  }
};
