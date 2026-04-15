/**
 * Tests for the native ad pool: slot binding stability, refill, eviction,
 * and premium teardown.
 *
 * We use `jest.isolateModules` per test so the module-level state in
 * nativeAdPool (slots Map, readyQueue, counters) is reset between cases.
 */

const createMockAd = () => ({ destroy: jest.fn() });

const mockCreateForAdRequest = jest.fn();

jest.mock('react-native-google-mobile-ads', () => ({
  AdsConsent: {
    getConsentInfo: jest.fn().mockResolvedValue({ canRequestAds: true }),
  },
  NativeAd: {
    createForAdRequest: (...args: unknown[]) => mockCreateForAdRequest(...args),
  },
  NativeMediaAspectRatio: { LANDSCAPE: 'landscape', SQUARE: 'square', PORTRAIT: 'portrait', ANY: 'any' },
  TestIds: { NATIVE: 'test-native' },
}));

jest.mock('../../services/analytics', () => ({
  trackNativeAdImpression: jest.fn(),
}));

jest.mock('../../services/premiumState', () => ({
  shouldShowAds: jest.fn(() => true),
}));

jest.mock('../../services/adsConsent', () => ({
  shouldRequestNonPersonalizedAdsOnly: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../config/app', () => ({
  AD_KEYWORDS: ['k1'],
  ADS_ENABLED: true,
  NATIVE_ADS: {
    ACTIVE: true,
    POOL_SIZE: 3,
    POOL_REFILL_THRESHOLD: 1,
  },
}));

type PoolModule = typeof import('../../services/nativeAdPool');

const loadPool = (): { pool: PoolModule; analytics: { trackNativeAdImpression: jest.Mock } } => {
  let pool!: PoolModule;
  let analytics!: { trackNativeAdImpression: jest.Mock };
  jest.isolateModules(() => {
    pool = require('../../services/nativeAdPool') as PoolModule;
    analytics = require('../../services/analytics') as { trackNativeAdImpression: jest.Mock };
  });
  return { pool, analytics };
};

const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  mockCreateForAdRequest.mockReset();
  mockCreateForAdRequest.mockImplementation(() => Promise.resolve(createMockAd()));
});

describe('nativeAdPool', () => {
  it('primePool fires requests up to POOL_SIZE', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(3);
  });

  it('getSlot returns the same ad across repeated calls for the same key', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();

    const first = pool.getSlot('slot-a');
    const second = pool.getSlot('slot-a');
    expect(first.ad).not.toBeNull();
    expect(first.status).toBe('ready');
    expect(second.ad).toBe(first.ad);
  });

  it('distinct slots receive distinct ads', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();

    const a = pool.getSlot('slot-a');
    const b = pool.getSlot('slot-b');
    expect(a.ad).not.toBeNull();
    expect(b.ad).not.toBeNull();
    expect(a.ad).not.toBe(b.ad);
  });

  it('releaseSlot destroys the bound ad', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();

    const { ad } = pool.getSlot('slot-a');
    expect(ad).not.toBeNull();
    const destroy = (ad as unknown as { destroy: jest.Mock }).destroy;

    pool.releaseSlot('slot-a');
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('setPoolPremium(true) drains the pool and destroys ads', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();
    const { ad } = pool.getSlot('slot-a');
    const destroy = (ad as unknown as { destroy: jest.Mock }).destroy;

    pool.setPoolPremium(true);
    expect(destroy).toHaveBeenCalledTimes(1);

    const after = pool.getSlot('slot-a');
    expect(after.status).toBe('failed');
    expect(after.ad).toBeNull();
  });

  it('refills the pool in the background as slots claim ads', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(3);

    // Claim two slots; pool should top itself back up to capacity.
    pool.getSlot('slot-a');
    pool.getSlot('slot-b');
    await flushMicrotasks();

    // Two more requests were issued to replace the consumed ads.
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(5);
  });

  it('fires trackNativeAdImpression once per unique slot binding', async () => {
    const { pool, analytics } = loadPool();
    pool.primePool();
    await flushMicrotasks();

    pool.getSlot('slot-a');
    pool.getSlot('slot-a');
    pool.getSlot('slot-a');
    pool.getSlot('slot-b');

    expect(analytics.trackNativeAdImpression).toHaveBeenCalledTimes(2);
  });

  it('subscribeSlot notifies listeners when a ready ad is assigned', async () => {
    const { pool } = loadPool();
    const listener = jest.fn();
    pool.subscribeSlot('slot-a', listener);

    // First touch: no ready ad yet, kicks a request
    pool.getSlot('slot-a');
    await flushMicrotasks();
    // The pool marks status loading then pushes ads to the readyQueue and
    // calls assignReadyAds which notifies pending slots.
    expect(listener).toHaveBeenCalled();
    expect(pool.getSlot('slot-a').status).toBe('ready');
  });

  it('premium users never create ads', async () => {
    const premiumState = jest.requireMock('../../services/premiumState');
    premiumState.shouldShowAds.mockReturnValueOnce(false);
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();
    expect(mockCreateForAdRequest).not.toHaveBeenCalled();
  });

  it('non-default aspect ratios bypass the shared queue and fetch per-slot', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();

    // Shared pool prefetched 3 LANDSCAPE ads.
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(3);
    mockCreateForAdRequest.mock.calls.forEach((call) => {
      expect((call[1] as { aspectRatio: string }).aspectRatio).toBe('landscape');
    });

    // A SQUARE slot triggers its own request, not one from the queue.
    const result = pool.getSlot('square-slot', 'square' as unknown as never);
    expect(result.status).toBe('loading');
    expect(result.ad).toBeNull();

    await flushMicrotasks();

    // Exactly one additional request fired, with SQUARE aspect.
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(4);
    const lastCall = mockCreateForAdRequest.mock.calls.at(-1)!;
    expect((lastCall[1] as { aspectRatio: string }).aspectRatio).toBe('square');

    // Slot now holds the square ad.
    const bound = pool.getSlot('square-slot', 'square' as unknown as never);
    expect(bound.status).toBe('ready');
    expect(bound.ad).not.toBeNull();
  });
});
