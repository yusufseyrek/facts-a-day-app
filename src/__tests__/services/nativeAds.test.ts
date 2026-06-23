/**
 * Tests for the on-demand native ad loader (formerly a pre-fetch pool). Each
 * slot fetches its own ad when first requested; there is no warm cache, no
 * background pre-fetching, and no retry on failure.
 *
 * `jest.isolateModules` per test resets the module-level slot state.
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
  trackNativeAdLoadFailed: jest.fn(),
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
  NATIVE_ADS: { ACTIVE: true },
}));

type NativeAdsModule = typeof import('../../services/nativeAds');

const LANDSCAPE = 'landscape' as unknown as never;
const PORTRAIT = 'portrait' as unknown as never;

type Analytics = {
  trackNativeAdImpression: jest.Mock;
  trackNativeAdLoadFailed: jest.Mock;
};

const loadModule = (
  options: { sdkReady?: boolean } = {}
): { nativeAds: NativeAdsModule; analytics: Analytics } => {
  let nativeAds!: NativeAdsModule;
  let analytics!: Analytics;
  jest.isolateModules(() => {
    nativeAds = require('../../services/nativeAds') as NativeAdsModule;
    analytics = require('../../services/analytics') as Analytics;
  });
  // Default the SDK to ready so tests exercise the on-demand path directly.
  // Tests that want the pre-SDK gate pass `{ sdkReady: false }`.
  if (options.sdkReady !== false) {
    nativeAds.setNativeAdsSdkReady(true);
  }
  return { nativeAds, analytics };
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
  if (jest.isMockFunction(setTimeout)) {
    jest.clearAllTimers();
  }
});

describe('nativeAds — on-demand fetch', () => {
  it('fetches exactly one ad on demand for a requested slot (no pre-fetch)', async () => {
    const { nativeAds } = loadModule();
    nativeAds.getSlot('slot-a', LANDSCAPE);
    await flushMicrotasks();
    // Only the requested slot's aspect is fetched, and only once — no warm
    // cache filling other aspects or extra buffer entries.
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(1);
    expect(countCallsForAspect('landscape')).toBe(1);
    expect(countCallsForAspect('square')).toBe(0);
    expect(countCallsForAspect('portrait')).toBe(0);
  });

  it('binds the fetched ad and reports ready', async () => {
    const { nativeAds } = loadModule();
    nativeAds.getSlot('slot-a');
    await flushMicrotasks();
    const result = nativeAds.getSlot('slot-a');
    expect(result.ad).not.toBeNull();
    expect(result.status).toBe('ready');
  });

  it('returns the same ad across repeated calls and does not re-request', async () => {
    const { nativeAds } = loadModule();
    nativeAds.getSlot('slot-a');
    await flushMicrotasks();
    const first = nativeAds.getSlot('slot-a');
    const second = nativeAds.getSlot('slot-a');
    expect(second.ad).toBe(first.ad);
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(1);
  });

  it('distinct slots each fetch their own distinct ad', async () => {
    const { nativeAds } = loadModule();
    nativeAds.getSlot('slot-a');
    nativeAds.getSlot('slot-b');
    await flushMicrotasks();
    const a = nativeAds.getSlot('slot-a');
    const b = nativeAds.getSlot('slot-b');
    expect(a.ad).not.toBeNull();
    expect(b.ad).not.toBeNull();
    expect(a.ad).not.toBe(b.ad);
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(2);
  });

  it('fires trackNativeAdImpression once per unique slot binding', async () => {
    const { nativeAds, analytics } = loadModule();
    // The hook always subscribes alongside getSlot; impressions only count for
    // a slot that still has a live subscriber when its ad binds.
    nativeAds.subscribeSlot('slot-a', () => {});
    nativeAds.subscribeSlot('slot-b', () => {});
    nativeAds.getSlot('slot-a');
    await flushMicrotasks();
    nativeAds.getSlot('slot-a');
    nativeAds.getSlot('slot-a');
    nativeAds.getSlot('slot-b');
    await flushMicrotasks();
    expect(analytics.trackNativeAdImpression).toHaveBeenCalledTimes(2);
  });

  it('does not log a phantom impression when the slot is dropped before the ad arrives', async () => {
    jest.useFakeTimers();
    try {
      let resolveAd!: (ad: unknown) => void;
      mockCreateForAdRequest.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAd = resolve;
          })
      );
      const { nativeAds, analytics } = loadModule();
      const unsubscribe = nativeAds.subscribeSlot('slot-a', () => {});
      nativeAds.getSlot('slot-a'); // starts the on-demand load
      await flushMicrotasks(); // advance past the consent awaits to the ad request
      unsubscribe(); // card dropped (e.g. story skipped it) before the ad lands
      resolveAd(createMockAd());
      await flushMicrotasks();
      expect(analytics.trackNativeAdImpression).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('releaseSlot destroys the bound ad', async () => {
    const { nativeAds } = loadModule();
    nativeAds.getSlot('slot-a');
    await flushMicrotasks();
    const { ad } = nativeAds.getSlot('slot-a');
    const destroy = (ad as unknown as { destroy: jest.Mock }).destroy;
    nativeAds.releaseSlot('slot-a');
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('subscribeSlot notifies listeners when the ad binds', async () => {
    const { nativeAds } = loadModule();
    const listener = jest.fn();
    nativeAds.subscribeSlot('slot-a', listener);
    nativeAds.getSlot('slot-a');
    await flushMicrotasks();
    expect(listener).toHaveBeenCalled();
    expect(nativeAds.getSlot('slot-a').status).toBe('ready');
  });
});

describe('nativeAds — gating', () => {
  it('premium / ads-disabled sessions never create ads', async () => {
    const premiumState = jest.requireMock('../../services/premiumState');
    premiumState.shouldShowAds.mockReturnValue(false);
    try {
      const { nativeAds } = loadModule();
      const result = nativeAds.getSlot('slot-a');
      await flushMicrotasks();
      expect(mockCreateForAdRequest).not.toHaveBeenCalled();
      expect(result.status).toBe('failed');
    } finally {
      premiumState.shouldShowAds.mockReturnValue(true);
    }
  });

  it('an unsupported aspect (ANY) marks the slot failed without a request', async () => {
    const { nativeAds } = loadModule();
    const result = nativeAds.getSlot('any-slot', 'any' as unknown as never);
    await flushMicrotasks();
    expect(result.status).toBe('failed');
    expect(result.ad).toBeNull();
    expect(mockCreateForAdRequest).not.toHaveBeenCalled();
  });
});

describe('nativeAds — SDK-ready gate', () => {
  it('does not fetch before setNativeAdsSdkReady(true)', async () => {
    const { nativeAds } = loadModule({ sdkReady: false });
    const parked = nativeAds.getSlot('slot-a');
    await flushMicrotasks();
    expect(parked.status).toBe('loading');
    expect(parked.ad).toBeNull();
    expect(mockCreateForAdRequest).not.toHaveBeenCalled();
  });

  it('resumes a slot parked pre-SDK once the SDK becomes ready', async () => {
    const { nativeAds } = loadModule({ sdkReady: false });
    // Mirror useAdForSlot: the subscriber re-reads the slot on notification.
    const listener = jest.fn(() => {
      nativeAds.getSlot('slot-a');
    });
    nativeAds.subscribeSlot('slot-a', listener);
    nativeAds.getSlot('slot-a');
    expect(mockCreateForAdRequest).not.toHaveBeenCalled();

    nativeAds.setNativeAdsSdkReady(true);
    await flushMicrotasks();

    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(1);
    expect(nativeAds.getSlot('slot-a').status).toBe('ready');
  });
});

describe('nativeAds — failure (no retry)', () => {
  it('marks the slot failed on no-fill and does not retry', async () => {
    jest.useFakeTimers();
    try {
      mockCreateForAdRequest.mockImplementation(() =>
        Promise.reject(new Error('Request Error: No ad to show.'))
      );
      const { nativeAds, analytics } = loadModule();
      nativeAds.getSlot('slot-a');
      await flushMicrotasks();

      expect(nativeAds.getSlot('slot-a').status).toBe('failed');
      expect(mockCreateForAdRequest).toHaveBeenCalledTimes(1);
      expect(analytics.trackNativeAdLoadFailed).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'no_fill' })
      );

      // No retry machinery: advancing time fires no further requests, and a
      // repeat getSlot on a failed slot stays terminal.
      jest.advanceTimersByTime(60_000);
      await flushMicrotasks();
      nativeAds.getSlot('slot-a');
      await flushMicrotasks();
      expect(mockCreateForAdRequest).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports rate_limit as the failure reason', async () => {
    mockCreateForAdRequest.mockImplementation(() =>
      Promise.reject(new Error("Too many recently failed requests for ad unit ID: 'xyz'"))
    );
    const { nativeAds, analytics } = loadModule();
    nativeAds.getSlot('slot-a');
    await flushMicrotasks();
    expect(analytics.trackNativeAdLoadFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'rate_limit' })
    );
  });
});

describe('nativeAds — hasReadyAd peek', () => {
  it('is false for unknown slots and never creates one', async () => {
    const { nativeAds } = loadModule();
    expect(nativeAds.hasReadyAd('never-requested')).toBe(false);
    const internals = nativeAds.__getNativeAdInternals();
    expect(internals.slots.has('never-requested')).toBe(false);
  });

  it('is false while loading, true once bound, false after release', async () => {
    const { nativeAds } = loadModule();
    // Request hangs (no inventory) → slot parks loading.
    mockCreateForAdRequest.mockImplementation(() => new Promise(() => {}));
    nativeAds.getSlot('story-ad', PORTRAIT);
    await flushMicrotasks();
    expect(nativeAds.hasReadyAd('story-ad')).toBe(false);

    // Release and re-request with inventory available → binds.
    nativeAds.releaseSlot('story-ad');
    mockCreateForAdRequest.mockImplementation(() => Promise.resolve(createMockAd()));
    nativeAds.getSlot('story-ad', PORTRAIT);
    await flushMicrotasks();
    expect(nativeAds.hasReadyAd('story-ad')).toBe(true);

    nativeAds.releaseSlot('story-ad');
    expect(nativeAds.hasReadyAd('story-ad')).toBe(false);
  });
});
