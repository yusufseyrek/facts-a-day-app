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
  setNotificationTime,
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
    it('fetches metadata and inserts categories', async () => {
      const mockCategories = [{ id: 1, name: 'Science', slug: 'science' }];
      apiMock.getMetadata.mockResolvedValue({
        categories: mockCategories as any,
        languages: [],
      });
      dbMock.openDatabase.mockResolvedValue(undefined as any);
      dbMock.insertCategories.mockResolvedValue(undefined);

      const result = await initializeOnboarding('en');

      expect(result.success).toBe(true);
      expect(apiMock.getMetadata).toHaveBeenCalledWith('en');
      expect(dbMock.openDatabase).toHaveBeenCalled();
      expect(dbMock.insertCategories).toHaveBeenCalledWith(mockCategories);
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

  describe('fetchAllFacts', () => {
    const mockApiFacts: api.FactResponse[] = [
      {
        id: 1,
        slug: 'water-fact',
        title: 'Water Fact',
        content: 'Water is essential',
        summary: 'About water',
        category: 'science',
        source_url: 'https://example.com',
        image_url: 'https://img.example.com/1.jpg',
        is_historical: false,
        metadata: null,
        language: 'en',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 2,
        slug: 'history-fact',
        title: 'History Fact',
        content: 'Something happened',
        summary: 'Historical event',
        category: 'history',
        source_url: 'https://example.com',
        image_url: 'https://img.example.com/2.jpg',
        is_historical: true,
        metadata: { month: 3, day: 15, event_year: 1900, original_event: 'event', country: 'US' },
        language: 'en',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];

    /**
     * Helper: mock fetchFactsIncrementally to invoke onBatchReady with the
     * given facts (simulating a single-batch download).
     */
    function mockIncrementalFetch(facts: api.FactResponse[]) {
      apiMock.fetchFactsIncrementally.mockImplementation(async (params: any) => {
        await params.onBatchReady(facts, true);
        return { total: facts.length };
      });
    }

    it('fetches facts and stores them in database', async () => {
      mockIncrementalFetch(mockApiFacts);
      dbMock.insertFacts.mockResolvedValue(undefined);
      dbMock.insertQuestions.mockResolvedValue(undefined);

      const result = await fetchAllFacts('en', ['science', 'history']);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(apiMock.fetchFactsIncrementally).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'en',
          categories: 'science,history',
          includeQuestions: true,
          includeHistorical: true,
        })
      );
      expect(dbMock.insertFacts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 1, slug: 'water-fact', is_historical: 0 }),
          expect.objectContaining({ id: 2, slug: 'history-fact', is_historical: 1 }),
        ])
      );
    });

    it('maps is_historical boolean to integer for DB', async () => {
      mockIncrementalFetch(mockApiFacts);
      dbMock.insertFacts.mockResolvedValue(undefined);
      dbMock.insertQuestions.mockResolvedValue(undefined);

      await fetchAllFacts('en', ['science']);

      const insertedFacts = dbMock.insertFacts.mock.calls[0][0];
      expect(insertedFacts[0].is_historical).toBe(0); // false → 0
      expect(insertedFacts[1].is_historical).toBe(1); // true → 1
    });

    it('maps metadata fields correctly', async () => {
      mockIncrementalFetch(mockApiFacts);
      dbMock.insertFacts.mockResolvedValue(undefined);
      dbMock.insertQuestions.mockResolvedValue(undefined);

      await fetchAllFacts('en', ['history']);

      const insertedFacts = dbMock.insertFacts.mock.calls[0][0];
      const historicalFact = insertedFacts.find((f: any) => f.id === 2)!;
      expect(historicalFact.event_month).toBe(3);
      expect(historicalFact.event_day).toBe(15);
      expect(historicalFact.event_year).toBe(1900);
      expect(JSON.parse(historicalFact.metadata as string)).toEqual({
        original_event: 'event',
        country: 'US',
      });
    });

    it('maps updated_at to last_updated', async () => {
      mockIncrementalFetch(mockApiFacts);
      dbMock.insertFacts.mockResolvedValue(undefined);
      dbMock.insertQuestions.mockResolvedValue(undefined);

      await fetchAllFacts('en', ['science']);

      const insertedFacts = dbMock.insertFacts.mock.calls[0][0];
      expect(insertedFacts[0].last_updated).toBe('2025-01-01T00:00:00Z');
    });

    it('reports progress via callback', async () => {
      const progressCb = jest.fn();
      apiMock.fetchFactsIncrementally.mockImplementation(async (params: any) => {
        params.onProgress?.(5, 10);
        params.onProgress?.(10, 10);
        await params.onBatchReady(mockApiFacts, true);
        return { total: 10 };
      });
      dbMock.insertFacts.mockResolvedValue(undefined);
      dbMock.insertQuestions.mockResolvedValue(undefined);

      await fetchAllFacts('en', ['science'], progressCb);

      expect(progressCb).toHaveBeenCalledWith({ downloaded: 5, total: 10, percentage: 50 });
      expect(progressCb).toHaveBeenCalledWith({ downloaded: 10, total: 10, percentage: 100 });
    });

    it('returns error on API failure', async () => {
      apiMock.fetchFactsIncrementally.mockRejectedValue(new Error('timeout'));

      const result = await fetchAllFacts('en', ['science']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('timeout');
    });

    it('inserts extracted questions', async () => {
      const { extractQuestions } = require('../../services/questions');
      const mockQuestions = [{ id: 1, fact_id: 1, question_text: 'What?' }];
      extractQuestions.mockReturnValue(mockQuestions);

      mockIncrementalFetch(mockApiFacts);
      dbMock.insertFacts.mockResolvedValue(undefined);
      dbMock.insertQuestions.mockResolvedValue(undefined);

      await fetchAllFacts('en', ['science']);

      expect(dbMock.insertQuestions).toHaveBeenCalledWith(mockQuestions);
    });

    it('skips insertQuestions when no questions extracted', async () => {
      const { extractQuestions } = require('../../services/questions');
      extractQuestions.mockReturnValue([]);

      apiMock.getAllFactsWithRetry.mockResolvedValue(mockApiFacts);
      dbMock.insertFacts.mockResolvedValue(undefined);

      await fetchAllFacts('en', ['science']);

      expect(dbMock.insertQuestions).not.toHaveBeenCalled();
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

      expect(storageMock.setItem).toHaveBeenCalledWith(
        NOTIFICATION_TIME_KEY,
        time.toISOString()
      );
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

      await expect(
        completeOnboarding({ selectedCategories: ['science'] })
      ).rejects.toThrow('storage full');
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
  // setNotificationTime (single)
  // ==================================================================

  describe('setNotificationTime', () => {
    it('writes ISO string to storage', async () => {
      const time = new Date('2025-06-15T14:30:00Z');
      await setNotificationTime(time);
      expect(storageMock.setItem).toHaveBeenCalledWith(NOTIFICATION_TIME_KEY, time.toISOString());
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
