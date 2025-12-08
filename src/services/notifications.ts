import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as database from './database';
import { i18n } from '../i18n/config';
import { SupportedLocale } from '../i18n/translations';

// iOS has a limit of 64 scheduled notifications
const MAX_SCHEDULED_NOTIFICATIONS = 64;

/**
 * Build notification content for a fact
 */
export function buildNotificationContent(
  fact: database.FactWithRelations,
  locale: SupportedLocale = 'en'
): Notifications.NotificationContentInput {
  // Set locale temporarily to get the correct app name
  const previousLocale = i18n.locale;
  i18n.locale = locale;
  const appName = i18n.t('appName');
  i18n.locale = previousLocale;

  const content: Notifications.NotificationContentInput = {
    title: appName,
    body: fact.summary || fact.content.substring(0, 100),
    data: { factId: fact.id },
  };

  // Add image attachment if available
  if (fact.image_url) {
    if (Platform.OS === 'ios') {
      content.attachments = [
        {
          identifier: `fact-${fact.id}`,
          url: fact.image_url,
          type: 'public.jpeg',
        },
      ];
    } else {
      // Android uses different approach for images
      content.data = { ...content.data, imageUrl: fact.image_url };
    }
  }

  return content;
}

/**
 * Configure notification behavior
 */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Schedule initial notifications for onboarding
 * @param notificationTime The time of day to send notifications
 * @param locale The user's locale for filtering facts
 * @returns Success status and count of scheduled notifications
 */
