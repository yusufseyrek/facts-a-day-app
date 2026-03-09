/**
 * Background Sync Service
 *
 * Registers a background fetch task that periodically syncs facts from the API
 * and pre-caches images for offline access. This runs even when the app is closed.
 *
 * IMPORTANT: TaskManager.defineTask() must be called at the module top level
 * and this module must be imported early (before component rendering).
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import { PRECACHE } from '../config/images';

import { refreshAppContent } from './contentRefresh';
import { preCacheOfflineImages } from './images';

const BACKGROUND_SYNC_TASK = 'FACTS_BACKGROUND_SYNC';

// Define the task at module level (required by expo-task-manager)
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    console.log('🔄 Background sync started');

    // 1. Sync facts from API (all users)
    const result = await refreshAppContent();

    // 2. Pre-cache images (capped for background time limit)
    await preCacheOfflineImages(PRECACHE.BACKGROUND_BATCH_SIZE);
    console.log('✅ Background sync completed');

    return result.success
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (error) {
    console.error('❌ Background sync failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background sync task.
 * Should be called during app initialization.
 */
export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();

    if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      console.log('⚠️ Background fetch is denied by the system');
      return;
    }

    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted) {
      console.log('⚠️ Background fetch is restricted');
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      console.log('ℹ️ Background sync task already registered');
      return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 60 * 60, // 1 hour minimum (OS decides actual timing)
      stopOnTerminate: false, // Android: continue after app killed
      startOnBoot: true, // Android: start after reboot
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
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      console.log('✅ Background sync task unregistered');
    }
  } catch (error) {
    console.error('❌ Failed to unregister background sync:', error);
  }
}
