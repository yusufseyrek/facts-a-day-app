import * as Notifications from 'expo-notifications';
import * as database from './database';

// iOS has a limit of 64 scheduled notifications
const MAX_SCHEDULED_NOTIFICATIONS = 64;

/**
 * Configure notification behavior
 */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
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
  locale: string
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
        // Schedule the notification
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Today\'s Fact',
            body: fact.title || fact.content.substring(0, 100),
            data: { factId: fact.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: scheduledDate,
          },
        });

        // Mark fact as scheduled in database
        await database.markFactAsScheduled(
          fact.id,
          scheduledDate.toISOString(),
          notificationId
        );

        successCount++;
      } catch (error) {
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
 * Refresh notification schedule by topping up to 64 notifications
 * @param notificationTime The time of day to send notifications
 * @param locale The user's locale for filtering facts
 * @returns Success status and count of newly scheduled notifications
 */
export async function refreshNotificationSchedule(
  notificationTime: Date,
  locale: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Get current scheduled count
    const scheduledCount = await database.getScheduledFactsCount(locale);

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

    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      const scheduledDate = new Date(lastScheduledDate);
      scheduledDate.setDate(scheduledDate.getDate() + i + startOffset);
      scheduledDate.setHours(hour, minute, 0, 0);

      try {
        // Schedule the notification
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Today\'s Fact',
            body: fact.title || fact.content.substring(0, 100),
            data: { factId: fact.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: scheduledDate,
          },
        });

        // Mark fact as scheduled in database
        await database.markFactAsScheduled(
          fact.id,
          scheduledDate.toISOString(),
          notificationId
        );

        successCount++;
      } catch (error) {
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
 * Clear all scheduled notifications
 */
export async function clearAllScheduledNotifications(): Promise<void> {
  try {
    // Cancel all scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Clear all scheduling data from database
    await database.clearAllScheduledFacts();

    console.log('All scheduled notifications cleared');
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
  locale: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Clear all existing notifications
    await clearAllScheduledNotifications();

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