export async function scheduleInitialNotifications(
  notificationTime: Date,
  locale: SupportedLocale
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Get 64 random unscheduled facts
    const facts = await database.getRandomUnscheduledFacts(
      MAX_SCHEDULED_NOTIFICATIONS,
      locale
    );

    if (facts.length === 0) {
      return {
        success: false,
        count: 0,
        error: 'No facts available for scheduling',
      };
    }

    // Schedule notifications for each fact
    let successCount = 0;
    const now = new Date();
    const hour = notificationTime.getHours();
    const minute = notificationTime.getMinutes();

    // Check if notification time is later today
    const selectedTimeToday = new Date(now);
    selectedTimeToday.setHours(hour, minute, 0, 0);
    const startOffset = selectedTimeToday > now ? 0 : 1; // Start today if time hasn't passed, else tomorrow

    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      const scheduledDate = new Date(now);
      scheduledDate.setDate(scheduledDate.getDate() + i + startOffset); // Start today or tomorrow
      scheduledDate.setHours(hour, minute, 0, 0);

      try {
        // Schedule the notification FIRST - this must succeed before marking in DB
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: buildNotificationContent(fact, locale),
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: scheduledDate,
          },
        });

        // Only mark fact as scheduled in database AFTER notification is confirmed scheduled
        if (notificationId) {
          await database.markFactAsScheduled(
            fact.id,
            scheduledDate.toISOString(),
            notificationId
          );
          successCount++;
        }
      } catch (error) {
        // If scheduling fails, do NOT mark as scheduled in database
        console.error(`Failed to schedule notification for fact ${fact.id}:`, error);
      }
    }

    return {
      success: successCount > 0,
      count: successCount,
    };
  } catch (error) {
    console.error('Error scheduling initial notifications:', error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Mark one random fact as shown immediately in feed for new users
 * @param locale The user's locale for filtering facts
 * @returns Success status and the fact that was marked
 */
export async function showImmediateFact(
  locale: SupportedLocale
): Promise<{ success: boolean; fact?: database.FactWithRelations; error?: string }> {
  try {
    // Get 1 random unscheduled fact (excluding already scheduled and shown facts)
    const facts = await database.getRandomUnscheduledFacts(1, locale);

    if (facts.length === 0) {
      return {
        success: false,
        error: 'No facts available to show',
      };
    }

    const fact = facts[0];

    // Mark the fact as shown in feed with scheduled_date set to now
    // This ensures the fact is properly grouped by date in the feed
    await database.markFactAsShownWithDate(fact.id, new Date().toISOString());

    console.log(`Marked fact ${fact.id} as shown in feed for immediate display`);

    return {
      success: true,
      fact,
    };
  } catch (error) {
    console.error('Error showing immediate fact:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Refresh notification schedule by topping up to 64 notifications
 * @param notificationTime The time of day to send notifications
 * @param locale The user's locale for filtering facts
 * @returns Success status and count of newly scheduled notifications
 */
export async function refreshNotificationSchedule(
  notificationTime: Date,
  locale: SupportedLocale
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Get current scheduled count from OS (actual pending notifications, not database)
    const scheduledCount = await getScheduledNotificationsCount();

    // Only refresh if below max
    if (scheduledCount >= MAX_SCHEDULED_NOTIFICATIONS) {
      return {
        success: true,
        count: 0,
      };
    }

    // Calculate how many more we need
    const needed = MAX_SCHEDULED_NOTIFICATIONS - scheduledCount;

    // Get random unscheduled facts
    const facts = await database.getRandomUnscheduledFacts(needed, locale);

    if (facts.length === 0) {
      return {
        success: true,
        count: 0,
      };
    }

    // Find the last scheduled date to continue from there
    const allScheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    let lastScheduledDate = new Date();

    if (allScheduledNotifications.length > 0) {
      // Find the latest trigger date
      const latestTrigger = allScheduledNotifications.reduce((latest, notification) => {
        const trigger = notification.trigger;
        // Check if trigger has a date property (DateTriggerInput)
        if (trigger && 'date' in trigger && trigger.date) {
          const triggerDate = trigger.date instanceof Date ? trigger.date : new Date(trigger.date);
          return triggerDate > latest ? triggerDate : latest;
        }
        return latest;
      }, new Date());

      lastScheduledDate = latestTrigger;
    }

    // Schedule notifications for each fact
    let successCount = 0;
    const hour = notificationTime.getHours();
    const minute = notificationTime.getMinutes();

    // Check if notification time is later today (only relevant if no notifications scheduled yet)
    const now = new Date();
    const selectedTimeToday = new Date(now);
    selectedTimeToday.setHours(hour, minute, 0, 0);
    const startOffset = selectedTimeToday > now ? 0 : 1; // Start today if time hasn't passed, else tomorrow

    console.log(`🔔 Scheduling ${facts.length} new notifications...`);
    
    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      const scheduledDate = new Date(lastScheduledDate);
      scheduledDate.setDate(scheduledDate.getDate() + i + startOffset);
      scheduledDate.setHours(hour, minute, 0, 0);

      try {
        // Schedule the notification FIRST - this must succeed before marking in DB
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: buildNotificationContent(fact, locale),
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: scheduledDate,
          },
        });

        // Only mark fact as scheduled in database AFTER notification is confirmed scheduled
        if (notificationId) {
          await database.markFactAsScheduled(
            fact.id,
            scheduledDate.toISOString(),
            notificationId
          );
          console.log(`🔔 Scheduled fact ${fact.id} for ${scheduledDate.toISOString()}, notificationId: ${notificationId}`);
          successCount++;
        }
      } catch (error) {
        // If scheduling fails, do NOT mark as scheduled in database
        console.error(`Failed to schedule notification for fact ${fact.id}:`, error);
      }
    }

    return {
      success: successCount > 0,
      count: successCount,
    };
  } catch (error) {
    console.error('Error refreshing notification schedule:', error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Refresh notification schedule with multiple times per day (premium feature)
 * Tops up to 64 notifications distributed across time slots
 * @param times Array of times to send notifications
 * @param locale The user's locale for filtering facts
 * @returns Success status and count of newly scheduled notifications
 */
export async function refreshNotificationScheduleMultiple(
  times: Date[],
  locale: SupportedLocale
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (times.length === 0) {
      return {
        success: false,
        count: 0,
        error: 'No notification times provided',
      };
    }

    // Get current scheduled count from OS (actual pending notifications, not database)
    const scheduledCount = await getScheduledNotificationsCount();

    // Only refresh if below max
    if (scheduledCount >= MAX_SCHEDULED_NOTIFICATIONS) {
      return {
        success: true,
        count: 0,
      };
    }

    // Calculate how many more we need
    const needed = MAX_SCHEDULED_NOTIFICATIONS - scheduledCount;

    // Get random unscheduled facts
    const facts = await database.getRandomUnscheduledFacts(needed, locale);

    if (facts.length === 0) {
      return {
        success: true,
        count: 0,
      };
    }

    // Find the last scheduled date per time slot to continue from there
    const allScheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    
    // Sort times by hour to ensure chronological order
    const sortedTimes = [...times].sort((a, b) => {
      const aMinutes = a.getHours() * 60 + a.getMinutes();
      const bMinutes = b.getHours() * 60 + b.getMinutes();
      return aMinutes - bMinutes;
    });

    // Find the latest trigger date across all time slots
    let lastScheduledDate = new Date();
    if (allScheduledNotifications.length > 0) {
      const latestTrigger = allScheduledNotifications.reduce((latest, notification) => {
        const trigger = notification.trigger;
        if (trigger && 'date' in trigger && trigger.date) {
          const triggerDate = trigger.date instanceof Date ? trigger.date : new Date(trigger.date);
          return triggerDate > latest ? triggerDate : latest;
        }
        return latest;
      }, new Date());
      lastScheduledDate = latestTrigger;
    }

    let successCount = 0;
    const now = new Date();
    
    // Calculate facts per time slot for even distribution
    const factsPerSlot = Math.ceil(facts.length / sortedTimes.length);
    
    console.log(`🔔 Scheduling ${facts.length} new notifications across ${sortedTimes.length} time slots...`);

    let factIndex = 0;
    for (let timeIndex = 0; timeIndex < sortedTimes.length && factIndex < facts.length; timeIndex++) {
      const time = sortedTimes[timeIndex];
      const hour = time.getHours();
      const minute = time.getMinutes();

      // Determine start offset based on whether this time has passed today
      const selectedTimeToday = new Date(now);
      selectedTimeToday.setHours(hour, minute, 0, 0);
      
      // Calculate starting day - continue from last scheduled date
      let startDay = 0;
      if (allScheduledNotifications.length > 0) {
        // Start from the day after the last scheduled notification
        const daysDiff = Math.ceil((lastScheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        startDay = Math.max(0, daysDiff);
      } else {
        // No existing notifications - start today if time hasn't passed, else tomorrow
        startDay = selectedTimeToday > now ? 0 : 1;
      }

      // Schedule facts for this time slot
      for (let dayOffset = 0; dayOffset < factsPerSlot && factIndex < facts.length; dayOffset++) {
        const fact = facts[factIndex];
        const scheduledDate = new Date(now);
        scheduledDate.setDate(scheduledDate.getDate() + startDay + dayOffset);
        scheduledDate.setHours(hour, minute, 0, 0);

        // Skip if this date is in the past
        if (scheduledDate <= now) {
          scheduledDate.setDate(scheduledDate.getDate() + 1);
        }

        try {
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: buildNotificationContent(fact, locale),
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: scheduledDate,
            },
          });

          if (notificationId) {
            await database.markFactAsScheduled(
              fact.id,
              scheduledDate.toISOString(),
              notificationId
            );
            console.log(`🔔 Scheduled fact ${fact.id} for ${scheduledDate.toISOString()}, notificationId: ${notificationId}`);
            successCount++;
          }
          factIndex++;
        } catch (error) {
          console.error(`Failed to schedule notification for fact ${fact.id}:`, error);
          factIndex++;
        }
      }
    }

    return {
      success: successCount > 0,
      count: successCount,
    };
  } catch (error) {
    console.error('Error refreshing notification schedule (multiple times):', error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clear all scheduled notifications
 * @param clearPastScheduledDates If true, also clears past scheduled_dates (used when permissions are revoked)
 * @param locale Optional locale for marking delivered facts (required if not clearing past dates)
 */
export async function clearAllScheduledNotifications(
  clearPastScheduledDates: boolean = false,
  locale?: SupportedLocale
): Promise<void> {
  try {
    // Cancel all scheduled notifications from the OS
    await Notifications.cancelAllScheduledNotificationsAsync();

    // IMPORTANT: Before clearing DB, mark delivered facts as shown so they're preserved in feed
    // This ensures facts that were delivered but not yet viewed don't get lost
    if (!clearPastScheduledDates) {
      const markedCount = await database.markDeliveredFactsAsShown(locale);
      if (markedCount > 0) {
        console.log(`🔔 Marked ${markedCount} delivered facts as shown before clearing`);
      }
    }

    // Clear scheduling data from database
    if (clearPastScheduledDates) {
      // Clear ALL scheduled facts (including past ones) - used when permissions are revoked
      await database.clearAllScheduledFactsCompletely();
      console.log('🔔 All scheduled notifications cleared (including past scheduled_dates)');
    } else {
      // Only clear future scheduled facts (preserve past for feed grouping)
      await database.clearAllScheduledFacts();
      console.log('🔔 Future scheduled notifications cleared (past scheduled_dates preserved for feed)');
    }
  } catch (error) {
    console.error('Error clearing scheduled notifications:', error);
    throw error;
  }
}

/**
 * Reschedule all notifications with a new time
 * @param newTime The new time of day to send notifications
 * @param locale The user's locale for filtering facts
 */
export async function rescheduleNotifications(
  newTime: Date,
  locale: SupportedLocale
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Check if notifications are permitted first
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.log('🔔 Notification permission not granted, skipping reschedule');
      return {
        success: false,
        count: 0,
        error: 'Notification permission not granted',
      };
    }

    // Clear all existing notifications (this will mark delivered facts as shown first)
    await clearAllScheduledNotifications(false, locale);

    // Schedule new notifications with the new time
    return await scheduleInitialNotifications(newTime, locale);
  } catch (error) {
    console.error('Error rescheduling notifications:', error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get count of currently scheduled notifications
 */
export async function getScheduledNotificationsCount(): Promise<number> {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    return notifications.length;
  } catch (error) {
    console.error('Error getting scheduled notifications count:', error);
    return 0;
  }
}

/**
 * Check if notifications are enabled and top up to 64 if needed
 * This should be called on app start after onboarding is complete
 * @param locale The user's locale for filtering facts
 * @returns Success status and count of newly scheduled notifications
 */
export async function checkAndTopUpNotifications(
  locale: SupportedLocale
): Promise<{ success: boolean; count: number; skipped?: boolean; error?: string }> {
  try {
    // Step 1: ALWAYS mark delivered facts as shown first
    // This ensures facts that were delivered (scheduled_date <= now) are preserved in feed
    // even if we need to clear stale data or if permissions were revoked
    const markedCount = await database.markDeliveredFactsAsShown(locale);
    if (markedCount > 0) {
      console.log(`🔔 Marked ${markedCount} delivered facts as shown in feed`);
    }

    // Step 2: Check notification permissions
    const { status } = await Notifications.getPermissionsAsync();
    console.log(`🔔 Notification permission status: ${status}`);
    
    if (status !== 'granted') {
      console.log('🔔 Notifications not enabled, clearing scheduled notifications...');
      
      // Explicitly cancel all scheduled notifications from the OS
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Verify cancellation worked
      const remainingNotifications = await Notifications.getAllScheduledNotificationsAsync();
      console.log(`🔔 Cancelled notifications. Remaining in OS: ${remainingNotifications.length}`);
      
      // Sync DB state: clear ALL scheduled facts so they can be re-scheduled later
      // Note: delivered facts were already marked as shown in Step 1, so they won't be affected
      await database.clearAllScheduledFactsCompletely();
      console.log('🔔 Cleared scheduled data from DB (permissions not granted)');
      
      return {
        success: true,
        count: 0,
        skipped: true,
      };
    }

    // Step 3: Get current scheduled notifications from OS
    const allScheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const currentCount = allScheduledNotifications.length;
    console.log(`🔔 Current scheduled notifications in OS: ${currentCount}/${MAX_SCHEDULED_NOTIFICATIONS}`);

    // Step 4: Check DB scheduled count for comparison (future pending facts only)
    const dbScheduledCount = await database.getFutureScheduledFactsCount(locale);
    console.log(`🔔 Future pending scheduled facts in DB (shown_in_feed=0): ${dbScheduledCount}`);

    // Step 5: Sync DB with OS state
    if (currentCount === 0 && dbScheduledCount > 0) {
      // OS has 0 notifications but DB thinks there are scheduled facts - clear DB
      console.log('🔔 Mismatch detected: OS has 0 notifications but DB has scheduled facts. Clearing DB...');
      await database.clearAllScheduledFactsCompletely();
      console.log('🔔 Cleared all scheduled facts from DB to sync with OS');
    } else if (currentCount > 0 && dbScheduledCount === 0) {
      // OS has notifications but DB doesn't have scheduled facts
      // This means DB was cleared but OS wasn't (native module issue)
      // Solution: Clear OS notifications and reschedule fresh with user's current time preference
      console.log('🔔 Mismatch detected: OS has notifications but DB has 0 scheduled facts.');
      console.log('🔔 Clearing stale OS notifications and will reschedule with user time preference...');
      
      // Clear all stale notifications from OS
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Verify cleared
      const afterClear = await Notifications.getAllScheduledNotificationsAsync();
      console.log(`🔔 Cleared stale notifications. OS now has: ${afterClear.length}`);
      
      // Get user's notification time preference
      const onboardingService = await import('./onboarding');
      const notificationTimes = await onboardingService.getNotificationTimes();
      
      if (notificationTimes && notificationTimes.length > 0) {
        const times = notificationTimes.map(t => new Date(t));
        console.log(`🔔 Rescheduling with user's time preference: ${times.map(t => t.toLocaleTimeString()).join(', ')}`);
        
        // Schedule fresh notifications with user's time preference
        const result = times.length > 1
          ? await rescheduleNotificationsMultiple(times, locale)
          : await scheduleInitialNotifications(times[0], locale);
        
        console.log(`🔔 Rescheduled ${result.count} notifications with user's time preference`);
        return result;
      } else {
        console.log('🔔 No notification times set, skipping reschedule');
        return { success: true, count: 0, skipped: true };
      }
    } else if (currentCount > 0) {
      // Both have data - clear any facts that are marked as scheduled in DB but don't have a corresponding notification in the OS
      const validNotificationIds = allScheduledNotifications.map(n => n.identifier);
      const clearedCount = await database.clearStaleScheduledFacts(validNotificationIds);
      if (clearedCount > 0) {
        console.log(`🔔 Cleared ${clearedCount} stale scheduled facts from DB (not in OS)`);
      }
    }

    // Step 6: If count is already 64 or more, no need to top up
    if (currentCount >= MAX_SCHEDULED_NOTIFICATIONS) {
      console.log('🔔 Notification schedule is full, no top-up needed');
      return {
        success: true,
        count: 0,
      };
    }

    // Step 7: Get notification times from preferences (supports multiple times for premium users)
    // Import dynamically to avoid circular dependency
    const onboardingService = await import('./onboarding');
    const notificationTimes = await onboardingService.getNotificationTimes();

    if (!notificationTimes || notificationTimes.length === 0) {
      console.log('🔔 No notification times set, skipping top-up');
      return {
        success: true,
        count: 0,
        skipped: true,
      };
    }

    // Convert ISO strings to Date objects
    const times = notificationTimes.map(t => new Date(t));
    console.log(`🔔 Notification times configured: ${times.length} time slot(s)`);

    // Step 8: Schedule notifications
    // If OS has 0, do a full initial schedule. Otherwise, just top up.
    console.log(`🔔 Scheduling notifications (current: ${currentCount}, need: ${MAX_SCHEDULED_NOTIFICATIONS - currentCount})...`);
    
    let result;
    if (currentCount === 0) {
      // Full schedule - use initial schedule functions
      console.log('🔔 Performing full schedule (0 notifications in OS)...');
      if (times.length > 1) {
        result = await rescheduleNotificationsMultiple(times, locale);
      } else {
        result = await scheduleInitialNotifications(times[0], locale);
      }
    } else {
      // Top up existing schedule
      result = times.length > 1
        ? await refreshNotificationScheduleMultiple(times, locale)
        : await refreshNotificationSchedule(times[0], locale);
    }

    if (result.success) {
      console.log(`🔔 Successfully scheduled ${result.count} notifications`);
      
      // Verify scheduling worked
      const finalCount = await getScheduledNotificationsCount();
      console.log(`🔔 Final notification count in OS: ${finalCount}`);
    } else {
      console.error('🔔 Failed to schedule notifications:', result.error);
    }

    return result;
  } catch (error) {
    console.error('Error checking and topping up notifications:', error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reschedule all notifications with multiple times per day (premium feature)
 * @param times Array of times to send notifications
 * @param locale The user's locale for filtering facts
 */
export async function rescheduleNotificationsMultiple(
  times: Date[],
  locale: SupportedLocale
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Check if notifications are permitted first
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.log('🔔 Notification permission not granted, skipping reschedule');
      return {
        success: false,
        count: 0,
        error: 'Notification permission not granted',
      };
    }

    // Clear all existing notifications (this will mark delivered facts as shown first)
    await clearAllScheduledNotifications(false, locale);

    if (times.length === 0) {
      return {
        success: false,
        count: 0,
        error: 'No notification times provided',
      };
    }

    // Calculate how many facts per time slot
    const factsPerSlot = Math.floor(MAX_SCHEDULED_NOTIFICATIONS / times.length);

    // Get enough unscheduled facts for all time slots
    const totalFactsNeeded = factsPerSlot * times.length;
    const facts = await database.getRandomUnscheduledFacts(totalFactsNeeded, locale);

    if (facts.length === 0) {
      return {
        success: false,
        count: 0,
        error: 'No facts available for scheduling',
      };
    }

    let successCount = 0;
    const now = new Date();

    // Sort times by hour to ensure chronological order
    const sortedTimes = [...times].sort((a, b) => {
      const aMinutes = a.getHours() * 60 + a.getMinutes();
      const bMinutes = b.getHours() * 60 + b.getMinutes();
      return aMinutes - bMinutes;
    });

    // Schedule facts for each time slot
    let factIndex = 0;
    for (let timeIndex = 0; timeIndex < sortedTimes.length; timeIndex++) {
      const time = sortedTimes[timeIndex];
      const hour = time.getHours();
      const minute = time.getMinutes();

      // Determine start offset based on whether this time has passed today
      const selectedTimeToday = new Date(now);
      selectedTimeToday.setHours(hour, minute, 0, 0);
      const startOffset = selectedTimeToday > now ? 0 : 1;

      // Schedule facts for this time slot
      for (let dayOffset = 0; dayOffset < factsPerSlot && factIndex < facts.length; dayOffset++) {
        const fact = facts[factIndex];
        const scheduledDate = new Date(now);
        scheduledDate.setDate(scheduledDate.getDate() + dayOffset + startOffset);
        scheduledDate.setHours(hour, minute, 0, 0);

        try {
          // Schedule the notification FIRST - this must succeed before marking in DB
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: buildNotificationContent(fact, locale),
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: scheduledDate,
            },
          });

          // Only mark fact as scheduled in database AFTER notification is confirmed scheduled
          if (notificationId) {
            await database.markFactAsScheduled(
              fact.id,
              scheduledDate.toISOString(),
              notificationId
            );
            successCount++;
          }
          factIndex++;
        } catch (error) {
          // If scheduling fails, do NOT mark as scheduled in database
          console.error(`Failed to schedule notification for fact ${fact.id}:`, error);
          factIndex++;
        }
      }
    }

    console.log(`Scheduled ${successCount} notifications across ${times.length} time slots`);

    return {
      success: successCount > 0,
      count: successCount,
    };
  } catch (error) {
    console.error('Error rescheduling notifications with multiple times:', error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
