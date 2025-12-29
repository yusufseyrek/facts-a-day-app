/**
 * OTA Updates Service
 * 
 * Handles checking for and applying over-the-air updates using expo-updates.
 * Integrates with Firebase App Check for authenticated update requests.
 */

import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getCachedAppCheckToken } from './appCheckToken';

// Update check result types
export type UpdateCheckResult = 
  | { type: 'no-update' }
  | { type: 'update-available'; manifest: Updates.Manifest }
  | { type: 'error'; error: Error }
  | { type: 'development'; message: string };

// Update download result types
export type UpdateDownloadResult =
  | { type: 'success'; manifest: Updates.Manifest }
  | { type: 'error'; error: Error };

/**
 * Get the current runtime version from app config
 */
export function getRuntimeVersion(): string {
  const runtimeVersion = Constants.expoConfig?.runtimeVersion;
  
  // If runtimeVersion is a string, use it directly
  if (typeof runtimeVersion === 'string') {
    return runtimeVersion;
  }
  
  // If it's an object (policy config), fall back to app version
  // The actual runtime version is resolved at build time
  return Constants.expoConfig?.version || '1.0.0';
}

/**
 * Check if OTA updates are available
 * 
 * This function manually checks for updates using a custom fetch with App Check headers.
 * Returns the check result without downloading.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  // Skip in development mode - expo-updates doesn't work in dev
  if (__DEV__) {
    return { 
      type: 'development', 
      message: 'OTA updates are not available in development mode' 
    };
  }

  try {
    console.log('📦 Checking for updates...');
    console.log('📦 Runtime Version:', getRuntimeVersion());
    console.log('📦 Platform:', Platform.OS);
    console.log('📦 Update URL:', Constants.expoConfig?.updates?.url);
    
    const update = await Updates.checkForUpdateAsync();
    
    console.log('📦 Check result:', JSON.stringify(update, null, 2));
    
    if (update.isAvailable) {
      console.log('📦 Update available!');
      return { 
        type: 'update-available', 
        manifest: update.manifest as Updates.Manifest 
      };
    }
    
    console.log('📦 No update available');
    return { type: 'no-update' };
  } catch (error) {
    console.error('📦 Failed to check for updates:', error);
    return { 
      type: 'error', 
      error: error instanceof Error ? error : new Error(String(error)) 
    };
  }
}

/**
 * Download and apply an available update
 * 
 * This will download the update bundle and assets, then apply them.
 * The app needs to be restarted for changes to take effect.
 */
export async function downloadAndApplyUpdate(): Promise<UpdateDownloadResult> {
  try {
    const result = await Updates.fetchUpdateAsync();
    
    if (result.isNew) {
      return { 
        type: 'success', 
        manifest: result.manifest as Updates.Manifest 
      };
    }
    
    return { 
      type: 'error', 
      error: new Error('No new update was downloaded') 
    };
  } catch (error) {
    console.error('Failed to download update:', error);
    return { 
      type: 'error', 
      error: error instanceof Error ? error : new Error(String(error)) 
    };
  }
}

/**
 * Reload the app to apply the downloaded update
 */
export async function reloadApp(): Promise<void> {
  await Updates.reloadAsync();
}

/**
 * Check for updates and download if available
 * Returns true if an update was downloaded and is ready to apply
 */
export async function checkAndDownloadUpdate(): Promise<{
  updateAvailable: boolean;
  downloaded: boolean;
  error?: Error;
}> {
  const checkResult = await checkForUpdates();
  
  if (checkResult.type === 'development') {
    return { updateAvailable: false, downloaded: false };
  }
  
  if (checkResult.type === 'error') {
    return { updateAvailable: false, downloaded: false, error: checkResult.error };
  }
  
  if (checkResult.type === 'no-update') {
    return { updateAvailable: false, downloaded: false };
  }
  
  // Update is available, download it
  const downloadResult = await downloadAndApplyUpdate();
  
  if (downloadResult.type === 'error') {
    return { updateAvailable: true, downloaded: false, error: downloadResult.error };
  }
  
  return { updateAvailable: true, downloaded: true };
}

/**
 * Get current update info
 */
export function getUpdateInfo(): {
  updateId: string | null;
  channel: string | null;
  runtimeVersion: string;
  isEmbedded: boolean;
} {
  return {
    updateId: Updates.updateId,
    channel: Updates.channel,
    runtimeVersion: getRuntimeVersion(),
    isEmbedded: Updates.isEmbeddedLaunch,
  };
}

/**
 * Perform a full update cycle:
 * 1. Check for updates
 * 2. Download if available
 * 3. Optionally reload the app
 * 
 * @param autoReload - If true, automatically reload the app after downloading
 * @returns Update status and whether a reload is needed
 */
export async function performUpdateCycle(autoReload: boolean = false): Promise<{
  checked: boolean;
  updateAvailable: boolean;
  downloaded: boolean;
  reloaded: boolean;
  error?: Error;
}> {
  const result = await checkAndDownloadUpdate();
  
  if (result.downloaded && autoReload) {
    try {
      await reloadApp();
      return { ...result, checked: true, reloaded: true };
    } catch (error) {
      return { 
        ...result, 
        checked: true, 
        reloaded: false, 
        error: error instanceof Error ? error : new Error(String(error)) 
      };
    }
  }
  
  return { ...result, checked: true, reloaded: false };
}

/**
 * Add update event listener
 * Useful for tracking update download progress or errors
 */
export function addUpdateEventListener(
  listener: (event: Updates.UpdateEvent) => void
): Updates.Subscription {
  return Updates.addListener(listener);
}

/**
 * Log current update status for debugging
 */
export function logUpdateStatus(): void {
  const info = getUpdateInfo();
  console.log('📦 OTA Update Status:');
  console.log(`  Runtime Version: ${info.runtimeVersion}`);
  console.log(`  Update ID: ${info.updateId || 'none (embedded)'}`);
  console.log(`  Channel: ${info.channel || 'default'}`);
  console.log(`  Is Embedded: ${info.isEmbedded}`);
  console.log(`  Platform: ${Platform.OS}`);
  console.log(`  Update URL: ${Constants.expoConfig?.updates?.url || 'not set'}`);
  console.log(`  Updates Enabled: ${Updates.isEnabled}`);
}

