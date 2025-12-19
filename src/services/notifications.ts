import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';
import * as database from './database';
import { i18n } from '../i18n/config';
import { SupportedLocale } from '../i18n/translations';

// iOS has a limit of 64 scheduled notifications
const MAX_SCHEDULED_NOTIFICATIONS = 64;

// Only download images for notifications within this many days
// This avoids downloading all 64 images upfront
const DAYS_TO_PRELOAD_IMAGES = 7;

// Directory for notification images - use documentDirectory instead of cacheDirectory
// because cache can be cleared by iOS before scheduled notifications fire
const NOTIFICATION_IMAGES_DIR = `${FileSystem.documentDirectory}notification-images/`;

/**
 * Ensure the notification images directory exists
 */
async function ensureNotificationImagesDirExists(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(NOTIFICATION_IMAGES_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(NOTIFICATION_IMAGES_DIR, { intermediates: true });
    console.log(`📁 Created notification images directory: ${NOTIFICATION_IMAGES_DIR}`);
  }
}

/**
 * Convert an image to JPEG format if needed (iOS notification attachments don't support WebP well)
 */
async function convertToJpegIfNeeded(localUri: string, factId: number): Promise<string> {
  const extension = localUri.split('.').pop()?.toLowerCase();
  
  // If already JPEG or PNG, no conversion needed
  if (extension === 'jpg' || extension === 'jpeg' || extension === 'png') {
    return localUri;
  }
  
  // Convert WebP and other formats to JPEG
  console.log(`🖼️ Converting ${extension} to JPEG for fact ${factId}...`);
  
  try {
    const jpegUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.jpg`;
    
    // Check if converted version already exists
    const existingJpeg = await FileSystem.getInfoAsync(jpegUri);
    if (existingJpeg.exists) {
      console.log(`🖼️ Using existing JPEG conversion for fact ${factId}`);
      return jpegUri;
    }
    
    // Convert to JPEG using ImageManipulator
    const result = await ImageManipulator.manipulateAsync(
      localUri,
      [], // No transformations
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    
    // Move the result to our notification images directory with proper name
    await FileSystem.moveAsync({
      from: result.uri,
      to: jpegUri,
    });
    
    console.log(`🖼️ Converted to JPEG for fact ${factId}: ${jpegUri}`);
    return jpegUri;
  } catch (error) {
    console.warn(`🖼️ Failed to convert image for fact ${factId}:`, error);
    // Return original if conversion fails
    return localUri;
  }
}

/**
 * Download an image for notification attachment
 * Returns the local file URI or null if download fails
 */
async function downloadImageForNotification(imageUrl: string, factId: number): Promise<string | null> {
  try {
    await ensureNotificationImagesDirExists();
    
    // First check if we already have a JPEG version (converted previously)
    const jpegUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.jpg`;
    const jpegInfo = await FileSystem.getInfoAsync(jpegUri);
    if (jpegInfo.exists) {
      console.log(`🖼️ Using cached JPEG image for fact ${factId}: ${jpegUri}`);
      return jpegUri;
    }
    
    // Extract file extension from URL or default to jpg
    const urlPath = imageUrl.split('?')[0]; // Remove query params
    const extension = urlPath.split('.').pop()?.toLowerCase() || 'jpg';
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const fileExtension = validExtensions.includes(extension) ? extension : 'jpg';
    
    const localUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.${fileExtension}`;
    
    // Check if already downloaded (original format)
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    let downloadedUri = localUri;
    
    if (fileInfo.exists) {
      console.log(`🖼️ Using cached image for fact ${factId}: ${localUri}`);
      downloadedUri = localUri;
    } else {
      // Download the image
      console.log(`🖼️ Downloading image for fact ${factId}: ${imageUrl}`);
      const downloadResult = await FileSystem.downloadAsync(imageUrl, localUri);
      
      if (downloadResult.status !== 200) {
        console.warn(`🖼️ Failed to download notification image for fact ${factId}: status ${downloadResult.status}`);
        return null;
      }
      
      console.log(`🖼️ Downloaded image for fact ${factId}: ${downloadResult.uri}`);
      downloadedUri = downloadResult.uri;
    }
    
    // Convert to JPEG if needed (WebP not well supported by iOS notification attachments)
    const finalUri = await convertToJpegIfNeeded(downloadedUri, factId);
    return finalUri;
  } catch (error) {
    console.warn(`🖼️ Error downloading notification image for fact ${factId}:`, error);
    return null;
  }
}

/**
 * Get the type hint for iOS notification attachment based on file extension
 * Note: We convert most images to JPEG for better iOS notification compatibility
 */
function getTypeHintForExtension(uri: string): string {
  const extension = uri.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'public.png';
    case 'gif':
      return 'public.gif';
    case 'jpg':
    case 'jpeg':
    default:
      // WebP and other formats should have been converted to JPEG
      return 'public.jpeg';
  }
}

/**
 * Get the local notification image path for a fact if it exists
 * Returns the JPEG path (converted for iOS notification compatibility)
 * @param factId The ID of the fact
 * @returns The local file URI or null if not found
 */
export async function getLocalNotificationImagePath(factId: number): Promise<string | null> {
  try {
    // Check for JPEG version first (most common - converted for iOS)
    const jpegUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.jpg`;
    const jpegInfo = await FileSystem.getInfoAsync(jpegUri);
    if (jpegInfo.exists) {
      return jpegUri;
    }
    
    // Check for WebP version (original download before conversion)
    const webpUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.webp`;
    const webpInfo = await FileSystem.getInfoAsync(webpUri);
    if (webpInfo.exists) {
      return webpUri;
    }
    
    // Check for PNG version
    const pngUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.png`;
    const pngInfo = await FileSystem.getInfoAsync(pngUri);
    if (pngInfo.exists) {
      return pngUri;
    }
    
    return null;
  } catch (error) {
    console.warn(`🖼️ Error checking local notification image for fact ${factId}:`, error);
    return null;
  }
}

