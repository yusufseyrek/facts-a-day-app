import AsyncStorage from '@react-native-async-storage/async-storage';

import { showInterstitialAd } from '../components/ads/InterstitialAd';
import { INTERSTITIAL_ADS, STORAGE_KEYS } from '../config/app';

import { type InterstitialSource, trackInterstitialShown, trackInterstitialSkipped } from './analytics';
import { isFullScreenAdPresenting, setFullScreenAdPresenting } from './fullScreenAdState';
import { shouldShowAds } from './premiumState';

/**
 * Persisted timestamp (ms) of the last interstitial shown, across ALL sources.
 * Stored in AsyncStorage so the global cooldown survives app restarts — a
 * module-level variable resets to 0 on every cold start, which would let an
 * interstitial fire immediately after relaunch and defeat the cooldown.
 */
const LAST_INTERSTITIAL_SHOWN_KEY = '@last_interstitial_shown';

const getLastInterstitialShownAt = async (): Promise<number> => {
  const raw = await AsyncStorage.getItem(LAST_INTERSTITIAL_SHOWN_KEY);
  return raw ? parseInt(raw, 10) || 0 : 0;
};

/**
 * Whether the global cooldown has elapsed since the last interstitial of any
 * source. Reads the persisted timestamp so the window holds across restarts.
 */
const isCooldownElapsed = async (): Promise<boolean> => {
  const last = await getLastInterstitialShownAt();
  if (last === 0) return true;
  const elapsed = (Date.now() - last) / 1000;
  return elapsed >= INTERSTITIAL_ADS.COOLDOWN_SECONDS;
};

/**
 * Show an interstitial ad if the global cooldown has elapsed, persisting the
 * timestamp on success. Returns true if an ad was shown.
 */
const maybeShowInterstitial = async (source: InterstitialSource): Promise<boolean> => {
  if (!INTERSTITIAL_ADS.ENABLED) return false;
  if (!shouldShowAds()) return false;
  // A full-screen ad (this or another interstitial / app-open / rewarded) is
  // already on screen — don't try to stack a second one. The show call awaits
  // until the ad dismisses and the cooldown timestamp is only written afterward,
  // so without this a concurrent trigger would pass the cooldown check below.
  if (isFullScreenAdPresenting()) {
    trackInterstitialSkipped({ source, reason: 'cooldown' });
    return false;
  }
  if (!(await isCooldownElapsed())) {
    trackInterstitialSkipped({ source, reason: 'cooldown' });
    return false;
  }

  setFullScreenAdPresenting(true);
  try {
    await showInterstitialAd(source);
    await AsyncStorage.setItem(LAST_INTERSTITIAL_SHOWN_KEY, Date.now().toString());
    trackInterstitialShown(source);
    return true;
  } catch (error) {
    console.error(`Error showing ${source} interstitial:`, error);
    return false;
  } finally {
    setFullScreenAdPresenting(false);
  }
};

/**
 * Increment a persistent integer counter in AsyncStorage and return the new value.
 */
const incrementCounter = async (key: string): Promise<number> => {
  const raw = await AsyncStorage.getItem(key);
  const next = (raw ? parseInt(raw, 10) || 0 : 0) + 1;
  await AsyncStorage.setItem(key, next.toString());
  return next;
};

/**
 * Show interstitial ad after a trivia game completion (subject to the global cooldown).
 * Caller is responsible for excluding daily trivia.
 */
export const maybeShowTriviaResultsInterstitial = async (): Promise<boolean> => {
  return maybeShowInterstitial('trivia_results');
};

/**
 * Whether an inactivity interstitial would actually show right now (ads enabled,
 * not premium, global cooldown elapsed). The idle countdown checks this before
 * it starts so it only appears when an ad will follow — never a "ghost" countdown
 * during the cooldown window. (Doesn't check ad fill; that's a rarer no-fill.)
 */
export const canShowInactivityInterstitial = async (): Promise<boolean> => {
  if (!INTERSTITIAL_ADS.ENABLED || !shouldShowAds()) return false;
  // A full-screen ad (any source) is already on screen — don't open an idle
  // countdown behind it. The cooldown timestamp isn't persisted until the ad
  // dismisses, so without this the cooldown gate below would wrongly pass.
  if (isFullScreenAdPresenting()) return false;
  return isCooldownElapsed();
};

/**
 * Show an interstitial when the user has been idle in-app (no interaction while
 * foregrounded) past INTERSTITIAL_ADS.INACTIVITY_SECONDS. Subject to the global
 * cooldown and premium gating, so repeated idle windows won't stack ads.
 */
export const maybeShowInactivityInterstitial = async (): Promise<boolean> => {
  return maybeShowInterstitial('inactivity');
};

/**
 * Show interstitial ad after a fact view.
 * Fires once FACT_VIEWS_BETWEEN_ADS views have accumulated since the last
 * fact-view interstitial, subject to the global cooldown. The counter only
 * resets when an ad is actually shown, so a view that lands inside the
 * cooldown window (or is skipped, e.g. notification opens that already
 * showed an app-open ad) defers the ad to the next eligible view instead of
 * dropping it.
 */
export const maybeShowFactViewInterstitial = async (opts?: {
  skipThisTime?: boolean;
}): Promise<boolean> => {
  if (!INTERSTITIAL_ADS.ENABLED) return false;
  if (!shouldShowAds()) return false;

  try {
    const count = await incrementCounter(STORAGE_KEYS.FACT_VIEWS_SINCE_AD);
    if (count < INTERSTITIAL_ADS.FACT_VIEWS_BETWEEN_ADS) return false;
    if (opts?.skipThisTime) return false;

    const shown = await maybeShowInterstitial('fact_view');
    if (shown) {
      await AsyncStorage.setItem(STORAGE_KEYS.FACT_VIEWS_SINCE_AD, '0');
    }
    return shown;
  } catch (error) {
    console.error('Error showing fact view interstitial:', error);
    return false;
  }
};

/**
 * Show interstitial ad after a category-save action.
 * Fires every Nth save (configured in INTERSTITIAL_ADS.CATEGORY_CHANGES_BETWEEN_ADS)
 * and respects the global cooldown.
 */
export const maybeShowCategoryChangeInterstitial = async (): Promise<boolean> => {
  if (!INTERSTITIAL_ADS.ENABLED) return false;
  if (!shouldShowAds()) return false;

  try {
    const count = await incrementCounter(STORAGE_KEYS.CATEGORY_CHANGES_COUNT);
    if (count > 0 && count % INTERSTITIAL_ADS.CATEGORY_CHANGES_BETWEEN_ADS === 0) {
      return await maybeShowInterstitial('settings');
    }
    return false;
  } catch (error) {
    console.error('Error showing category change interstitial:', error);
    return false;
  }
};
