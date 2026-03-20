/**
 * Background Sync Service
 *
 * Registers a background task that periodically syncs facts from the API,
 * curates the daily Popular & Worth Knowing sections (once per day),
 * and pre-caches images for offline access. Runs even when the app is closed.
 *
 * IMPORTANT: TaskManager.defineTask() must be called at the module top level
 * and this module must be imported early (before component rendering).
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { PRECACHE } from '../config/images';

import { refreshAppContent, getStoredLocale } from './contentRefresh';
import { loadDailyFeedSections } from './dailyFeed';
import { preCacheOfflineImages } from './images';
import { ensureNotificationSchedule } from './notifications';
import type { SupportedLocale } from '../i18n/translations';

const BACKGROUND_SYNC_TASK = 'FACTS_BACKGROUND_SYNC';

// Define the task at module level (required by expo-task-manager)
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    console.log('🔄 Background sync started');

    // 1. Sync facts from API
    const result = await refreshAppContent();

    // 2. Curate daily feed sections if not already done today
    const locale = await getStoredLocale();
    if (locale) {
      await loadDailyFeedSections(locale);
    }

    // 3. Pre-cache images (capped for background time limit)
    await preCacheOfflineImages(PRECACHE.BACKGROUND_BATCH_SIZE);

    // 4. Ensure notification schedule is healthy (smart selection, top-up)
    if (locale) {
      await ensureNotificationSchedule(locale as SupportedLocale, 'background_task');
    }

    console.log('✅ Background sync completed');

    return result.success
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch (error) {
    console.error('❌ Background sync failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Register the background sync task.
 * Should be called during app initialization.
 */
export async function registerBackgroundSync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      console.log('ℹ️ Background sync task already registered');
      return;
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15, // 15 min minimum (OS decides actual timing)
    });

    console.log('✅ Background sync task registered');
  } catch (error) {
    console.error('❌ Failed to register background sync:', error);
  }
}

/**
 * Unregister the background sync task.
 */
export async function unregisterBackgroundSync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      console.log('✅ Background sync task unregistered');
    }
  } catch (error) {
    console.error('❌ Failed to unregister background sync:', error);
  }
}
