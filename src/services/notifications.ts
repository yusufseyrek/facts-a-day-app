import { Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Notifications from 'expo-notifications';

import { NOTIFICATION_SETTINGS } from '../config/app';
import { i18n } from '../i18n/config';

import * as database from './database';
import { downloadImage } from './images';

import type { SupportedLocale } from '../i18n/translations';

// ============================================================================
// CONSTANTS
// ============================================================================

// Directory for notification images - use documentDirectory (persists unlike cache)
const NOTIFICATION_IMAGES_DIR = `${FileSystem.documentDirectory}${NOTIFICATION_SETTINGS.IMAGES_DIR_NAME}`;

// ============================================================================
// TYPES
// ============================================================================

export type SyncSource =
  | 'cold_start'
  | 'foreground'
  | 'notification_tap'
  | 'home_focus'
  | 'notification_received'
  | 'time_change'
  | 'language_change'
  | 'categories_change'
  | 'unknown';

export interface SyncResult {
  success: boolean;
  count: number;
  skipped?: boolean;
  repaired?: boolean;
  error?: string;
}

export interface ScheduleResult {
  success: boolean;
  count: number;
  error?: string;
}

interface TimeSlot {
  date: Date;
  hour: number;
  minute: number;
}

export interface SyncLogEntry {
  timestamp: string;
  source: SyncSource;
  action: 'sync' | 'schedule' | 'reschedule';
  scheduleValid?: boolean;
  osCountBefore?: number;
  osCountAfter?: number;
  dbCount?: number;
  repaired?: boolean;
  toppedUp?: number;
  skipped?: boolean;
  error?: string;
}

// ============================================================================
// CONCURRENCY GUARD
// ============================================================================

let _syncLock: Promise<SyncResult> | null = null;
let _scheduleLock: Promise<ScheduleResult> | null = null;

// ============================================================================
// SYNC LOGGING
// ============================================================================

const SYNC_LOG_KEY = '@notification_sync_log';
const MAX_LOG_ENTRIES = 50;

async function appendSyncLog(entry: SyncLogEntry): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_LOG_KEY);
    const log: SyncLogEntry[] = raw ? JSON.parse(raw) : [];
    log.push(entry);
    // Keep only the last N entries
    const trimmed = log.slice(-MAX_LOG_ENTRIES);
    await AsyncStorage.setItem(SYNC_LOG_KEY, JSON.stringify(trimmed));
  } catch {
    // Never let logging break the sync flow
  }
}

export async function getSyncLog(): Promise<SyncLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearSyncLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SYNC_LOG_KEY);
  } catch {
    // ignore
  }
}

// ============================================================================
// IMAGE HANDLING (unchanged from original)
// ============================================================================

async function ensureNotificationImagesDirExists(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(NOTIFICATION_IMAGES_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(NOTIFICATION_IMAGES_DIR, { intermediates: true });
  }
}

const JPEG_CONVERSION_MAX_ATTEMPTS = 3;
const JPEG_CONVERSION_RETRY_DELAY_MS = 100;

