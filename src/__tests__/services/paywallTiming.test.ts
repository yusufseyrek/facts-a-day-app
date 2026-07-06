import AsyncStorage from '@react-native-async-storage/async-storage';

import { PAYWALL_PROMPT, STORAGE_KEYS } from '../../config/app';
import { markPaywallShown, shouldShowPaywall } from '../../services/paywallTiming';

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const DAY_MS = 1000 * 60 * 60 * 24;

describe('paywallTiming', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
    // The service short-circuits to false in __DEV__; exercise the prod path.
    (global as { __DEV__?: boolean }).__DEV__ = false;
  });

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
  });

  describe('shouldShowPaywall', () => {
    it('is always false in __DEV__ (never nags during development)', async () => {
      (global as { __DEV__?: boolean }).__DEV__ = true;
      storage.getItem.mockResolvedValue(String(Date.now() - 10 * DAY_MS));
      expect(await shouldShowPaywall()).toBe(false);
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('seeds the clock and returns false on first launch (grace period)', async () => {
      storage.getItem.mockResolvedValue(null);
      expect(await shouldShowPaywall()).toBe(false);
      expect(storage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.PAYWALL_LAST_SHOWN,
        expect.any(String)
      );
    });

    it('returns false within the cooldown window', async () => {
      storage.getItem.mockResolvedValue(String(Date.now() - 1 * DAY_MS));
      expect(await shouldShowPaywall()).toBe(false);
      // A live record is not re-seeded.
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('returns true once the cooldown interval has elapsed', async () => {
      storage.getItem.mockResolvedValue(
        String(Date.now() - (PAYWALL_PROMPT.MIN_DAYS_BETWEEN_PROMPTS + 1) * DAY_MS)
      );
      expect(await shouldShowPaywall()).toBe(true);
    });

    it('returns true just past the interval boundary', async () => {
      storage.getItem.mockResolvedValue(
        String(Date.now() - PAYWALL_PROMPT.MIN_DAYS_BETWEEN_PROMPTS * DAY_MS - 1000)
      );
      expect(await shouldShowPaywall()).toBe(true);
    });

    it('fails closed (false) on a storage error', async () => {
      storage.getItem.mockRejectedValue(new Error('disk full'));
      expect(await shouldShowPaywall()).toBe(false);
    });
  });

  describe('markPaywallShown', () => {
    it('records the current time under the paywall key', async () => {
      await markPaywallShown();
      expect(storage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.PAYWALL_LAST_SHOWN,
        expect.any(String)
      );
    });

    it('swallows storage errors', async () => {
      storage.setItem.mockRejectedValue(new Error('nope'));
      await expect(markPaywallShown()).resolves.toBeUndefined();
    });
  });
});
