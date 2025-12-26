import { showInterstitialAd } from '../components/ads/InterstitialAd';
import { ADS_ENABLED } from '../config/ads';
import { trackInterstitialShown } from './analytics';

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
