import { APP_CHECK, CATEGORY_LIMITS, HINT_LIMITS, SUBSCRIPTION } from '../../config/app';

// ---------------------------------------------------------------------------
// ADS_ENABLED
// ---------------------------------------------------------------------------
describe('ADS_ENABLED', () => {
  it('is disabled in __DEV__ (test environment)', () => {
    // In tests __DEV__ is true, so ADS_ENABLED = !__DEV__ = false
    // This verifies the guard: ads never run during development/testing
    const { ADS_ENABLED } = require('../../config/app');
    expect(ADS_ENABLED).toBe(false);
  });

  it('is derived from !__DEV__ (production guard)', () => {
    // ADS_ENABLED must equal !__DEV__ so ads are on in prod, off in dev
    const { ADS_ENABLED } = require('../../config/app');
    expect(ADS_ENABLED).toBe(!__DEV__);
  });
});

// ---------------------------------------------------------------------------
// APP_CHECK.STRICT_MODE_ENABLED
// ---------------------------------------------------------------------------
describe('APP_CHECK', () => {
  it('has STRICT_MODE_ENABLED set to true', () => {
    expect(APP_CHECK.STRICT_MODE_ENABLED).toBe(true);
  });

  it('has reasonable retry settings', () => {
    expect(APP_CHECK.INIT_MAX_RETRIES).toBeGreaterThanOrEqual(1);
    expect(APP_CHECK.FIRST_TOKEN_MAX_ATTEMPTS).toBeGreaterThanOrEqual(1);
    expect(APP_CHECK.INIT_RETRY_DELAY_MS).toBeGreaterThan(0);
    expect(APP_CHECK.FIRST_TOKEN_RETRY_DELAY_MS).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Premium tier config values
// ---------------------------------------------------------------------------
describe('premium tier config', () => {
  it('gives premium users unlimited category selection', () => {
    expect(CATEGORY_LIMITS.PREMIUM.max).toBe(Infinity);
  });

  it('gives premium users more hints than free users', () => {
    expect(HINT_LIMITS.PREMIUM).toBeGreaterThan(HINT_LIMITS.FREE);
  });

  it('has valid subscription product IDs', () => {
    expect(SUBSCRIPTION.PRODUCT_IDS.length).toBeGreaterThan(0);
    for (const id of SUBSCRIPTION.PRODUCT_IDS) {
      expect(id).toMatch(/^factsaday_premium_/);
    }
  });

  it('enforces a minimum category selection for both tiers', () => {
    expect(CATEGORY_LIMITS.FREE.min).toBeGreaterThanOrEqual(1);
    expect(CATEGORY_LIMITS.PREMIUM.min).toBeGreaterThanOrEqual(1);
  });
});
