// Undo the global mock from setup.ts so we test the real implementation
jest.unmock('../../services/onboarding');

import AsyncStorage from '@react-native-async-storage/async-storage';

import * as api from '../../services/api';
import * as db from '../../services/database';
import {
  completeOnboarding,
  fetchAllFacts,
  getNotificationTime,
  getNotificationTimes,
  getSelectedCategories,
  initializeOnboarding,
  isOnboardingComplete,
  NOTIFICATION_TIME_KEY,
  NOTIFICATION_TIMES_KEY,
  ONBOARDING_COMPLETE_KEY,
  resetOnboarding,
  SELECTED_CATEGORIES_KEY,
  setNotificationTimes,
  setSelectedCategories,
} from '../../services/onboarding';

// Mock api and database modules
jest.mock('../../services/api');
jest.mock('../../services/database');
jest.mock('../../services/questions', () => ({
  extractQuestions: jest.fn(() => []),
}));

const apiMock = api as jest.Mocked<typeof api>;
const dbMock = db as jest.Mocked<typeof db>;
const storageMock = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('onboarding service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset AsyncStorage implementations (clearAllMocks only clears call history)
    storageMock.getItem.mockResolvedValue(null);
    storageMock.setItem.mockResolvedValue(undefined);
    storageMock.removeItem.mockResolvedValue(undefined);
  });

  // ==================================================================
  // isOnboardingComplete
  // ==================================================================

  describe('isOnboardingComplete', () => {
    it('returns true when storage has "true"', async () => {
      storageMock.getItem.mockResolvedValue('true');
      expect(await isOnboardingComplete()).toBe(true);
      expect(storageMock.getItem).toHaveBeenCalledWith(ONBOARDING_COMPLETE_KEY);
    });

    it('returns false when storage has null', async () => {
      storageMock.getItem.mockResolvedValue(null);
      expect(await isOnboardingComplete()).toBe(false);
    });

    it('returns false when storage has "false"', async () => {
      storageMock.getItem.mockResolvedValue('false');
      expect(await isOnboardingComplete()).toBe(false);
    });

    it('returns false on storage error', async () => {
      storageMock.getItem.mockRejectedValue(new Error('storage error'));
      expect(await isOnboardingComplete()).toBe(false);
    });
  });

  // ==================================================================
  // initializeOnboarding
  // ==================================================================

  describe('initializeOnboarding', () => {
    it('succeeds after validating connectivity via metadata (no local mirror)', async () => {
      apiMock.getMetadata.mockResolvedValue({
        categories: [{ id: 1, name: 'Science', slug: 'science' }] as any,
        languages: [],
      });
      dbMock.openDatabase.mockResolvedValue(undefined as any);

      const result = await initializeOnboarding('en');

      expect(result.success).toBe(true);
      expect(apiMock.getMetadata).toHaveBeenCalledWith('en');
      expect(dbMock.openDatabase).toHaveBeenCalled();
    });

    it('returns error on API failure', async () => {
      apiMock.getMetadata.mockRejectedValue(new Error('network error'));

      const result = await initializeOnboarding('en');

      expect(result.success).toBe(false);
      expect(result.error).toBe('network error');
    });
  });

  // ==================================================================
  // fetchAllFacts
  // ==================================================================

  describe('fetchAllFacts (no-op — facts served on demand)', () => {
    it('completes immediately and signals the first batch is ready', async () => {
      const onProgress = jest.fn();
      const onFirstBatchReady = jest.fn();

      const result = await fetchAllFacts('en', ['science'], onProgress, onFirstBatchReady);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(onFirstBatchReady).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith({ downloaded: 0, total: 0, percentage: 100 });
    });
  });

  // ==================================================================
  // completeOnboarding
  // ==================================================================

  describe('completeOnboarding', () => {
    it('saves categories and marks onboarding complete', async () => {
      await completeOnboarding({ selectedCategories: ['science', 'history'] });

      expect(storageMock.setItem).toHaveBeenCalledWith(
        SELECTED_CATEGORIES_KEY,
        JSON.stringify(['science', 'history'])
      );
      expect(storageMock.setItem).toHaveBeenCalledWith(ONBOARDING_COMPLETE_KEY, 'true');
    });

    it('saves multiple notification times and backward-compat single time', async () => {
      const times = [new Date('2025-01-01T09:00:00Z'), new Date('2025-01-01T18:00:00Z')];

      await completeOnboarding({
        selectedCategories: ['science'],
        notificationTimes: times,
      });

      // Multi-time key
      expect(storageMock.setItem).toHaveBeenCalledWith(
        NOTIFICATION_TIMES_KEY,
        JSON.stringify(times.map((t) => t.toISOString()))
      );
      // Backward-compat single time key (first time)
      expect(storageMock.setItem).toHaveBeenCalledWith(
        NOTIFICATION_TIME_KEY,
        times[0].toISOString()
      );
    });

    it('saves single notification time via deprecated field', async () => {
      const time = new Date('2025-01-01T09:00:00Z');

      await completeOnboarding({
        selectedCategories: ['science'],
        notificationTime: time,
      });

      expect(storageMock.setItem).toHaveBeenCalledWith(NOTIFICATION_TIME_KEY, time.toISOString());
    });

    it('prefers notificationTimes over notificationTime', async () => {
      const multiTimes = [new Date('2025-01-01T09:00:00Z')];
      const singleTime = new Date('2025-01-01T12:00:00Z');

      await completeOnboarding({
        selectedCategories: ['science'],
        notificationTimes: multiTimes,
        notificationTime: singleTime,
      });

      // Should use notificationTimes (09:00), not notificationTime (12:00)
      expect(storageMock.setItem).toHaveBeenCalledWith(
        NOTIFICATION_TIMES_KEY,
        JSON.stringify(multiTimes.map((t) => t.toISOString()))
      );
    });

    it('throws on storage error', async () => {
      storageMock.setItem.mockRejectedValue(new Error('storage full'));

      await expect(completeOnboarding({ selectedCategories: ['science'] })).rejects.toThrow(
        'storage full'
      );
    });
  });

  // ==================================================================
  // getSelectedCategories
  // ==================================================================

  describe('getSelectedCategories', () => {
    it('returns parsed categories from storage', async () => {
      storageMock.getItem.mockResolvedValue(JSON.stringify(['science', 'history']));
      expect(await getSelectedCategories()).toEqual(['science', 'history']);
    });

    it('returns empty array when no categories stored', async () => {
      storageMock.getItem.mockResolvedValue(null);
      expect(await getSelectedCategories()).toEqual([]);
    });

    it('returns empty array on error', async () => {
      storageMock.getItem.mockRejectedValue(new Error('read error'));
      expect(await getSelectedCategories()).toEqual([]);
    });
  });

  // ==================================================================
  // getNotificationTime (deprecated single-time getter)
  // ==================================================================

  describe('getNotificationTime', () => {
    it('returns Date from stored ISO string', async () => {
      const iso = '2025-01-01T09:00:00.000Z';
      storageMock.getItem.mockResolvedValue(iso);

      const result = await getNotificationTime();
      expect(result).toEqual(new Date(iso));
    });

    it('returns null when not set', async () => {
      storageMock.getItem.mockResolvedValue(null);
      expect(await getNotificationTime()).toBeNull();
    });

    it('returns null on error', async () => {
      storageMock.getItem.mockRejectedValue(new Error('read error'));
      expect(await getNotificationTime()).toBeNull();
    });
  });

  // ==================================================================
  // getNotificationTimes (multi-time getter)
  // ==================================================================

  describe('getNotificationTimes', () => {
    it('returns parsed times from storage', async () => {
      const times = ['2025-01-01T09:00:00Z', '2025-01-01T18:00:00Z'];
      storageMock.getItem.mockResolvedValue(JSON.stringify(times));

      expect(await getNotificationTimes()).toEqual(times);
    });

    it('falls back to single time when multi-time key is not set', async () => {
      const singleIso = '2025-01-01T09:00:00.000Z';
      storageMock.getItem
        .mockResolvedValueOnce(null) // NOTIFICATION_TIMES_KEY
        .mockResolvedValueOnce(singleIso); // NOTIFICATION_TIME_KEY

      const result = await getNotificationTimes();
      expect(result).toEqual([singleIso]);
    });

    it('returns empty array when neither key is set', async () => {
      storageMock.getItem.mockResolvedValue(null);
      expect(await getNotificationTimes()).toEqual([]);
    });

    it('returns empty array on error', async () => {
      storageMock.getItem.mockRejectedValue(new Error('read error'));
      expect(await getNotificationTimes()).toEqual([]);
    });
  });

  // ==================================================================
  // setSelectedCategories
  // ==================================================================

  describe('setSelectedCategories', () => {
    it('writes categories to storage', async () => {
      await setSelectedCategories(['nature', 'space']);
      expect(storageMock.setItem).toHaveBeenCalledWith(
        SELECTED_CATEGORIES_KEY,
        JSON.stringify(['nature', 'space'])
      );
    });

    it('throws on storage error', async () => {
      storageMock.setItem.mockRejectedValue(new Error('write error'));
      await expect(setSelectedCategories(['science'])).rejects.toThrow('write error');
    });
  });

  // ==================================================================
  // setNotificationTimes (multi)
  // ==================================================================

  describe('setNotificationTimes', () => {
    it('writes times and updates backward-compat single key', async () => {
      const times = ['2025-01-01T09:00:00Z', '2025-01-01T18:00:00Z'];
      await setNotificationTimes(times);

      expect(storageMock.setItem).toHaveBeenCalledWith(
        NOTIFICATION_TIMES_KEY,
        JSON.stringify(times)
      );
      // First time also saved to single key
      expect(storageMock.setItem).toHaveBeenCalledWith(NOTIFICATION_TIME_KEY, times[0]);
    });

    it('does not set single key for empty array', async () => {
      await setNotificationTimes([]);

      expect(storageMock.setItem).toHaveBeenCalledWith(NOTIFICATION_TIMES_KEY, JSON.stringify([]));
      expect(storageMock.setItem).not.toHaveBeenCalledWith(
        NOTIFICATION_TIME_KEY,
        expect.anything()
      );
    });
  });

  // ==================================================================
  // resetOnboarding
  // ==================================================================

  describe('resetOnboarding', () => {
    it('removes all keys and clears database', async () => {
      dbMock.clearDatabase.mockResolvedValue(undefined);

      await resetOnboarding();

      expect(storageMock.removeItem).toHaveBeenCalledWith(ONBOARDING_COMPLETE_KEY);
      expect(storageMock.removeItem).toHaveBeenCalledWith(SELECTED_CATEGORIES_KEY);
      expect(storageMock.removeItem).toHaveBeenCalledWith(NOTIFICATION_TIME_KEY);
      expect(storageMock.removeItem).toHaveBeenCalledWith(NOTIFICATION_TIMES_KEY);
      expect(dbMock.clearDatabase).toHaveBeenCalled();
    });

    it('throws on storage error', async () => {
      storageMock.removeItem.mockRejectedValue(new Error('remove error'));
      await expect(resetOnboarding()).rejects.toThrow('remove error');
    });
  });
});
