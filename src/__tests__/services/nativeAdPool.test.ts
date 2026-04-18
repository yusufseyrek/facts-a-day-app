/**
 * Tests for the native ad pool: per-aspect queues, slot binding stability,
 * refill on consume, no-fill retry with exponential backoff, rate-limit
 * handling, SDK-ready gate, eviction, and premium teardown.
 *
 * We use `jest.isolateModules` per test so the module-level state in
 * nativeAdPool (slots Map, readyQueues, counters, timers) is reset between
 * cases.
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
  NativeMediaAspectRatio: {
    LANDSCAPE: 'landscape',
    SQUARE: 'square',
    PORTRAIT: 'portrait',
    ANY: 'any',
  },
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
  },
}));

type PoolModule = typeof import('../../services/nativeAdPool');

const LANDSCAPE = 'landscape' as unknown as never;
const SQUARE = 'square' as unknown as never;
const PORTRAIT = 'portrait' as unknown as never;
/** Pool target per aspect: 2 (LANDSCAPE + SQUARE + PORTRAIT = 6 on primePool). */
const EXPECTED_PRIME_REQUESTS = 6;

const loadPool = (
  options: { sdkReady?: boolean } = {}
): { pool: PoolModule; analytics: { trackNativeAdImpression: jest.Mock } } => {
  let pool!: PoolModule;
  let analytics!: { trackNativeAdImpression: jest.Mock };
  jest.isolateModules(() => {
    pool = require('../../services/nativeAdPool') as PoolModule;
    analytics = require('../../services/analytics') as { trackNativeAdImpression: jest.Mock };
  });
  // Default to SDK-ready so tests exercising pool mechanics don't need to
  // repeat the handshake. Tests that want the pre-SDK gate pass `{ sdkReady: false }`.
  if (options.sdkReady !== false) {
    pool.setPoolSdkReady(true);
  }
  return { pool, analytics };
};

const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

const countCallsForAspect = (aspect: string): number =>
  mockCreateForAdRequest.mock.calls.filter(
    (call) => (call[1] as { aspectRatio: string }).aspectRatio === aspect
  ).length;

beforeEach(() => {
  mockCreateForAdRequest.mockReset();
  mockCreateForAdRequest.mockImplementation(() => Promise.resolve(createMockAd()));
});

afterEach(() => {
  // If a test used fake timers, dispose pending retry timers before we hand
  // back to real timers so stray callbacks don't fire after the test ends
  // and log against torn-down mocks.
  if (jest.isMockFunction(setTimeout)) {
    jest.clearAllTimers();
  }
});

