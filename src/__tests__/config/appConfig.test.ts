import {
  APP_CHECK,
  DEV_SETTINGS_ENABLED,
  HINT_LIMITS,
  MINIMUM_CATEGORIES,
  SUBSCRIPTION,
} from '../../config/app';

// ---------------------------------------------------------------------------
// DEV_SETTINGS_ENABLED — tied to __DEV__ so it's stripped from prod builds
// ---------------------------------------------------------------------------
describe('DEV_SETTINGS_ENABLED', () => {
  it('mirrors __DEV__ so dev settings show in dev builds and never in production', () => {
    // Production bundles set __DEV__ === false, which forces this off; the test
    // env runs with __DEV__ === true. Asserting equality pins the intent: the
    // flag is on exactly when (and only when) the build is a development build.
    expect(DEV_SETTINGS_ENABLED).toBe(__DEV__);
  });
});

// ---------------------------------------------------------------------------
// ADS_ENABLED
// ---------------------------------------------------------------------------
describe('ADS_ENABLED', () => {
  it('is enabled for production builds', () => {
    const { ADS_ENABLED } = require('../../config/app');
    expect(ADS_ENABLED).toBe(true);
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
  it('gives premium users more hints than free users', () => {
    expect(HINT_LIMITS.PREMIUM).toBeGreaterThan(HINT_LIMITS.FREE);
  });

  it('has valid subscription product IDs', () => {
    expect(SUBSCRIPTION.PRODUCT_IDS.length).toBeGreaterThan(0);
    for (const id of SUBSCRIPTION.PRODUCT_IDS) {
      expect(id).toMatch(/^factsaday_premium_/);
    }
  });

  it('enforces a minimum category selection', () => {
    expect(MINIMUM_CATEGORIES).toBeGreaterThanOrEqual(1);
  });
});