/**
 * Delete notification image(s) for a specific fact
 * Removes both the original and any converted versions
 * @param factId The ID of the fact
 */
export async function deleteNotificationImage(factId: number): Promise<void> {
  try {
    const extensions = ['jpg', 'jpeg', 'webp', 'png', 'gif'];
    
    for (const ext of extensions) {
      const uri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.${ext}`;
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
        console.log(`🗑️ Deleted notification image: ${uri}`);
      }
    }
  } catch (error) {
    console.warn(`🗑️ Error deleting notification image for fact ${factId}:`, error);
  }
}

/**
 * Clean up old notification images that are older than the specified days
 * This should be called on app start to prevent disk space buildup
 * @param maxAgeDays Maximum age in days before images are deleted (default: 7)
 */
export async function cleanupOldNotificationImages(maxAgeDays: number = 7): Promise<number> {
  try {
    await ensureNotificationImagesDirExists();
    
    const dirInfo = await FileSystem.getInfoAsync(NOTIFICATION_IMAGES_DIR);
    if (!dirInfo.exists) {
      return 0;
    }
    
    const files = await FileSystem.readDirectoryAsync(NOTIFICATION_IMAGES_DIR);
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = `${NOTIFICATION_IMAGES_DIR}${file}`;
      
      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        
        if (fileInfo.exists && fileInfo.modificationTime) {
          const fileAgeMs = now - fileInfo.modificationTime * 1000;
          
          if (fileAgeMs > maxAgeMs) {
            await FileSystem.deleteAsync(filePath, { idempotent: true });
            console.log(`🗑️ Cleaned up old notification image: ${file} (${Math.round(fileAgeMs / (24 * 60 * 60 * 1000))} days old)`);
            deletedCount++;
          }
        }
      } catch (fileError) {
        console.warn(`🗑️ Error processing file ${file}:`, fileError);
      }
    }
    
    if (deletedCount > 0) {
      console.log(`🗑️ Cleaned up ${deletedCount} old notification images`);
    }
    
    return deletedCount;
  } catch (error) {
    console.warn('🗑️ Error cleaning up old notification images:', error);
    return 0;
  }
}

/**
 * Check if a scheduled date is within the image preload window
 */
function shouldPreloadImage(scheduledDate: Date): boolean {
  const now = new Date();
  const daysUntilNotification = Math.ceil(
    (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysUntilNotification <= DAYS_TO_PRELOAD_IMAGES;
}

/**
 * Preload images for upcoming scheduled notifications
 * This is called when the app opens to download images for notifications
 * that are now within the preload window
 */
export async function preloadUpcomingNotificationImages(locale: SupportedLocale): Promise<number> {
  if (Platform.OS !== 'ios') {
    // Only iOS needs image preloading for notification attachments
    return 0;
  }

  try {
    // Get all scheduled notifications from the OS
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    
    if (scheduledNotifications.length === 0) {
      return 0;
    }

    const now = new Date();
    let preloadedCount = 0;

    for (const notification of scheduledNotifications) {
      const trigger = notification.trigger;
      
      // Get the trigger date
      let triggerDate: Date | null = null;
      if (trigger && 'date' in trigger && trigger.date) {
        triggerDate = trigger.date instanceof Date ? trigger.date : new Date(trigger.date);
      }

      if (!triggerDate) continue;

      // Check if this notification is within the preload window
      const daysUntil = Math.ceil((triggerDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntil <= DAYS_TO_PRELOAD_IMAGES && daysUntil > 0) {
        // Get fact ID from notification data
        const factId = notification.content.data?.factId as number | undefined;
        
        if (factId) {
          // Check if image already exists
          const jpegUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.jpg`;
          const jpegInfo = await FileSystem.getInfoAsync(jpegUri);
          
          if (!jpegInfo.exists) {
            // Get the fact from database to get the image URL
            const fact = await database.getFactById(factId);
            
            if (fact?.image_url) {
              console.log(`🖼️ Preloading image for upcoming notification (fact ${factId}, fires in ${daysUntil} days)`);
              const localUri = await downloadImageForNotification(fact.image_url, factId);
              
              if (localUri) {
                preloadedCount++;
              }
            }
          }
        }
      }
    }

    if (preloadedCount > 0) {
      console.log(`🖼️ Preloaded ${preloadedCount} images for upcoming notifications`);
    }

    return preloadedCount;
  } catch (error) {
    console.warn('🖼️ Error preloading notification images:', error);
    return 0;
  }
}