describe('nativeAdPool — baseline', () => {
  it('primePool fires 2 requests per aspect (LANDSCAPE + SQUARE + PORTRAIT)', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(EXPECTED_PRIME_REQUESTS);
    expect(countCallsForAspect('landscape')).toBe(2);
    expect(countCallsForAspect('square')).toBe(2);
    expect(countCallsForAspect('portrait')).toBe(2);
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
    // First consume drained the LANDSCAPE queue; let the background refill
    // land before the second subscription.
    await flushMicrotasks();
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

  it('fires trackNativeAdImpression once per unique slot binding', async () => {
    const { pool, analytics } = loadPool();
    pool.primePool();
    await flushMicrotasks();

    pool.getSlot('slot-a');
    pool.getSlot('slot-a');
    pool.getSlot('slot-a');
    // Let the refill land before the second slot subscribes.
    await flushMicrotasks();
    pool.getSlot('slot-b');

    expect(analytics.trackNativeAdImpression).toHaveBeenCalledTimes(2);
  });

  it('subscribeSlot notifies listeners when a ready ad is assigned', async () => {
    const { pool } = loadPool();
    const listener = jest.fn();
    pool.subscribeSlot('slot-a', listener);

    pool.getSlot('slot-a');
    await flushMicrotasks();
    expect(listener).toHaveBeenCalled();
    expect(pool.getSlot('slot-a').status).toBe('ready');
  });

  it('premium users never create ads', async () => {
    const premiumState = jest.requireMock('../../services/premiumState');
    premiumState.shouldShowAds.mockReturnValue(false);
    try {
      const { pool } = loadPool();
      pool.primePool();
      await flushMicrotasks();
      expect(mockCreateForAdRequest).not.toHaveBeenCalled();
    } finally {
      premiumState.shouldShowAds.mockReturnValue(true);
    }
  });
});

describe('nativeAdPool — per-aspect isolation', () => {
  it('each aspect prefills its own queue independently', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();

    const internals = pool.__getPoolInternals() as unknown as {
      readyQueues: Map<string, unknown[]>;
    };
    expect(internals.readyQueues.get('landscape')?.length).toBe(2);
    expect(internals.readyQueues.get('square')?.length).toBe(2);
    expect(internals.readyQueues.get('portrait')?.length).toBe(2);
  });

  it('getSlot(SQUARE) consumes only SQUARE ads; LANDSCAPE queue is untouched', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();

    const squareSlot = pool.getSlot('sq-1', SQUARE);
    expect(squareSlot.status).toBe('ready');

    const internals = pool.__getPoolInternals() as unknown as {
      readyQueues: Map<string, unknown[]>;
    };
    // LANDSCAPE queue untouched (still 2).
    expect(internals.readyQueues.get('landscape')?.length).toBe(2);
  });

  it('consuming an ad triggers a refill request for that aspect only', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(EXPECTED_PRIME_REQUESTS);

    pool.getSlot('portrait-1', PORTRAIT);
    await flushMicrotasks();

    // One additional PORTRAIT request fired to refill the queue back to 2;
    // LANDSCAPE/SQUARE untouched (still 2 each).
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(EXPECTED_PRIME_REQUESTS + 1);
    expect(countCallsForAspect('portrait')).toBe(3);
    expect(countCallsForAspect('landscape')).toBe(2);
    expect(countCallsForAspect('square')).toBe(2);
  });

  it('async bind via assignReadyAds triggers a refill (inFlight is not double-counted)', async () => {
    const { pool } = loadPool();
    // Park a slot in `loading` BEFORE the queue has an ad. This forces the
    // async path: the request resolves into the queue, assignReadyAds shifts
    // it into the slot, and the refill must fire after inFlight decrements.
    pool.getSlot('async-slot', LANDSCAPE);
    await flushMicrotasks();

    // Regression: when the async request resolved into the queue, the old
    // code called `assignReadyAds` from inside the `try` block — so inFlight
    // was still counted, the just-queued ad was double-counted, and the
    // refill check silently skipped. With POOL_SIZE=2 the initial fill fires
    // 2 parallel requests; request #1's bind drains the queue and must
    // trigger a refill (request #3) after `finally` decrements inFlight.
    expect(countCallsForAspect('landscape')).toBe(3);
    expect(pool.getSlot('async-slot', LANDSCAPE).status).toBe('ready');
  });
});

