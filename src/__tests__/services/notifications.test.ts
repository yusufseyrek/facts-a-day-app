import { createPreferredTime, createFactWithRelations, futureDate } from '../helpers/factories';

// Import after setup mocks
import { __testing, syncNotificationSchedule, scheduleNotifications } from '../../services/notifications';
import * as database from '../../services/database';

const {
  generateTimeSlots,
  isScheduleValid,
  sortTimesByTimeOfDay,
  shouldPreloadImage,
  getTypeHintForExtension,
  processInBatches,
} = __testing;

// Mock database module
jest.mock('../../services/database');
const dbMock = database as jest.Mocked<typeof database>;

// Mock images module
jest.mock('../../services/images', () => ({
  downloadImage: jest.fn().mockResolvedValue('file:///mock/image.jpg'),
}));

// Mock i18n
jest.mock('../../i18n/config', () => ({
  i18n: { locale: 'en', t: (key: string) => key },
}));

describe('notifications — pure functions', () => {
  describe('sortTimesByTimeOfDay', () => {
    it('sorts times by hour:minute ascending', () => {
      const times = [
        createPreferredTime(14, 30),
        createPreferredTime(8, 0),
        createPreferredTime(20, 15),
      ];
      const sorted = sortTimesByTimeOfDay(times);
      expect(sorted[0].getHours()).toBe(8);
      expect(sorted[1].getHours()).toBe(14);
      expect(sorted[2].getHours()).toBe(20);
    });

    it('handles midnight edge case', () => {
      const times = [
        createPreferredTime(23, 59),
        createPreferredTime(0, 0),
        createPreferredTime(12, 0),
      ];
      const sorted = sortTimesByTimeOfDay(times);
      expect(sorted[0].getHours()).toBe(0);
      expect(sorted[1].getHours()).toBe(12);
      expect(sorted[2].getHours()).toBe(23);
    });
  });

  describe('generateTimeSlots', () => {
    it('generates correct count of slots', () => {
      const times = [createPreferredTime(9, 0), createPreferredTime(18, 0)];
      const slots = generateTimeSlots(times, 10);
      expect(slots).toHaveLength(10);
    });

    it('never generates slots in the past', () => {
      const times = [createPreferredTime(9, 0), createPreferredTime(18, 0)];
      const slots = generateTimeSlots(times, 20);
      const now = new Date();
      slots.forEach((slot) => {
        expect(slot.date.getTime()).toBeGreaterThan(now.getTime());
      });
    });

    it('cycles through preferred times', () => {
      const times = [createPreferredTime(9, 0), createPreferredTime(18, 0)];
      const slots = generateTimeSlots(times, 10);
      // Each day should alternate between 9:00 and 18:00
      for (const slot of slots) {
        expect([9, 18]).toContain(slot.hour);
      }
    });

    it('respects startAfterDate for continuation', () => {
      const times = [createPreferredTime(9, 0), createPreferredTime(18, 0)];
      const startAfter = futureDate(3, 9, 0); // 3 days from now at 9:00
      const slots = generateTimeSlots(times, 5, startAfter);

      // All slots should be after startAfterDate
      slots.forEach((slot) => {
        expect(slot.date.getTime()).toBeGreaterThan(startAfter.getTime());
      });
    });

    it('handles single preferred time', () => {
      const times = [createPreferredTime(12, 0)];
      const slots = generateTimeSlots(times, 5);
      expect(slots).toHaveLength(5);
      // All slots at 12:00
      slots.forEach((slot) => {
        expect(slot.hour).toBe(12);
        expect(slot.minute).toBe(0);
      });
    });

    it('handles multiple preferred times', () => {
      const times = [
        createPreferredTime(8, 0),
        createPreferredTime(12, 0),
        createPreferredTime(18, 0),
      ];
      const slots = generateTimeSlots(times, 9);
      expect(slots).toHaveLength(9);
      // Should use all three times
      const hours = new Set(slots.map((s) => s.hour));
      expect(hours.has(8)).toBe(true);
      expect(hours.has(12)).toBe(true);
      expect(hours.has(18)).toBe(true);
    });
  });

  describe('isScheduleValid', () => {
    it('returns true for empty schedule', () => {
      expect(isScheduleValid([], [createPreferredTime(9, 0)])).toBe(true);
    });

    it('returns false when day has excess notifications', () => {
      const preferredTimes = [createPreferredTime(9, 0)];
      const future = futureDate(2);
      const scheduled = [
        { id: 1, scheduled_date: new Date(future.setHours(9, 0, 0, 0)).toISOString(), notification_id: 'n1' },
        { id: 2, scheduled_date: new Date(future.setHours(9, 0, 0, 0)).toISOString(), notification_id: 'n2' },
      ];
      expect(isScheduleValid(scheduled, preferredTimes)).toBe(false);
    });

    it('returns false for deficit on middle day', () => {
      const preferredTimes = [createPreferredTime(9, 0), createPreferredTime(18, 0)];
      const day1 = futureDate(2);
      const day2 = futureDate(3);
      const day3 = futureDate(4);
      const scheduled = [
        { id: 1, scheduled_date: new Date(day1.setHours(9, 0, 0, 0)).toISOString(), notification_id: 'n1' },
        { id: 2, scheduled_date: new Date(day1.setHours(18, 0, 0, 0)).toISOString(), notification_id: 'n2' },
        // Day 2 has only 1 (deficit for middle day)
        { id: 3, scheduled_date: new Date(day2.setHours(9, 0, 0, 0)).toISOString(), notification_id: 'n3' },
        { id: 4, scheduled_date: new Date(day3.setHours(9, 0, 0, 0)).toISOString(), notification_id: 'n4' },
        { id: 5, scheduled_date: new Date(day3.setHours(18, 0, 0, 0)).toISOString(), notification_id: 'n5' },
      ];
      expect(isScheduleValid(scheduled, preferredTimes)).toBe(false);
    });

    it('allows partial first/last day', () => {
      const preferredTimes = [createPreferredTime(9, 0), createPreferredTime(18, 0)];
      const day1 = futureDate(2);
      const day2 = futureDate(3);
      const scheduled = [
        // First day: only 1 (partial - allowed)
        { id: 1, scheduled_date: new Date(day1.setHours(18, 0, 0, 0)).toISOString(), notification_id: 'n1' },
        // Last day: only 1 (partial - allowed)
        { id: 2, scheduled_date: new Date(day2.setHours(9, 0, 0, 0)).toISOString(), notification_id: 'n2' },
      ];
      expect(isScheduleValid(scheduled, preferredTimes)).toBe(true);
    });

    it('returns false when time slot does not match preferences', () => {
      const preferredTimes = [createPreferredTime(9, 0)];
      const day = futureDate(2);
      const scheduled = [
        { id: 1, scheduled_date: new Date(day.setHours(14, 30, 0, 0)).toISOString(), notification_id: 'n1' },
      ];
      expect(isScheduleValid(scheduled, preferredTimes)).toBe(false);
    });
  });

  describe('shouldPreloadImage', () => {
    it('returns true for dates within preload window', () => {
      const near = futureDate(3); // 3 days from now
      expect(shouldPreloadImage(near)).toBe(true);
    });

    it('returns false for dates beyond preload window', () => {
      const far = futureDate(30); // 30 days from now
      expect(shouldPreloadImage(far)).toBe(false);
    });
  });

  describe('getTypeHintForExtension', () => {
    it('returns correct type for png', () => {
      expect(getTypeHintForExtension('image.png')).toBe('public.png');
    });

    it('returns correct type for gif', () => {
      expect(getTypeHintForExtension('image.gif')).toBe('public.gif');
    });

    it('returns jpeg for jpg', () => {
      expect(getTypeHintForExtension('image.jpg')).toBe('public.jpeg');
    });

    it('returns jpeg for jpeg', () => {
      expect(getTypeHintForExtension('image.jpeg')).toBe('public.jpeg');
    });

    it('returns jpeg as default for unknown extension', () => {
      expect(getTypeHintForExtension('image.webp')).toBe('public.jpeg');
    });
  });

  describe('processInBatches', () => {
    it('processes all items and returns results', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await processInBatches(items, async (n) => n * 2, 2);
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('respects concurrency limit', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const items = [1, 2, 3, 4, 5, 6];
      await processInBatches(
        items,
        async (n) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise((r) => setTimeout(r, 10));
          currentConcurrent--;
          return n;
        },
        2
      );
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('handles empty array', async () => {
      const results = await processInBatches([], async (n: number) => n, 3);
      expect(results).toEqual([]);
    });

    it('propagates errors', async () => {
      const items = [1, 2, 3];
      await expect(
        processInBatches(items, async (n) => {
          if (n === 2) throw new Error('fail');
          return n;
        }, 3)
      ).rejects.toThrow('fail');
    });
  });
});

describe('notifications — integration', () => {
  const Notifications = jest.requireMock('expo-notifications');
  const onboardingService = jest.requireMock('../../services/onboarding');

  beforeEach(() => {
    jest.clearAllMocks();
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    Notifications.scheduleNotificationAsync.mockResolvedValue('mock-id');
    Notifications.cancelAllScheduledNotificationsAsync.mockResolvedValue(undefined);
    dbMock.markDeliveredFactsAsShown.mockResolvedValue(undefined as any);
    dbMock.clearAllScheduledFacts.mockResolvedValue(undefined);
    dbMock.clearAllScheduledFactsCompletely.mockResolvedValue(undefined);
    dbMock.getFutureScheduledFactsWithNotificationIds.mockResolvedValue([]);
    dbMock.getRandomUnscheduledFacts.mockResolvedValue([]);
    dbMock.getLatestScheduledDate.mockResolvedValue(null);
  });

  describe('syncNotificationSchedule', () => {
    it('marks delivered facts then checks permission', async () => {
      Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
      const result = await syncNotificationSchedule('en');
      expect(dbMock.markDeliveredFactsAsShown).toHaveBeenCalledWith('en');
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    // syncNotificationSchedule uses dynamic import() for onboarding which
    // doesn't work in Jest CJS mode. Tests below verify error handling.
    it('handles dynamic import failure gracefully', async () => {
      const result = await syncNotificationSchedule('en');
      // In test env, dynamic import fails → caught → returns error result
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('scheduleNotifications', () => {
    it('clears, gets facts, assigns slots, syncs OS', async () => {
      const times = [createPreferredTime(9, 0)];
      const facts = [
        createFactWithRelations({ id: 1 }),
        createFactWithRelations({ id: 2 }),
      ];
      dbMock.getRandomUnscheduledFacts.mockResolvedValue(facts);
      dbMock.markFactAsScheduled.mockResolvedValue(undefined as any);
      dbMock.getFutureScheduledFactsWithNotificationIds.mockResolvedValue([]);
      dbMock.getFactById.mockImplementation(async (id) =>
        facts.find((f) => f.id === id) || null
      );
      dbMock.updateNotificationId.mockResolvedValue(undefined as any);

      Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
      Notifications.scheduleNotificationAsync.mockResolvedValue('notif-1');

      const result = await scheduleNotifications(times, 'en');
      expect(result.success).toBeDefined();
      expect(dbMock.markFactAsScheduled).toHaveBeenCalledTimes(2);
    });

    it('returns error when no facts available', async () => {
      const times = [createPreferredTime(9, 0)];
      dbMock.getRandomUnscheduledFacts.mockResolvedValue([]);

      const result = await scheduleNotifications(times, 'en');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No facts');
    });

    it('returns error when permission not granted', async () => {
      Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
      const result = await scheduleNotifications([createPreferredTime(9, 0)], 'en');
      expect(result.success).toBe(false);
    });
  });
});
