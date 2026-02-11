// Unmock premiumState (global setup mocks it) so we test the real implementation
jest.unmock('../../services/premiumState');

// Use a global to avoid TDZ issues with jest.mock hoisting
(global as any).__testAdsEnabled = true;

jest.mock('../../config/app', () => ({
  get ADS_ENABLED() {
    return (global as any).__testAdsEnabled;
  },
}));

import {
  setIsPremium,
  getIsPremium,
  shouldShowAds,
  shouldInitializeAdsSdk,
  canShowRewardedAds,
} from '../../services/premiumState';

beforeEach(() => {
  (global as any).__testAdsEnabled = true;
  setIsPremium(false);
});

// ---------------------------------------------------------------------------
// Basic premium state
// ---------------------------------------------------------------------------
describe('premium state', () => {
  it('defaults to non-premium', () => {
    expect(getIsPremium()).toBe(false);
  });

  it('can be toggled on and off', () => {
    setIsPremium(true);
    expect(getIsPremium()).toBe(true);

    setIsPremium(false);
    expect(getIsPremium()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldShowAds — premium users must NEVER see regular ads
// ---------------------------------------------------------------------------
describe('shouldShowAds', () => {
  it('returns true for free users in production', () => {
    setIsPremium(false);
    expect(shouldShowAds()).toBe(true);
  });

  it('returns false for premium users (no banner/interstitial ads)', () => {
    setIsPremium(true);
    expect(shouldShowAds()).toBe(false);
  });

  it('returns false when ADS_ENABLED is off (dev mode)', () => {
    (global as any).__testAdsEnabled = false;
    setIsPremium(false);
    expect(shouldShowAds()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldInitializeAdsSdk — SDK must init even for premium (rewarded ads)
// ---------------------------------------------------------------------------
describe('shouldInitializeAdsSdk', () => {
  it('returns true regardless of premium status (needed for rewarded ads)', () => {
    setIsPremium(false);
    expect(shouldInitializeAdsSdk()).toBe(true);

    setIsPremium(true);
    expect(shouldInitializeAdsSdk()).toBe(true);
  });

  it('returns false only when ADS_ENABLED is off', () => {
    (global as any).__testAdsEnabled = false;
    expect(shouldInitializeAdsSdk()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canShowRewardedAds — premium users CAN watch rewarded ads (for hints)
// ---------------------------------------------------------------------------
describe('canShowRewardedAds', () => {
  it('returns true for free users', () => {
    setIsPremium(false);
    expect(canShowRewardedAds()).toBe(true);
  });

  it('returns true for premium users (opt-in rewarded ads for extra hints)', () => {
    setIsPremium(true);
    expect(canShowRewardedAds()).toBe(true);
  });

  it('returns false only when ADS_ENABLED is off', () => {
    (global as any).__testAdsEnabled = false;
    expect(canShowRewardedAds()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Combined premium experience guarantee
// ---------------------------------------------------------------------------
describe('premium experience guarantee', () => {
  beforeEach(() => {
    setIsPremium(true);
  });

  it('premium users see no regular ads but can use rewarded ads', () => {
    expect(shouldShowAds()).toBe(false);
    expect(canShowRewardedAds()).toBe(true);
    expect(shouldInitializeAdsSdk()).toBe(true);
  });
});