describe('nativeAdPool — retry behavior', () => {
  it('schedules a 5 s retry after the first "No ad to show" and fires on expiry', async () => {
    jest.useFakeTimers();
    try {
      mockCreateForAdRequest.mockImplementation(() =>
        Promise.reject(new Error('Request Error: No ad to show.'))
      );

      const { pool } = loadPool();
      pool.primePool();
      await flushMicrotasks();

      // Initial burst failed — queues empty, one retry timer per aspect.
      // With POOL_SIZE=2 each aspect's two parallel failures are deduped
      // into a single pending timer via `retryTimerByAspect.has` check.
      const internals = pool.__getPoolInternals() as unknown as {
        readyQueues: Map<string, unknown[]>;
        retryTimerByAspect: Map<string, unknown>;
      };
      expect(internals.readyQueues.get('landscape')!.length).toBe(0);
      expect(internals.retryTimerByAspect.size).toBe(3);
      const callsAtPrime = mockCreateForAdRequest.mock.calls.length;

      // Sub-5 s advance: no new requests.
      jest.advanceTimersByTime(1_500);
      await flushMicrotasks();
      expect(mockCreateForAdRequest.mock.calls.length).toBe(callsAtPrime);

      // Past 5 s: retry fires for every aspect.
      jest.advanceTimersByTime(5_000);
      await flushMicrotasks();
      expect(mockCreateForAdRequest.mock.calls.length).toBeGreaterThan(callsAtPrime);
    } finally {
      jest.useRealTimers();
    }
  });

  it('escalates no-fill retry delays 5 → 10 → 20 s and holds at 20 s', async () => {
    jest.useFakeTimers();
    try {
      mockCreateForAdRequest.mockImplementation(() =>
        Promise.reject(new Error('Request Error: No ad to show.'))
      );

      const { pool } = loadPool();
      pool.subscribeSlot('slot-a', () => {}, LANDSCAPE);
      pool.getSlot('slot-a', LANDSCAPE);

      const callsForLandscape = () =>
        mockCreateForAdRequest.mock.calls.filter(
          (call) => (call[1] as { aspectRatio: string }).aspectRatio === 'landscape'
        ).length;

      await flushMicrotasks();
      const after1 = callsForLandscape();

      // Retry 1 fires at 5 s.
      jest.advanceTimersByTime(5_500);
      await flushMicrotasks();
      expect(callsForLandscape()).toBeGreaterThan(after1);
      const after2 = callsForLandscape();

      // Retry 2 at 10 s more. 5 s is not enough.
      jest.advanceTimersByTime(5_000);
      await flushMicrotasks();
      expect(callsForLandscape()).toBe(after2);
      jest.advanceTimersByTime(6_000);
      await flushMicrotasks();
      expect(callsForLandscape()).toBeGreaterThan(after2);
      const after3 = callsForLandscape();

      // Retry 3 at 20 s more.
      jest.advanceTimersByTime(10_000);
      await flushMicrotasks();
      expect(callsForLandscape()).toBe(after3);
      jest.advanceTimersByTime(11_000);
      await flushMicrotasks();
      expect(callsForLandscape()).toBeGreaterThan(after3);
      const after4 = callsForLandscape();

      // Subsequent retries stay at the 20 s cap.
      jest.advanceTimersByTime(10_000);
      await flushMicrotasks();
      expect(callsForLandscape()).toBe(after4);
      jest.advanceTimersByTime(11_000);
      await flushMicrotasks();
      expect(callsForLandscape()).toBeGreaterThan(after4);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps retrying indefinitely on repeated no-fills — slots stay in loading', async () => {
    jest.useFakeTimers();
    try {
      mockCreateForAdRequest.mockImplementation(() =>
        Promise.reject(new Error('Request Error: No ad to show.'))
      );

      const { pool } = loadPool();
      pool.subscribeSlot('slot-a', () => {}, LANDSCAPE);
      pool.getSlot('slot-a', LANDSCAPE);
      await flushMicrotasks();
      expect(pool.getSlot('slot-a', LANDSCAPE).status).toBe('loading');

      // Cycle through the escalating retry windows (5 s, 10 s, 20 s …).
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(25_000);
        await flushMicrotasks();
      }

      // Slot never transitions to 'failed' under unbounded no-fill retries.
      expect(pool.getSlot('slot-a', LANDSCAPE).status).toBe('loading');
      expect(mockCreateForAdRequest.mock.calls.length).toBeGreaterThan(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not fire extra requests while a retry timer is pending (multiple slot subscribers)', async () => {
    jest.useFakeTimers();
    try {
      mockCreateForAdRequest.mockImplementation(() =>
        Promise.reject(new Error('Request Error: No ad to show.'))
      );

      const { pool } = loadPool();
      // First subscriber fires the initial LANDSCAPE request → fails → retry scheduled.
      pool.subscribeSlot('slot-a', () => {}, LANDSCAPE);
      pool.getSlot('slot-a', LANDSCAPE);
      await flushMicrotasks();

      const landscapeAfterFirst = countCallsForAspect('landscape');
      // POOL_SIZE=2 → initial ensureFill fires 2 parallel requests; both
      // fail, and the dedupe check keeps it to a single pending timer.
      expect(landscapeAfterFirst).toBe(2);

      // Simulate many more cells subscribing / re-subscribing while the
      // retry timer is pending. Each should be a no-op for the request
      // count — only the timer's own callback should fire new requests.
      for (let i = 0; i < 20; i++) {
        pool.subscribeSlot(`extra-${i}`, () => {}, LANDSCAPE);
        pool.getSlot(`extra-${i}`, LANDSCAPE);
      }
      await flushMicrotasks();
      expect(countCallsForAspect('landscape')).toBe(landscapeAfterFirst);

      // Fire the pending retry — 2 more LANDSCAPE requests (pool size 2).
      jest.advanceTimersByTime(6_000);
      await flushMicrotasks();
      expect(countCallsForAspect('landscape')).toBe(landscapeAfterFirst + 2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rate-limit error schedules a 60 s retry (not 1 s); slots stay in loading', async () => {
    jest.useFakeTimers();
    try {
      mockCreateForAdRequest.mockImplementation(() =>
        Promise.reject(
          new Error("Too many recently failed requests for ad unit ID: 'xyz'")
        )
      );

      const { pool } = loadPool();
      pool.subscribeSlot('slot-a', () => {}, LANDSCAPE);
      pool.getSlot('slot-a', LANDSCAPE);
      await flushMicrotasks();

      expect(pool.getSlot('slot-a', LANDSCAPE).status).toBe('loading');
      const internals = pool.__getPoolInternals() as unknown as {
        retryTimerByAspect: Map<string, unknown>;
      };
      expect(internals.retryTimerByAspect.has('landscape')).toBe(true);

      // 1 s advance must NOT fire the rate-limit retry (that's the no-fill
      // cadence). Count a few flushes to bleed off any sibling-driven
      // refill microtasks before snapshotting.
      for (let i = 0; i < 3; i++) await flushMicrotasks();
      const callsAt0 = mockCreateForAdRequest.mock.calls.length;

      jest.advanceTimersByTime(1_500);
      await flushMicrotasks();
      expect(mockCreateForAdRequest.mock.calls.length).toBe(callsAt0);

      // 60 s+ advance fires the retry.
      jest.advanceTimersByTime(60_000);
      await flushMicrotasks();
      expect(mockCreateForAdRequest.mock.calls.length).toBeGreaterThan(callsAt0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('primePool() clears any pending retry timer so the next fetch fires immediately', async () => {
    jest.useFakeTimers();
    try {
      mockCreateForAdRequest.mockImplementation(() =>
        Promise.reject(new Error('Request Error: No ad to show.'))
      );

      const { pool } = loadPool();
      pool.primePool();
      await flushMicrotasks();

      const internals = pool.__getPoolInternals() as unknown as {
        retryTimerByAspect: Map<string, unknown>;
      };
      expect(internals.retryTimerByAspect.size).toBe(3);
      const callsAfterFirstPrime = mockCreateForAdRequest.mock.calls.length;

      pool.primePool();
      // Fresh primePool cleared the pending retry timers and kicked new fetches;
      // those new fetches then fail and schedule fresh timers. Either way, we
      // should see new activity immediately without waiting for the old timer.
      await flushMicrotasks();
      expect(mockCreateForAdRequest.mock.calls.length).toBeGreaterThan(callsAfterFirstPrime);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('nativeAdPool — SDK-ready gate', () => {
  it('does not fire requests before setPoolSdkReady(true)', async () => {
    const { pool } = loadPool({ sdkReady: false });
    pool.primePool();
    await flushMicrotasks();
    expect(mockCreateForAdRequest).not.toHaveBeenCalled();
  });

  it('setPoolSdkReady(true) retries slots that were parked pre-SDK', async () => {
    const { pool } = loadPool({ sdkReady: false });

    const listener = jest.fn();
    pool.subscribeSlot('slot-a', listener);
    const parked = pool.getSlot('slot-a');
    expect(parked.status).toBe('loading');
    expect(parked.ad).toBeNull();
    expect(mockCreateForAdRequest).not.toHaveBeenCalled();

    pool.setPoolSdkReady(true);
    await flushMicrotasks();

    expect(mockCreateForAdRequest).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
    const bound = pool.getSlot('slot-a');
    expect(bound.status).toBe('ready');
    expect(bound.ad).not.toBeNull();
  });

  it('getSlot with an unpooled aspect (ANY) marks the slot failed', async () => {
    const { pool } = loadPool();
    pool.primePool();
    await flushMicrotasks();

    const result = pool.getSlot('any-slot', 'any' as unknown as never);
    expect(result.status).toBe('failed');
    expect(result.ad).toBeNull();
  });
});