/**
 * Build notification content for a fact
 * Downloads image to local storage for iOS attachments (only for upcoming notifications)
 * @param fact The fact to build content for
 * @param locale The locale to use for the notification
 * @param scheduledDate The date the notification will fire (used to decide if we should download image)
 */
export async function buildNotificationContent(
  fact: database.FactWithRelations,
  locale: SupportedLocale = 'en',
  scheduledDate?: Date
): Promise<Notifications.NotificationContentInput> {
  // Set locale temporarily to get the correct app name
  const previousLocale = i18n.locale;
  i18n.locale = locale;
  const appName = i18n.t('appName');
  i18n.locale = previousLocale;

  const content: Notifications.NotificationContentInput = {
    title: appName,
    body: fact.title || fact.content.substring(0, 100),
    data: { factId: fact.id },
  };

  // Add image attachment if available (iOS only - Android local notifications don't support images)
  // Only download images for notifications within the preload window to avoid downloading all 64 upfront
  const shouldDownloadImage = scheduledDate ? shouldPreloadImage(scheduledDate) : true;
  
  if (fact.image_url && Platform.OS === 'ios' && shouldDownloadImage) {
    console.log(`🖼️ Preparing image attachment for fact ${fact.id}, image_url: ${fact.image_url}`);
    
    // Download image to local storage - iOS requires local file URLs for attachments
    const localImageUri = await downloadImageForNotification(fact.image_url, fact.id);
    
    if (localImageUri) {
      const typeHint = getTypeHintForExtension(localImageUri);
      console.log(`🖼️ Creating attachment with uri: ${localImageUri}, typeHint: ${typeHint}`);
      
      // IMPORTANT: expo-notifications native iOS code (Records.swift line 408) expects 'uri' key, not 'url'
      // This is a mismatch with the TypeScript types which define 'url'
      // We create the object with both keys to ensure compatibility
      const attachment = {
        identifier: `fact-${fact.id}`,
        uri: localImageUri,  // This is what native iOS code actually looks for
        url: localImageUri,  // TypeScript types expect this
        typeHint: typeHint,  // Native code uses typeHint for UNNotificationAttachmentOptionsTypeHintKey
      };
      
      // Cast to any to bypass TypeScript's type checking since native code expects different keys
      content.attachments = [attachment] as any;
      console.log(`🖼️ Attachment created:`, JSON.stringify(content.attachments));
    } else {
      console.warn(`🖼️ No local image available for fact ${fact.id}, skipping attachment`);
    }
  } else if (fact.image_url && Platform.OS === 'ios' && !shouldDownloadImage) {
    // Log that we're skipping image download for distant notifications
    const daysUntil = scheduledDate ? Math.ceil((scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
    console.log(`🖼️ Skipping image download for fact ${fact.id} (scheduled in ${daysUntil} days, preload window is ${DAYS_TO_PRELOAD_IMAGES} days)`);
  }

  // For Android, store image URL in data for potential future use
  if (fact.image_url && Platform.OS === 'android') {
    content.data = { ...content.data, imageUrl: fact.image_url };
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
        // Build notification content (downloads image only for upcoming notifications)
        const notificationContent = await buildNotificationContent(fact, locale, scheduledDate);
        
        // Schedule the notification FIRST - this must succeed before marking in DB
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: notificationContent,
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

    // Find the last scheduled date from the database (more reliable than parsing OS notification triggers)
    const now = new Date();
    const hour = notificationTime.getHours();
    const minute = notificationTime.getMinutes();

    // Determine the starting day offset
    let startDayOffset: number;
    
    // Get the latest scheduled date from the database
    const latestScheduledDateStr = await database.getLatestScheduledDate(locale);
    
    if (latestScheduledDateStr) {
      const latestScheduledDate = new Date(latestScheduledDateStr);
      
      // Calculate days from today to the last scheduled date
      const todayMidnight = new Date(now);
      todayMidnight.setHours(0, 0, 0, 0);
      const lastScheduledMidnight = new Date(latestScheduledDate);
      lastScheduledMidnight.setHours(0, 0, 0, 0);
      
      const daysToLastScheduled = Math.round((lastScheduledMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`🔔 Latest scheduled notification in DB is on ${latestScheduledDate.toISOString()}, ${daysToLastScheduled} days from today`);
      
      // Start from the day AFTER the last scheduled notification
      startDayOffset = daysToLastScheduled + 1;
    } else {
      // No existing scheduled notifications - start today if time hasn't passed, else tomorrow
      console.log('🔔 No scheduled notifications in DB, starting fresh');
      const selectedTimeToday = new Date(now);
      selectedTimeToday.setHours(hour, minute, 0, 0);
      startDayOffset = selectedTimeToday > now ? 0 : 1;
    }

    console.log(`🔔 Topping up: scheduling ${facts.length} new notifications starting from day +${startDayOffset}`);
    
    let successCount = 0;
    
    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      const scheduledDate = new Date(now);
      scheduledDate.setDate(scheduledDate.getDate() + startDayOffset + i);
      scheduledDate.setHours(hour, minute, 0, 0);

      try {
        // Build notification content (downloads image only for upcoming notifications)
        const notificationContent = await buildNotificationContent(fact, locale, scheduledDate);
        
        // Schedule the notification FIRST - this must succeed before marking in DB
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: notificationContent,
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
          console.log(`🔔 Scheduled fact ${fact.id} for ${scheduledDate.toISOString()}`);
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
 * Properly tracks the last scheduled date for EACH time slot to avoid duplicates
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

    // Sort times by hour to ensure chronological order
    const sortedTimes = [...times].sort((a, b) => {
      const aMinutes = a.getHours() * 60 + a.getMinutes();
      const bMinutes = b.getHours() * 60 + b.getMinutes();
      return aMinutes - bMinutes;
    });

    const now = new Date();
    const timeSlotsPerDay = sortedTimes.length;

    // Get the latest scheduled date from the database
    const latestScheduledDateStr = await database.getLatestScheduledDate(locale);
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);

    // Build a list of time slots to fill
    // Each slot is { dayOffset: number, timeIndex: number }
    const slotsToFill: Array<{ dayOffset: number; timeIndex: number }> = [];
    
    if (latestScheduledDateStr) {
      const latestScheduledDate = new Date(latestScheduledDateStr);
      const lastScheduledMidnight = new Date(latestScheduledDate);
      lastScheduledMidnight.setHours(0, 0, 0, 0);
      
      // Calculate days from today to the last scheduled day (using LOCAL dates)
      const daysToLastScheduled = Math.round((lastScheduledMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`🔔 Latest scheduled notification in DB is on ${latestScheduledDate.toISOString()}, ${daysToLastScheduled} days from today`);
      
      // Get the LOCAL date string for the last scheduled day
      // We need to use LOCAL date because that's how we compare with user's notification times
      const year = lastScheduledMidnight.getFullYear();
      const month = String(lastScheduledMidnight.getMonth() + 1).padStart(2, '0');
      const day = String(lastScheduledMidnight.getDate()).padStart(2, '0');
      const lastScheduledDayLocalStr = `${year}-${month}-${day}`;
      
      // Query database using UTC date (since that's how dates are stored)
      // But we need to find all notifications for this LOCAL day
      // A local day spans from local midnight to local midnight, which in UTC is:
      // startUTC = localMidnight.toISOString()
      // endUTC = (localMidnight + 24h).toISOString()
      const localDayStart = new Date(lastScheduledMidnight);
      const localDayEnd = new Date(lastScheduledMidnight);
      localDayEnd.setDate(localDayEnd.getDate() + 1);
      
      const existingTimesOnLastDay = await database.getScheduledTimesInRange(
        localDayStart.toISOString(),
        localDayEnd.toISOString(),
        locale
      );
      
      console.log(`🔔 Last scheduled day (${lastScheduledDayLocalStr}) has ${existingTimesOnLastDay.length}/${timeSlotsPerDay} time slots filled`);
      
      // Find which time slots are still available on the last scheduled day
      // Use LOCAL hours since user's notification times are in local time
      const filledTimeSlots = new Set<string>();
      for (const existingTime of existingTimesOnLastDay) {
        const existingDate = new Date(existingTime);
        // getHours() returns LOCAL hours, which matches how user selected times
        const slotKey = `${existingDate.getHours()}:${existingDate.getMinutes()}`;
        filledTimeSlots.add(slotKey);
        console.log(`🔔 Found filled slot: ${slotKey} (${existingTime})`);
      }
      
      // First, add remaining slots from the last scheduled day (if any)
      for (let timeIndex = 0; timeIndex < timeSlotsPerDay; timeIndex++) {
        const time = sortedTimes[timeIndex];
        const slotKey = `${time.getHours()}:${time.getMinutes()}`;
        
        if (!filledTimeSlots.has(slotKey)) {
          // This slot is not filled on the last scheduled day
          console.log(`🔔 Slot ${slotKey} is available on day ${daysToLastScheduled}`);
          slotsToFill.push({ dayOffset: daysToLastScheduled, timeIndex });
        }
      }
      
      // Then add slots for subsequent days
      let dayOffset = daysToLastScheduled + 1;
      while (slotsToFill.length < facts.length) {
        for (let timeIndex = 0; timeIndex < timeSlotsPerDay && slotsToFill.length < facts.length; timeIndex++) {
          slotsToFill.push({ dayOffset, timeIndex });
        }
        dayOffset++;
      }
    } else {
      // No existing scheduled notifications - start from today/tomorrow based on time
      console.log('🔔 No scheduled notifications in DB, starting fresh');
      
      // Determine starting day
      let startDayOffset = 1; // Default to starting tomorrow
      for (const time of sortedTimes) {
        const timeToday = new Date(now);
        timeToday.setHours(time.getHours(), time.getMinutes(), 0, 0);
        if (timeToday > now) {
          startDayOffset = 0;
          break;
        }
      }
      
      // Build slots starting from startDayOffset
      let dayOffset = startDayOffset;
      while (slotsToFill.length < facts.length) {
        for (let timeIndex = 0; timeIndex < timeSlotsPerDay && slotsToFill.length < facts.length; timeIndex++) {
          slotsToFill.push({ dayOffset, timeIndex });
        }
        dayOffset++;
      }
    }

    console.log(`🔔 Topping up: scheduling ${facts.length} new notifications across ${timeSlotsPerDay} time slots`);

    let successCount = 0;

    // Schedule facts using the pre-calculated slots
    for (let i = 0; i < facts.length && i < slotsToFill.length; i++) {
      const fact = facts[i];
      const slot = slotsToFill[i];
      const time = sortedTimes[slot.timeIndex];
      const hour = time.getHours();
      const minute = time.getMinutes();

      // Calculate the scheduled date
      const scheduledDate = new Date(now);
      scheduledDate.setDate(scheduledDate.getDate() + slot.dayOffset);
      scheduledDate.setHours(hour, minute, 0, 0);

      // Skip if this specific time slot is in the past
      if (scheduledDate <= now) {
        console.log(`🔔 Skipping past time slot: ${scheduledDate.toISOString()}`);
        continue;
      }

      try {
        // Build notification content (downloads image only for upcoming notifications)
        const notificationContent = await buildNotificationContent(fact, locale, scheduledDate);
        
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: notificationContent,
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
          console.log(`🔔 Scheduled fact ${fact.id} for ${scheduledDate.toISOString()}`);
          successCount++;
        }
      } catch (error) {
        console.error(`Failed to schedule notification for fact ${fact.id}:`, error);
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

    // Step 9: Preload images for upcoming notifications that may have been scheduled without images
    // This ensures notifications entering the preload window get their images downloaded
    await preloadUpcomingNotificationImages(locale);

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
 * Distributes notifications evenly: Day 1 gets time1/time2/time3, Day 2 gets time1/time2/time3, etc.
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

    // Get facts to schedule (up to max limit)
    const facts = await database.getRandomUnscheduledFacts(MAX_SCHEDULED_NOTIFICATIONS, locale);

    if (facts.length === 0) {
      return {
        success: false,
        count: 0,
        error: 'No facts available for scheduling',
      };
    }

    let successCount = 0;
    const now = new Date();

    // Sort times by hour to ensure chronological order within each day
    const sortedTimes = [...times].sort((a, b) => {
      const aMinutes = a.getHours() * 60 + a.getMinutes();
      const bMinutes = b.getHours() * 60 + b.getMinutes();
      return aMinutes - bMinutes;
    });

    // Calculate how many days we'll need to cover all facts
    const timeSlotsPerDay = sortedTimes.length;
    const totalDays = Math.ceil(facts.length / timeSlotsPerDay);

    console.log(`🔔 Scheduling ${facts.length} notifications across ${timeSlotsPerDay} time slots over ${totalDays} days`);

    // Determine starting day offset: start today only if any time slot is still in the future
    const todayDate = new Date(now);
    todayDate.setSeconds(0, 0);
    
    // Check if any time slot is still available today
    let startDayOffset = 1; // Default to starting tomorrow
    for (const time of sortedTimes) {
      const timeToday = new Date(now);
      timeToday.setHours(time.getHours(), time.getMinutes(), 0, 0);
      if (timeToday > now) {
        startDayOffset = 0; // At least one time is still in the future today
        break;
      }
    }

    // Schedule facts by iterating through days, then time slots within each day
    let factIndex = 0;
    for (let dayOffset = 0; dayOffset < totalDays && factIndex < facts.length; dayOffset++) {
      for (let timeIndex = 0; timeIndex < timeSlotsPerDay && factIndex < facts.length; timeIndex++) {
        const time = sortedTimes[timeIndex];
        const hour = time.getHours();
        const minute = time.getMinutes();

        // Calculate the scheduled date
        const scheduledDate = new Date(now);
        scheduledDate.setDate(scheduledDate.getDate() + dayOffset + startDayOffset);
        scheduledDate.setHours(hour, minute, 0, 0);

        // Skip if this specific time slot is in the past (only matters for day 0)
        if (scheduledDate <= now) {
          continue; // Skip this time slot, don't consume a fact
        }

        const fact = facts[factIndex];

        try {
          // Build notification content (downloads image only for upcoming notifications)
          const notificationContent = await buildNotificationContent(fact, locale, scheduledDate);
          
          // Schedule the notification FIRST - this must succeed before marking in DB
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: notificationContent,
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
            console.log(`🔔 Scheduled fact ${fact.id} for ${scheduledDate.toISOString()}`);
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

    console.log(`🔔 Successfully scheduled ${successCount} notifications across ${times.length} time slots`);

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