async function convertToJpegIfNeeded(localUri: string, factId: number): Promise<string | null> {
  const extension = localUri.split('.').pop()?.toLowerCase();

  // Already JPEG, no conversion needed
  if (extension === 'jpg' || extension === 'jpeg') {
    return localUri;
  }

  const jpegUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.jpg`;

  // Check if already converted
  try {
    const existingJpeg = await FileSystem.getInfoAsync(jpegUri);
    if (existingJpeg.exists) {
      return jpegUri;
    }
  } catch {
    // Continue to conversion
  }

  // Retry conversion up to 3 times
  for (let attempt = 0; attempt < JPEG_CONVERSION_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await ImageManipulator.manipulateAsync(localUri, [], {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });

      await FileSystem.moveAsync({
        from: result.uri,
        to: jpegUri,
      });

      return jpegUri;
    } catch (error) {
      if (__DEV__) {
        console.warn(
          `⚠️ JPEG conversion attempt ${attempt + 1}/${JPEG_CONVERSION_MAX_ATTEMPTS} failed for fact ${factId}:`,
          error
        );
      }

      // Wait before retrying (except on last attempt)
      if (attempt < JPEG_CONVERSION_MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, JPEG_CONVERSION_RETRY_DELAY_MS));
      }
    }
  }

  // All attempts failed
  if (__DEV__) {
    console.error(
      `❌ JPEG conversion failed after ${JPEG_CONVERSION_MAX_ATTEMPTS} attempts for fact ${factId}`
    );
  }
  return null;
}

const IMAGE_DOWNLOAD_MAX_ATTEMPTS = 3;
const IMAGE_DOWNLOAD_RETRY_DELAY_MS = 100;

async function downloadImageForNotification(
  imageUrl: string,
  factId: number
): Promise<string | null> {
  // Check if JPEG already exists (fast path)
  const jpegUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.jpg`;
  try {
    const jpegInfo = await FileSystem.getInfoAsync(jpegUri);
    if (jpegInfo.exists) {
      return jpegUri;
    }
  } catch {
    // Continue to download
  }

  await ensureNotificationImagesDirExists();

  // Retry the entire download + conversion process up to 3 times
  for (let attempt = 0; attempt < IMAGE_DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const downloadedUri = await downloadImage(imageUrl, factId);

      if (!downloadedUri) {
        if (__DEV__) {
          console.warn(
            `⚠️ Image download attempt ${attempt + 1}/${IMAGE_DOWNLOAD_MAX_ATTEMPTS} failed for fact ${factId}: no URI returned`
          );
        }
        // Wait before retrying (except on last attempt)
        if (attempt < IMAGE_DOWNLOAD_MAX_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, IMAGE_DOWNLOAD_RETRY_DELAY_MS));
        }
        continue;
      }

      // Copy to notification images directory
      const urlPath = imageUrl.split('?')[0];
      const extension = urlPath.split('.').pop()?.toLowerCase() || 'webp';
      const validExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      const fileExtension = validExtensions.includes(extension) ? extension : 'webp';
      const notificationUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.${fileExtension}`;

      if (downloadedUri !== notificationUri) {
        try {
          await FileSystem.copyAsync({
            from: downloadedUri,
            to: notificationUri,
          });
        } catch {
          // If copy fails, try to convert directly from downloaded location
          const finalUri = await convertToJpegIfNeeded(downloadedUri, factId);
          if (finalUri) {
            return finalUri;
          }
          // Conversion failed, continue to retry
          if (attempt < IMAGE_DOWNLOAD_MAX_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, IMAGE_DOWNLOAD_RETRY_DELAY_MS));
          }
          continue;
        }
      }

      // Convert to JPEG for iOS notification compatibility
      const finalUri = await convertToJpegIfNeeded(notificationUri, factId);
      if (finalUri) {
        return finalUri;
      }

      // Conversion failed, retry
      if (__DEV__) {
        console.warn(
          `⚠️ JPEG conversion failed on attempt ${attempt + 1}/${IMAGE_DOWNLOAD_MAX_ATTEMPTS} for fact ${factId}`
        );
      }
      if (attempt < IMAGE_DOWNLOAD_MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, IMAGE_DOWNLOAD_RETRY_DELAY_MS));
      }
    } catch (error) {
      if (__DEV__) {
        console.warn(
          `⚠️ Image download attempt ${attempt + 1}/${IMAGE_DOWNLOAD_MAX_ATTEMPTS} failed for fact ${factId}:`,
          error
        );
      }
      if (attempt < IMAGE_DOWNLOAD_MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, IMAGE_DOWNLOAD_RETRY_DELAY_MS));
      }
    }
  }

  // All attempts failed
  if (__DEV__) {
    console.error(
      `❌ Image download failed after ${IMAGE_DOWNLOAD_MAX_ATTEMPTS} attempts for fact ${factId}`
    );
  }
  return null;
}

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
      return 'public.jpeg';
  }
}

export async function getLocalNotificationImagePath(factId: number): Promise<string | null> {
  try {
    const jpegUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.jpg`;
    const jpegInfo = await FileSystem.getInfoAsync(jpegUri);
    if (jpegInfo.exists) {
      return jpegUri;
    }

    const webpUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.webp`;
    const webpInfo = await FileSystem.getInfoAsync(webpUri);
    if (webpInfo.exists) {
      return webpUri;
    }

    const pngUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.png`;
    const pngInfo = await FileSystem.getInfoAsync(pngUri);
    if (pngInfo.exists) {
      return pngUri;
    }

    return null;
  } catch {
    return null;
  }
}

