jest.mock('../../components/ads/InterstitialAd', () => ({
  showInterstitialAd: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/analytics', () => ({
  trackInterstitialShown: jest.fn(),
}));

import { INTERSTITIAL_ADS, STORAGE_KEYS } from '../../config/app';

const THRESHOLD = INTERSTITIAL_ADS.FACT_VIEWS_BETWEEN_ADS;
const COOLDOWN_MS = INTERSTITIAL_ADS.COOLDOWN_SECONDS * 1000;

describe('adManager — maybeShowFactViewInterstitial', () => {
  let adManager: typeof import('../../services/adManager');
  let showInterstitialAd: jest.Mock;
  let trackInterstitialShown: jest.Mock;
  let premiumState: { shouldShowAds: jest.Mock };
  let store: Record<string, string>;
  let now: number;
  let dateSpy: jest.SpyInstance;

  // The cooldown timestamp is module-level state, so each test gets a fresh
  // adManager (and fresh transitive mocks) via resetModules.
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default;
    store = {};
    AsyncStorage.getItem.mockImplementation(async (key: string) => store[key] ?? null);
    AsyncStorage.setItem.mockImplementation(async (key: string, value: string) => {
      store[key] = value;
    });

    now = 1_000_000_000;
    dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    premiumState = jest.requireMock('../../services/premiumState');
    premiumState.shouldShowAds.mockReturnValue(true);
    showInterstitialAd = jest.requireMock('../../components/ads/InterstitialAd').showInterstitialAd;
    trackInterstitialShown = jest.requireMock('../../services/analytics').trackInterstitialShown;

    adManager = require('../../services/adManager');
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  const viewFacts = async (count: number, opts?: { skipThisTime?: boolean }) => {
    const results: boolean[] = [];
    for (let i = 0; i < count; i++) {
      results.push(await adManager.maybeShowFactViewInterstitial(opts));
    }
    return results;
  };

  it('does not show an ad before the view threshold', async () => {
    const results = await viewFacts(THRESHOLD - 1);

    expect(results).not.toContain(true);
    expect(showInterstitialAd).not.toHaveBeenCalled();
    expect(store[STORAGE_KEYS.FACT_VIEWS_SINCE_AD]).toBe(String(THRESHOLD - 1));
  });

  it('shows an ad on the threshold view and resets the counter', async () => {
    const results = await viewFacts(THRESHOLD);

    expect(results[THRESHOLD - 1]).toBe(true);
    expect(showInterstitialAd).toHaveBeenCalledTimes(1);
    expect(trackInterstitialShown).toHaveBeenCalledWith('fact_view');
    expect(store[STORAGE_KEYS.FACT_VIEWS_SINCE_AD]).toBe('0');
  });

  it('defers the ad while the cooldown is active and shows it once elapsed', async () => {
    await viewFacts(THRESHOLD); // first ad shown, cooldown starts

    // Another full batch of views inside the cooldown window: no ad.
    const blocked = await viewFacts(THRESHOLD);
    expect(blocked).not.toContain(true);
    expect(showInterstitialAd).toHaveBeenCalledTimes(1);

    // Once the cooldown elapses, the very next view shows the deferred ad.
    now += COOLDOWN_MS;
    expect(await adManager.maybeShowFactViewInterstitial()).toBe(true);
    expect(showInterstitialAd).toHaveBeenCalledTimes(2);
    expect(store[STORAGE_KEYS.FACT_VIEWS_SINCE_AD]).toBe('0');
  });

  it('skips notification views and defers the ad to the next normal view', async () => {
    await viewFacts(THRESHOLD - 1);

    expect(await adManager.maybeShowFactViewInterstitial({ skipThisTime: true })).toBe(false);
    expect(showInterstitialAd).not.toHaveBeenCalled();

    expect(await adManager.maybeShowFactViewInterstitial()).toBe(true);
    expect(showInterstitialAd).toHaveBeenCalledTimes(1);
  });

  it('does nothing when ads are disabled for the user', async () => {
    premiumState.shouldShowAds.mockReturnValue(false);

    const results = await viewFacts(THRESHOLD);

    expect(results).not.toContain(true);
    expect(showInterstitialAd).not.toHaveBeenCalled();
    expect(store[STORAGE_KEYS.FACT_VIEWS_SINCE_AD]).toBeUndefined();
  });

  it('shares the cooldown with other interstitial sources', async () => {
    await adManager.maybeShowCategoryChangeInterstitial(); // count 1
    await adManager.maybeShowCategoryChangeInterstitial(); // count 2
    await adManager.maybeShowCategoryChangeInterstitial(); // count 3 → shows
    expect(showInterstitialAd).toHaveBeenCalledTimes(1);

    // Fact-view ad due, but the category ad already used this cooldown window.
    const results = await viewFacts(THRESHOLD);
    expect(results).not.toContain(true);
    expect(showInterstitialAd).toHaveBeenCalledTimes(1);
  });

  it('honors a cooldown timestamp persisted from a previous session', async () => {
    // Simulate an interstitial shown shortly before a cold restart: the
    // timestamp is in AsyncStorage even though in-memory module state is fresh.
    store['@last_interstitial_shown'] = String(now - COOLDOWN_MS / 2);

    await viewFacts(THRESHOLD);
    expect(showInterstitialAd).not.toHaveBeenCalled(); // still inside the window

    // Once the persisted window elapses, the next eligible view shows the ad.
    now += COOLDOWN_MS;
    await viewFacts(THRESHOLD);
    expect(showInterstitialAd).toHaveBeenCalledTimes(1);
  });
});
