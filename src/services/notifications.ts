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
            title: fact.title || 'Today\'s Fact',
            body: fact.summary || fact.content.substring(0, 100),
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
 * Mark one random fact as shown immediately in feed for new users
 * @param locale The user's locale for filtering facts
 * @returns Success status and the fact that was marked
 */
export async function showImmediateFact(
  locale: string
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

    // Mark the fact as shown in feed
    await database.markFactAsShown(fact.id);

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
            title: fact.title || 'Today\'s Fact',
            body: fact.summary || fact.content.substring(0, 100),
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

/**
 * Reschedule all notifications with multiple times per day (premium feature)
 * @param times Array of times to send notifications
 * @param locale The user's locale for filtering facts
 */
export async function rescheduleNotificationsMultiple(
  times: Date[],
  locale: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Clear all existing notifications
    await clearAllScheduledNotifications();

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
          // Schedule the notification
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: fact.title || 'Today\'s Fact',
              body: fact.summary || fact.content.substring(0, 100),
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
          factIndex++;
        } catch (error) {
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