export async function deleteNotificationImage(factId: number): Promise<void> {
  try {
    const extensions = ['jpg', 'jpeg', 'webp', 'png', 'gif'];

    for (const ext of extensions) {
      const uri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.${ext}`;
      const fileInfo = await FileSystem.getInfoAsync(uri);

      if (fileInfo.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    }
  } catch {
    // Ignore deletion errors
  }
}

export async function cleanupOldNotificationImages(): Promise<number> {
  try {
    await ensureNotificationImagesDirExists();

    const dirInfo = await FileSystem.getInfoAsync(NOTIFICATION_IMAGES_DIR);
    if (!dirInfo.exists) {
      return 0;
    }

    const files = await FileSystem.readDirectoryAsync(NOTIFICATION_IMAGES_DIR);
    // Get fact IDs for scheduled (future) notifications - only these should be kept
    const scheduledFacts = await database.getFutureScheduledFactsWithNotificationIds();
    const scheduledFactIds = new Set(scheduledFacts.map((f) => f.id));
    let deletedCount = 0;

    for (const file of files) {
      // Extract fact ID from filename (format: fact-{factId}.{extension})
      const match = file.match(/^fact-(\d+)\./);
      if (!match) {
        // Delete files that don't match expected pattern
        const filePath = `${NOTIFICATION_IMAGES_DIR}${file}`;
        try {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
          deletedCount++;
        } catch {
          // Ignore individual file errors
        }
        continue;
      }

      const factId = parseInt(match[1], 10);

      // Delete image if it's NOT for a scheduled notification
      if (!scheduledFactIds.has(factId)) {
        const filePath = `${NOTIFICATION_IMAGES_DIR}${file}`;
        try {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
          deletedCount++;
        } catch {
          // Ignore individual file errors
        }
      }
    }

    return deletedCount;
  } catch {
    return 0;
  }
}

function shouldPreloadImage(scheduledDate: Date): boolean {
  const now = new Date();
  const daysUntilNotification = Math.ceil(
    (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysUntilNotification <= NOTIFICATION_SETTINGS.DAYS_TO_PRELOAD_IMAGES;
}

/**
 * Process items in parallel with concurrency limit
 */
async function processInBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
}

export async function preloadUpcomingNotificationImages(_locale: SupportedLocale): Promise<number> {
  if (Platform.OS !== 'ios') {
    return 0;
  }

  try {
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();

    if (scheduledNotifications.length === 0) {
      return 0;
    }

    const now = new Date();

    // Collect all facts that need image preloading
    const factsToPreload: Array<{ factId: number; imageUrl: string }> = [];

    for (const notification of scheduledNotifications) {
      const triggerDate = extractTriggerDate(notification.trigger);
      if (!triggerDate) continue;

      const daysUntil = Math.ceil((triggerDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil <= NOTIFICATION_SETTINGS.DAYS_TO_PRELOAD_IMAGES && daysUntil > 0) {
        const factId = notification.content.data?.factId as number | undefined;

        if (factId) {
          const jpegUri = `${NOTIFICATION_IMAGES_DIR}fact-${factId}.jpg`;
          const jpegInfo = await FileSystem.getInfoAsync(jpegUri);

          if (!jpegInfo.exists) {
            const fact = await database.getFactById(factId);

            if (fact?.image_url) {
              factsToPreload.push({ factId: fact.id, imageUrl: fact.image_url });
            }
          }
        }
      }
    }

    if (factsToPreload.length === 0) {
      return 0;
    }

    // Download images concurrently
    const results = await processInBatches(
      factsToPreload,
      async ({ factId, imageUrl }) => {
        const localUri = await downloadImageForNotification(imageUrl, factId);
        return localUri ? 1 : 0;
      },
      NOTIFICATION_SETTINGS.IMAGE_DOWNLOAD_CONCURRENCY
    );

    return results.reduce<number>((sum, count) => sum + count, 0);
  } catch {
    return 0;
  }
}

// ============================================================================
// NOTIFICATION CONTENT BUILDING
// ============================================================================

export async function buildNotificationContent(
  fact: database.FactWithRelations,
  locale: SupportedLocale = 'en',
  scheduledDate?: Date
): Promise<Notifications.NotificationContentInput> {
  const previousLocale = i18n.locale;
  i18n.locale = locale;
  const appName = i18n.t('appName');
  i18n.locale = previousLocale;

  const content: Notifications.NotificationContentInput = {
    title: appName,
    body: fact.title || fact.content.substring(0, 100),
    data: { factId: fact.id },
    badge: 1,
  };

  const shouldDownloadImage = scheduledDate ? shouldPreloadImage(scheduledDate) : true;

  if (fact.image_url && Platform.OS === 'ios' && shouldDownloadImage) {
    const localImageUri = await downloadImageForNotification(fact.image_url, fact.id);

    if (localImageUri) {
      const typeHint = getTypeHintForExtension(localImageUri);

      const attachment = {
        identifier: `fact-${fact.id}`,
        uri: localImageUri,
        url: localImageUri,
        typeHint: typeHint,
      };

      content.attachments = [attachment] as any;
    }
  }

  if (fact.image_url && Platform.OS === 'android') {
    content.data = { ...content.data, imageUrl: fact.image_url };
  }

  return content;
}

// ============================================================================
// NOTIFICATION CONFIGURATION
// ============================================================================

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function getScheduledNotificationsCount(): Promise<number> {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    return notifications.length;
  } catch {
    return 0;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract a Date from an expo-notifications trigger object.
 * Handles:
 * - `date` field (Android / some Expo versions)
 * - `dateComponents` field (iOS CalendarNotificationTrigger)
 * - `seconds` field (iOS UNTimeIntervalNotificationTrigger) — remaining seconds from now
 */
function extractTriggerDate(trigger: Notifications.NotificationTrigger | null): Date | null {
  if (!trigger) return null;

  // Direct date field (Android or some expo versions)
  if ('date' in trigger && trigger.date) {
    return trigger.date instanceof Date
      ? trigger.date
      : new Date(trigger.date as number | string);
  }

  // iOS CalendarNotificationTrigger with dateComponents
  if ('dateComponents' in trigger && trigger.dateComponents) {
    const dc = trigger.dateComponents as {
      year?: number;
      month?: number;
      day?: number;
      hour?: number;
      minute?: number;
      second?: number;
    };
    if (dc.year != null && dc.month != null && dc.day != null) {
      return new Date(
        dc.year,
        dc.month - 1, // JS months are 0-indexed
        dc.day,
        dc.hour ?? 0,
        dc.minute ?? 0,
        dc.second ?? 0
      );
    }
  }

  // iOS UNTimeIntervalNotificationTrigger — seconds remaining from now
  if ('seconds' in trigger && typeof (trigger as any).seconds === 'number') {
    return new Date(Date.now() + (trigger as any).seconds * 1000);
  }

  return null;
}

/**
 * Sort times by hour:minute in chronological order
 */
function sortTimesByTimeOfDay(times: Date[]): Date[] {
  return [...times].sort((a, b) => {
    const aMinutes = a.getHours() * 60 + a.getMinutes();
    const bMinutes = b.getHours() * 60 + b.getMinutes();
    return aMinutes - bMinutes;
  });
}

/**
 * Generate time slots for scheduling notifications
 * @param preferredTimes User's preferred notification times
 * @param count Number of slots to generate
 * @param startAfterDate Optional date to start after (for top-up)
 */
function generateTimeSlots(
  preferredTimes: Date[],
  count: number,
  startAfterDate?: Date
): TimeSlot[] {
  const sortedTimes = sortTimesByTimeOfDay(preferredTimes);
  const slots: TimeSlot[] = [];
  const now = new Date();

  let dayOffset = 0;
  let startTimeIndex = 0;

  // If we have a startAfterDate, calculate the appropriate day offset
  if (startAfterDate) {
    const startDate = new Date(startAfterDate);
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);
    const startMidnight = new Date(startDate);
    startMidnight.setHours(0, 0, 0, 0);

    dayOffset = Math.round(
      (startMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Find the next time slot after the start date's time
    const startHour = startDate.getHours();
    const startMinute = startDate.getMinutes();
    const startTotalMinutes = startHour * 60 + startMinute;

    let foundNextSlot = false;
    for (let i = 0; i < sortedTimes.length; i++) {
      const time = sortedTimes[i];
      const timeTotalMinutes = time.getHours() * 60 + time.getMinutes();
      if (timeTotalMinutes > startTotalMinutes) {
        startTimeIndex = i;
        foundNextSlot = true;
        break;
      }
    }

    // If no slot found on the same day, move to next day
    if (!foundNextSlot) {
      dayOffset++;
      startTimeIndex = 0;
    }
  } else {
    // No startAfterDate - find first valid slot (today if any time is still in future)
    let hasValidSlotToday = false;
    for (let i = 0; i < sortedTimes.length; i++) {
      const time = sortedTimes[i];
      const timeToday = new Date(now);
      timeToday.setHours(time.getHours(), time.getMinutes(), 0, 0);

      if (timeToday > now) {
        startTimeIndex = i;
        hasValidSlotToday = true;
        break;
      }
    }

    if (!hasValidSlotToday) {
      dayOffset = 1;
      startTimeIndex = 0;
    }
  }

  // Generate slots
  let timeIndex = startTimeIndex;
  let currentDayOffset = dayOffset;

  while (slots.length < count) {
    const time = sortedTimes[timeIndex];
    const slotDate = new Date(now);
    slotDate.setDate(slotDate.getDate() + currentDayOffset);
    slotDate.setHours(time.getHours(), time.getMinutes(), 0, 0);

    // Skip if slot is in the past
    if (slotDate > now) {
      slots.push({
        date: slotDate,
        hour: time.getHours(),
        minute: time.getMinutes(),
      });
    }

    timeIndex++;
    if (timeIndex >= sortedTimes.length) {
      timeIndex = 0;
      currentDayOffset++;
    }
  }

  return slots;
}

/**
 * Check if the DB schedule is valid according to user's preferred times
 */
function isScheduleValid(
  dbScheduled: Array<{ id: number; scheduled_date: string; notification_id: string }>,
  preferredTimes: Date[]
): boolean {
  if (dbScheduled.length === 0) {
    return true; // Empty schedule is valid (will be topped up)
  }

  const expectedPerDay = preferredTimes.length;
  const sortedTimes = sortTimesByTimeOfDay(preferredTimes);

  // Create a set of valid time strings (HH:MM)
  const validTimeSlots = new Set(
    sortedTimes.map(
      (t) =>
        `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`
    )
  );

  // Group scheduled facts by local date
  const byDay = new Map<string, Array<{ scheduled_date: string }>>();

  for (const fact of dbScheduled) {
    const date = new Date(fact.scheduled_date);
    const dateKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;

    if (!byDay.has(dateKey)) {
      byDay.set(dateKey, []);
    }
    byDay.get(dateKey)!.push(fact);
  }

  // Get sorted date keys
  const sortedDays = Array.from(byDay.keys()).sort();

  for (let i = 0; i < sortedDays.length; i++) {
    const dayKey = sortedDays[i];
    const facts = byDay.get(dayKey)!;
    const isFirstDay = i === 0;
    const isLastDay = i === sortedDays.length - 1;

    // Check count per day
    if (facts.length > expectedPerDay) {
      return false; // Too many notifications (even on first/last day)
    }

    // First day can have fewer (some time slots may have passed)
    // Last day can have fewer (may not fill all slots due to 64 limit)
    // Middle days must have exactly expectedPerDay
    if (facts.length < expectedPerDay && !isFirstDay && !isLastDay) {
      return false; // Too few notifications (not allowed for middle days)
    }

    // Check if time slots match preferred times
    for (const fact of facts) {
      const date = new Date(fact.scheduled_date);
      const timeKey = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

      if (!validTimeSlots.has(timeKey)) {
        return false; // Time slot doesn't match user's preferences
      }
    }
  }

  return true;
}

// ============================================================================
// CLEAR NOTIFICATION SCHEDULE
// ============================================================================

/**
 * Clear notification schedule from both DB and OS
 * @param locale User's locale for marking delivered facts
 * @param options.completely If true, clears ALL scheduling data (for permission revoke)
 */
export async function clearNotificationSchedule(
  locale: SupportedLocale,
  options: { completely: boolean } = { completely: false }
): Promise<void> {
  // Cancel all from OS
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (options.completely) {
    // Clear ALL scheduling data (used when permissions revoked)
    await database.clearAllScheduledFactsCompletely();
  } else {
    // Mark delivered facts as shown first (preserve for feed)
    await database.markDeliveredFactsAsShown(locale);
    // Clear only future scheduled facts
    await database.clearAllScheduledFacts();
  }
}

// ============================================================================
// SYNC OS WITH DB
// ============================================================================

/**
 * Sync OS notification queue to match DB records
 * - Cancels OS notifications not in DB
 * - Schedules missing DB facts in OS
 * - Re-schedules if time mismatch detected
 */
async function syncOsWithDb(
  locale: SupportedLocale
): Promise<{ synced: number; cancelled: number }> {
  const dbFacts = await database.getFutureScheduledFactsWithNotificationIds(locale);
  const osNotifications = await Notifications.getAllScheduledNotificationsAsync();

  // Build maps for efficient lookup
  const osMap = new Map<string, { identifier: string; triggerDate: Date | null }>();
  for (const notif of osNotifications) {
    const triggerDate = extractTriggerDate(notif.trigger);
    osMap.set(notif.identifier, { identifier: notif.identifier, triggerDate });
  }

  const dbNotificationIds = new Set(dbFacts.map((f) => f.notification_id).filter(Boolean));

  let cancelledCount = 0;
  let syncedCount = 0;

  // Cancel OS notifications that are not in DB
  for (const [osId] of osMap) {
    if (!dbNotificationIds.has(osId)) {
      await Notifications.cancelScheduledNotificationAsync(osId);
      cancelledCount++;
    }
  }

  // Collect facts that need scheduling
  interface FactToSchedule {
    dbFact: (typeof dbFacts)[0];
    fact: database.FactWithRelations;
    dbDate: Date;
  }

  const factsToSchedule: FactToSchedule[] = [];

  for (const dbFact of dbFacts) {
    const osNotif = dbFact.notification_id ? osMap.get(dbFact.notification_id) : null;
    const dbDate = new Date(dbFact.scheduled_date);

    // Check if we need to (re-)schedule
    let needsSchedule = false;

    if (!osNotif) {
      // Not in OS - needs scheduling
      needsSchedule = true;
    } else if (osNotif.triggerDate) {
      // Check for time mismatch
      const timeDiff = Math.abs(osNotif.triggerDate.getTime() - dbDate.getTime());
      if (timeDiff > NOTIFICATION_SETTINGS.TIME_TOLERANCE_MS) {
        // Time mismatch - cancel old and reschedule
        await Notifications.cancelScheduledNotificationAsync(dbFact.notification_id);
        needsSchedule = true;
      }
    }

    if (needsSchedule) {
      const fact = await database.getFactById(dbFact.id);
      if (fact) {
        factsToSchedule.push({ dbFact, fact, dbDate });
      }
    }
  }

  if (factsToSchedule.length === 0) {
    return { synced: 0, cancelled: cancelledCount };
  }

  // Pre-download images concurrently for iOS (only for facts within preload window)
  if (Platform.OS === 'ios') {
    const factsNeedingImages = factsToSchedule.filter(
      ({ fact, dbDate }) => fact.image_url && shouldPreloadImage(dbDate)
    );

    if (factsNeedingImages.length > 0) {
      await processInBatches(
        factsNeedingImages,
        async ({ fact }) => {
          if (fact.image_url) {
            await downloadImageForNotification(fact.image_url, fact.id);
          }
        },
        NOTIFICATION_SETTINGS.IMAGE_DOWNLOAD_CONCURRENCY
      );
    }
  }

  // Now schedule notifications (images are already downloaded)
  for (const { dbFact, fact, dbDate } of factsToSchedule) {
    try {
      // Build notification content (will use cached images)
      const content = await buildNotificationContent(fact, locale, dbDate);

      // Schedule in OS
      const newNotificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: dbDate,
        },
      });

      // Update DB with new notification_id
      await database.updateNotificationId(dbFact.id, newNotificationId);
      syncedCount++;
    } catch {
      // Skip this fact if scheduling fails
    }
  }

  return { synced: syncedCount, cancelled: cancelledCount };
}

// ============================================================================
// TOP UP FROM DB
// ============================================================================

/**
 * Top up notifications by adding more facts to empty future slots
 */
async function topUpFromDb(
  preferredTimes: Date[],
  locale: SupportedLocale,
  existingCount: number
): Promise<number> {
  const needed = NOTIFICATION_SETTINGS.MAX_SCHEDULED - existingCount;
  if (needed <= 0) return 0;

  // Get the latest scheduled date to continue from
  const latestScheduledDateStr = await database.getLatestScheduledDate(locale);
  const startAfterDate = latestScheduledDateStr ? new Date(latestScheduledDateStr) : undefined;

  // Get new facts to schedule
  const facts = await database.getRandomUnscheduledFacts(needed, locale);
  if (facts.length === 0) return 0;

  // Generate time slots for new facts
  const slots = generateTimeSlots(preferredTimes, facts.length, startAfterDate);

  let scheduledCount = 0;

  // Assign facts to slots in DB (OS sync happens after)
  for (let i = 0; i < Math.min(facts.length, slots.length); i++) {
    try {
      await database.markFactAsScheduled(
        facts[i].id,
        slots[i].date.toISOString(),
        null // notification_id will be set by syncOsWithDb
      );
      scheduledCount++;
    } catch {
      // Skip on error
    }
  }

  return scheduledCount;
}

// ============================================================================
// METHOD A: SYNC NOTIFICATION SCHEDULE
// ============================================================================

/**
 * Sync notification schedule - called on app open, foreground, notification received
 *
 * Flow:
 * 1. Mark delivered facts as shown (preserve for feed)
 * 2. Check permissions - if not granted, clear and return
 * 3. Get user's preferred times
 * 4. Get DB's future scheduled facts
 * 5. Validate schedule against preferred times - if invalid, full reschedule
 * 6. Top up if count < 64
 * 7. Sync OS to match DB
 */
export async function syncNotificationSchedule(
  locale: SupportedLocale,
  source: SyncSource = 'unknown'
): Promise<SyncResult> {
  // Concurrency guard: if a sync is already running, wait for it and skip
  if (_syncLock) {
    console.log(`🔔 [${source}] Sync already in progress, waiting...`);
    try {
      const existing = await _syncLock;
      return { ...existing, skipped: true };
    } catch {
      return { success: false, count: 0, skipped: true };
    }
  }

  const impl = _syncNotificationScheduleImpl(locale, source);
  _syncLock = impl;
  try {
    return await impl;
  } finally {
    _syncLock = null;
  }
}

async function _syncNotificationScheduleImpl(
  locale: SupportedLocale,
  source: SyncSource
): Promise<SyncResult> {
  const logEntry: SyncLogEntry = {
    timestamp: new Date().toISOString(),
    source,
    action: 'sync',
  };

  try {
    // Step 1: Always mark delivered facts as shown first
    await database.markDeliveredFactsAsShown(locale);

    // Step 2: Check permissions
    const { status } = await Notifications.getPermissionsAsync();

    if (status !== 'granted') {
      // Cancel all from OS and clear DB
      await clearNotificationSchedule(locale, { completely: true });
      logEntry.skipped = true;
      logEntry.osCountAfter = 0;
      await appendSyncLog(logEntry);
      return { success: true, count: 0, skipped: true };
    }

    // Step 3: Get user's preferred times
    const onboardingService = await import('./onboarding');
    const notificationTimeStrings = await onboardingService.getNotificationTimes();

    if (!notificationTimeStrings || notificationTimeStrings.length === 0) {
      logEntry.skipped = true;
      await appendSyncLog(logEntry);
      return { success: true, count: 0, skipped: true };
    }

    const preferredTimes = notificationTimeStrings.map((t) => new Date(t));

    // Step 4: Get DB's future scheduled facts
    const dbScheduled = await database.getFutureScheduledFactsWithNotificationIds(locale);
    logEntry.dbCount = dbScheduled.length;
    logEntry.osCountBefore = await getScheduledNotificationsCount();

    // Step 5: Check if schedule is valid according to preferred times
    const valid = isScheduleValid(dbScheduled, preferredTimes);
    logEntry.scheduleValid = valid;

    if (!valid) {
      // Schedule is invalid - full reschedule needed
      console.log(`🔔 [${source}] Schedule invalid - triggering full reschedule`);
      logEntry.action = 'reschedule';
      const result = await scheduleNotifications(preferredTimes, locale, undefined, source);
      logEntry.repaired = true;
      logEntry.osCountAfter = result.count;
      await appendSyncLog(logEntry);
      return { ...result, repaired: true };
    }

    // Step 6: Top up if needed
    let toppedUp = 0;
    if (dbScheduled.length < NOTIFICATION_SETTINGS.MAX_SCHEDULED) {
      toppedUp = await topUpFromDb(preferredTimes, locale, dbScheduled.length);
      if (__DEV__ && toppedUp > 0) {
        console.log(`🔔 [${source}] Topped up ${toppedUp} notifications`);
      }
    }
    logEntry.toppedUp = toppedUp;

    // Step 7: Sync OS to match DB
    const syncResult = await syncOsWithDb(locale);
    if (__DEV__ && (syncResult.synced > 0 || syncResult.cancelled > 0)) {
      console.log(
        `🔔 [${source}] OS sync: ${syncResult.synced} scheduled, ${syncResult.cancelled} cancelled`
      );
    }

    // Preload images for upcoming notifications
    await preloadUpcomingNotificationImages(locale);

    const finalCount = await getScheduledNotificationsCount();
    logEntry.osCountAfter = finalCount;
    await appendSyncLog(logEntry);
    return { success: true, count: finalCount };
  } catch (error) {
    console.error(`🔔 [${source}] Error syncing notification schedule:`, error);
    logEntry.error = error instanceof Error ? error.message : 'Unknown error';
    await appendSyncLog(logEntry);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// METHOD B: SCHEDULE NOTIFICATIONS
// ============================================================================

/**
 * Schedule notifications - called on onboarding or when user changes notification times
 *
 * Flow:
 * 1. Clear future schedules from both DB and OS
 * 2. Get unscheduled facts (up to 64)
 * 3. Generate time slots based on preferred times
 * 4. Assign facts to slots in DB
 * 5. Sync OS to match DB
 */
export async function scheduleNotifications(
  times: Date[],
  locale: SupportedLocale,
  options?: { skipToday?: boolean; skipOsSync?: boolean },
  source: SyncSource = 'unknown'
): Promise<ScheduleResult> {
  // Concurrency guard: if scheduling is already running, wait for it
  if (_scheduleLock) {
    console.log(`🔔 [${source}] Schedule already in progress, waiting...`);
    try {
      return await _scheduleLock;
    } catch {
      return { success: false, count: 0 };
    }
  }

  const impl = _scheduleNotificationsImpl(times, locale, options, source);
  _scheduleLock = impl;
  try {
    return await impl;
  } finally {
    _scheduleLock = null;
  }
}

async function _scheduleNotificationsImpl(
  times: Date[],
  locale: SupportedLocale,
  options?: { skipToday?: boolean; skipOsSync?: boolean },
  source: SyncSource = 'unknown'
): Promise<ScheduleResult> {
  const logEntry: SyncLogEntry = {
    timestamp: new Date().toISOString(),
    source,
    action: 'schedule',
  };

  try {
    // Check permissions first
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      logEntry.error = 'permission_not_granted';
      await appendSyncLog(logEntry);
      return {
        success: false,
        count: 0,
        error: 'Notification permission not granted',
      };
    }

    if (times.length === 0) {
      logEntry.error = 'no_times_provided';
      await appendSyncLog(logEntry);
      return {
        success: false,
        count: 0,
        error: 'No notification times provided',
      };
    }

    logEntry.osCountBefore = await getScheduledNotificationsCount();

    // Step 1: Clear future schedules from both DB and OS
    await clearNotificationSchedule(locale, { completely: false });

    // Step 2: Get unscheduled facts (up to 64)
    const facts = await database.getRandomUnscheduledFacts(
      NOTIFICATION_SETTINGS.MAX_SCHEDULED,
      locale
    );

    if (facts.length === 0) {
      logEntry.error = 'no_facts_available';
      await appendSyncLog(logEntry);
      return {
        success: false,
        count: 0,
        error: 'No facts available for scheduling',
      };
    }

    // Step 3: Generate time slots for all facts
    // When skipToday is set (e.g., after showImmediateFact during onboarding),
    // start scheduling from tomorrow to avoid duplicating today's fact
    let startAfterDate: Date | undefined;
    if (options?.skipToday) {
      startAfterDate = new Date();
      startAfterDate.setHours(23, 59, 59, 999);
    }
    const slots = generateTimeSlots(times, facts.length, startAfterDate);

    // Step 4: Assign facts to slots in DB
    for (let i = 0; i < facts.length && i < slots.length; i++) {
      try {
        await database.markFactAsScheduled(
          facts[i].id,
          slots[i].date.toISOString(),
          null // notification_id will be set by syncOsWithDb
        );
      } catch {
        // Skip on error
      }
    }

    // Step 5: Sync OS to match DB (skip for fast onboarding path)
    if (!options?.skipOsSync) {
      await syncOsWithDb(locale);
      await preloadUpcomingNotificationImages(locale);
    }

    const scheduledCount = Math.min(facts.length, slots.length);
    const finalCount = options?.skipOsSync
      ? scheduledCount
      : await getScheduledNotificationsCount();
    logEntry.osCountAfter = options?.skipOsSync ? 0 : finalCount;
    logEntry.dbCount = scheduledCount;
    await appendSyncLog(logEntry);

    console.log(`🔔 [${source}] Scheduled ${finalCount} notifications`);

    return {
      success: finalCount > 0,
      count: finalCount,
    };
  } catch (error) {
    console.error(`🔔 [${source}] Error scheduling notifications:`, error);
    logEntry.error = error instanceof Error ? error.message : 'Unknown error';
    await appendSyncLog(logEntry);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS (for backward compatibility)
// ============================================================================

/**
 * Schedule initial notifications (for onboarding with single time)
 * @deprecated Use scheduleNotifications instead
 */
export async function scheduleInitialNotifications(
  notificationTime: Date,
  locale: SupportedLocale
): Promise<ScheduleResult> {
  return scheduleNotifications([notificationTime], locale);
}

/**
 * Reschedule all notifications with a new time
 * @deprecated Use scheduleNotifications instead
 */
export async function rescheduleNotifications(
  newTime: Date,
  locale: SupportedLocale
): Promise<ScheduleResult> {
  return scheduleNotifications([newTime], locale);
}

/**
 * Reschedule all notifications with multiple times per day
 * @deprecated Use scheduleNotifications instead
 */
export async function rescheduleNotificationsMultiple(
  times: Date[],
  locale: SupportedLocale
): Promise<ScheduleResult> {
  return scheduleNotifications(times, locale);
}

/**
 * Check and top up notifications
 * @deprecated Use syncNotificationSchedule instead
 */
export async function checkAndTopUpNotifications(locale: SupportedLocale): Promise<SyncResult> {
  return syncNotificationSchedule(locale);
}

/**
 * Refresh notification schedule (single time)
 * @deprecated Use syncNotificationSchedule instead
 */
export async function refreshNotificationSchedule(
  notificationTime: Date,
  locale: SupportedLocale
): Promise<ScheduleResult> {
  return syncNotificationSchedule(locale);
}

/**
 * Refresh notification schedule (multiple times)
 * @deprecated Use syncNotificationSchedule instead
 */
export async function refreshNotificationScheduleMultiple(
  times: Date[],
  locale: SupportedLocale
): Promise<ScheduleResult> {
  return syncNotificationSchedule(locale);
}

/**
 * Clear all scheduled notifications
 * @deprecated Use clearNotificationSchedule instead
 */
export async function clearAllScheduledNotifications(
  clearPastScheduledDates: boolean = false,
  locale?: SupportedLocale
): Promise<void> {
  await clearNotificationSchedule(locale || 'en', { completely: clearPastScheduledDates });
}

// ============================================================================
// IMMEDIATE FACT (for onboarding)
// ============================================================================

/**
 * Mark one random fact as shown immediately in feed for new users
 */
// Expose pure private functions for unit testing
export const __testing = {
  generateTimeSlots,
  isScheduleValid,
  sortTimesByTimeOfDay,
  shouldPreloadImage,
  getTypeHintForExtension,
  processInBatches,
};

export async function showImmediateFact(
  locale: SupportedLocale
): Promise<{ success: boolean; fact?: database.FactWithRelations; error?: string }> {
  try {
    const facts = await database.getRandomUnscheduledFacts(1, locale);

    if (facts.length === 0) {
      return {
        success: false,
        error: 'No facts available to show',
      };
    }

    const fact = facts[0];
    await database.markFactAsShownWithDate(fact.id, new Date().toISOString());

    return {
      success: true,
      fact,
    };
  } catch (error) {
    if (__DEV__) {
      console.error('Error showing immediate fact:', error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

export interface DiagnosticsState {
  osNotifications: Array<{
    id: string;
    triggerDate: string | null;
    title: string | null;
    rawTrigger: string;
  }>;
  dbScheduled: Array<{
    id: number;
    notification_id: string;
    scheduled_date: string;
  }>;
  preferredTimes: string[];
  osCount: number;
  dbCount: number;
  mismatches: Array<{
    type: 'in_os_not_db' | 'in_db_not_os' | 'time_mismatch';
    id: string;
    details: string;
  }>;
}

export async function getNotificationDiagnostics(
  locale: SupportedLocale
): Promise<DiagnosticsState> {
  const osNotifications = await Notifications.getAllScheduledNotificationsAsync();
  const dbScheduled = await database.getFutureScheduledFactsWithNotificationIds(locale);

  const onboardingService = await import('./onboarding');
  const preferredTimes = await onboardingService.getNotificationTimes();

  // Build OS map
  const osMap = new Map<string, { id: string; triggerDate: Date | null; title: string | null }>();
  const osEntries: DiagnosticsState['osNotifications'] = [];

  for (const notif of osNotifications) {
    const triggerDate = extractTriggerDate(notif.trigger);
    osMap.set(notif.identifier, {
      id: notif.identifier,
      triggerDate,
      title: notif.content.title ?? null,
    });
    osEntries.push({
      id: notif.identifier,
      triggerDate: triggerDate?.toISOString() ?? null,
      title: notif.content.title ?? null,
      rawTrigger: JSON.stringify(notif.trigger, null, 0),
    });
  }

  // Sort OS entries by trigger date
  osEntries.sort((a, b) => {
    if (!a.triggerDate) return 1;
    if (!b.triggerDate) return -1;
    return a.triggerDate.localeCompare(b.triggerDate);
  });

  // Build DB notification_id set
  const dbNotifIds = new Set(dbScheduled.map((f) => f.notification_id).filter(Boolean));

  // Find mismatches
  const mismatches: DiagnosticsState['mismatches'] = [];

  // OS notifications not tracked in DB
  for (const [osId] of osMap) {
    if (!dbNotifIds.has(osId)) {
      mismatches.push({
        type: 'in_os_not_db',
        id: osId,
        details: `OS notification ${osId.substring(0, 8)}... has no matching DB entry`,
      });
    }
  }

  // DB entries not in OS
  for (const dbFact of dbScheduled) {
    if (dbFact.notification_id && !osMap.has(dbFact.notification_id)) {
      mismatches.push({
        type: 'in_db_not_os',
        id: dbFact.notification_id,
        details: `DB fact ${dbFact.id} (${dbFact.scheduled_date}) not found in OS`,
      });
    }

    // Time mismatch check
    if (dbFact.notification_id && osMap.has(dbFact.notification_id)) {
      const osNotif = osMap.get(dbFact.notification_id)!;
      if (osNotif.triggerDate) {
        const dbDate = new Date(dbFact.scheduled_date);
        const diff = Math.abs(osNotif.triggerDate.getTime() - dbDate.getTime());
        if (diff > NOTIFICATION_SETTINGS.TIME_TOLERANCE_MS) {
          mismatches.push({
            type: 'time_mismatch',
            id: dbFact.notification_id,
            details: `Fact ${dbFact.id}: DB=${dbFact.scheduled_date}, OS=${osNotif.triggerDate.toISOString()} (diff=${Math.round(diff / 1000)}s)`,
          });
        }
      }
    }
  }

  return {
    osNotifications: osEntries,
    dbScheduled,
    preferredTimes,
    osCount: osNotifications.length,
    dbCount: dbScheduled.length,
    mismatches,
  };
}

/**
 * Schedule a test notification for 30 seconds from now (diagnostics)
 */
export async function scheduleTestNotification(): Promise<string> {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Test Notification',
      body: 'This is a test notification from Facts a Day diagnostics.',
      data: { test: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 30 * 1000),
    },
  });
  return id;
}
