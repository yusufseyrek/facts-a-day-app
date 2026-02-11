import { createMockJWT } from '../helpers/factories';

// Dynamic references that get refreshed after resetModules
let mockGetToken: jest.Mock;
let getCachedAppCheckToken: typeof import('../../services/appCheckToken').getCachedAppCheckToken;
let primeTokenCache: typeof import('../../services/appCheckToken').primeTokenCache;
let forceRefreshAppCheckToken: typeof import('../../services/appCheckToken').forceRefreshAppCheckToken;

describe('appCheckToken', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();

    // Require the module under test FIRST — this triggers appCheckToken.ts to
    // import @react-native-firebase/app-check via moduleNameMapper, creating the
    // mock instance. Then we get a reference to the SAME instance via require().
    const mod = require('../../services/appCheckToken');
    getCachedAppCheckToken = mod.getCachedAppCheckToken;
    primeTokenCache = mod.primeTokenCache;
    forceRefreshAppCheckToken = mod.forceRefreshAppCheckToken;

    // Get the exact same getToken mock instance that appCheckToken.ts imported
    mockGetToken = require('@react-native-firebase/app-check').getToken;
    mockGetToken.mockImplementation(() =>
      Promise.resolve({ token: 'mock-app-check-token' })
    );

    // Set up appCheckState mock
    const appCheckState = require('../../config/appCheckState');
    appCheckState.getAppCheckReady.mockResolvedValue(undefined);
    appCheckState.isAppCheckInitialized.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getCachedAppCheckToken', () => {
    it('returns cached token when still valid', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const token = createMockJWT({ exp: futureExp });
      mockGetToken.mockResolvedValueOnce({ token });

      const result1 = await getCachedAppCheckToken();
      expect(result1).toBe(token);

      // Second call should return cached without calling getToken again
      const result2 = await getCachedAppCheckToken();
      expect(result2).toBe(token);
      // getToken called only once
      expect(mockGetToken).toHaveBeenCalledTimes(1);
    });

    it('fetches new token when cache is empty', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockJWT({ exp: futureExp });
      mockGetToken.mockResolvedValueOnce({ token });

      const result = await getCachedAppCheckToken();
      expect(result).toBe(token);
      expect(mockGetToken).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent fetches', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockJWT({ exp: futureExp });
      mockGetToken.mockResolvedValueOnce({ token });

      // Fire multiple concurrent requests
      const results = await Promise.all([
        getCachedAppCheckToken(),
        getCachedAppCheckToken(),
        getCachedAppCheckToken(),
      ]);

      // All should return the same token
      results.forEach((r) => expect(r).toBe(token));
      // Only one actual fetch
      expect(mockGetToken).toHaveBeenCalledTimes(1);
    });

    it('returns null during rate-limit cooldown when no cached token', async () => {
      // Trigger rate-limit by simulating "Too many attempts" error
      mockGetToken.mockRejectedValueOnce(new Error('Too many attempts'));
      const result1 = await getCachedAppCheckToken();
      expect(result1).toBeNull();

      // During cooldown, should return null without calling getToken
      mockGetToken.mockClear();
      const result2 = await getCachedAppCheckToken();
      expect(result2).toBeNull();
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('returns cached token during cooldown if not expired', async () => {
      // Use a token that expires in 2 hours
      const longToken = createMockJWT({ exp: Math.floor(Date.now() / 1000) + 7200 });
      mockGetToken.mockResolvedValueOnce({ token: longToken });
      await getCachedAppCheckToken();

      // Advance past buffer (5 min) but not past actual expiration (2 hours)
      // Token valid for 2h, buffer is 5m, so at 1h54m it's past buffer but not expired
      jest.advanceTimersByTime((2 * 60 - 6) * 60 * 1000); // ~1h54m

      // Next call triggers fetch which fails with rate limit
      mockGetToken.mockRejectedValueOnce(new Error('Too many attempts'));
      const result = await getCachedAppCheckToken();

      // Should return the still-valid cached token
      expect(result).toBe(longToken);
    });

    it('uses 25-min fallback for undecryptable JWT', async () => {
      const badToken = 'not-a-jwt-at-all';
      mockGetToken.mockResolvedValueOnce({ token: badToken });

      const result = await getCachedAppCheckToken();
      expect(result).toBe(badToken);

      // Should still be cached (25 min fallback - 5 min buffer = 20 min valid)
      mockGetToken.mockClear();
      const result2 = await getCachedAppCheckToken();
      expect(result2).toBe(badToken);
      expect(mockGetToken).not.toHaveBeenCalled();
    });
  });

  describe('primeTokenCache', () => {
    it('stores token and extracts exp', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockJWT({ exp: futureExp });
      primeTokenCache(token);

      // Subsequent getCachedAppCheckToken should return the primed token
      const result = await getCachedAppCheckToken();
      expect(result).toBe(token);
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('ignores empty tokens', () => {
      primeTokenCache('');
      primeTokenCache(null as any);
    });
  });

  describe('forceRefreshAppCheckToken', () => {
    it('clears cache and force-fetches new token', async () => {
      const token1 = createMockJWT({ exp: Math.floor(Date.now() / 1000) + 3600 });
      const token2 = createMockJWT({ exp: Math.floor(Date.now() / 1000) + 7200 });

      mockGetToken
        .mockResolvedValueOnce({ token: token1 })
        .mockResolvedValueOnce({ token: token2 });

      // Prime cache
      await getCachedAppCheckToken();
      expect(mockGetToken).toHaveBeenCalledTimes(1);

      // Force refresh
      const refreshed = await forceRefreshAppCheckToken();
      expect(refreshed).toBe(token2);
      // getToken called with force=true (second arg)
      expect(mockGetToken).toHaveBeenLastCalledWith(expect.anything(), true);
    });

    it('respects cooldown', async () => {
      // Trigger rate limit via getCachedAppCheckToken
      mockGetToken.mockRejectedValueOnce(new Error('Too many attempts'));
      await getCachedAppCheckToken();

      // Force refresh should return cachedToken which is null during cooldown
      const result = await forceRefreshAppCheckToken();
      expect(result).toBeNull();
    });
  });
});
