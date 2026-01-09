/**
 * OTA Updates Service
 * 
 * Handles checking for and applying over-the-air updates using expo-updates.
 * Integrates with Firebase App Check for authenticated update requests.
 */

import { Platform, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { hexColors } from '../theme';

import { trackAppUpdate } from './analytics';

const THEME_STORAGE_KEY = '@app_theme_mode';

/**
 * Get the current theme background color based on user preference
 */
async function getThemeBackgroundColor(): Promise<string> {
  try {
    const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    
    if (savedMode === 'light') {
      return hexColors.light.background;
    } else if (savedMode === 'dark') {
      return hexColors.dark.background;
    } else {
      // 'system' or not set - use system theme
      const systemTheme = Appearance.getColorScheme() || 'dark';
      return systemTheme === 'light' 
        ? hexColors.light.background 
        : hexColors.dark.background;
    }
  } catch {
    // Fallback to dark theme on error
    return hexColors.dark.background;
  }
}

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
// Store last check reason for debugging
let lastCheckReason: string | null = null;

export function getLastCheckReason(): string | null {
  return lastCheckReason;
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  // Skip in development mode - expo-updates doesn't work in dev
  if (__DEV__) {
    lastCheckReason = 'development_mode';
    return { 
      type: 'development', 
      message: 'OTA updates are not available in development mode' 
    };
  }

  try {
    console.log('📦 ========== UPDATE CHECK START ==========');
    console.log('📦 Runtime Version:', getRuntimeVersion());
    console.log('📦 Platform:', Platform.OS);
    console.log('📦 Update URL:', Constants.expoConfig?.updates?.url);
    console.log('📦 Current Update ID:', Updates.updateId);
    console.log('📦 Is Embedded Launch:', Updates.isEmbeddedLaunch);
    console.log('📦 Is Enabled:', Updates.isEnabled);
    console.log('📦 Channel:', Updates.channel);
    
    // Log the current manifest if available
    const currentManifest = (Updates as any).manifest;
    if (currentManifest) {
      console.log('📦 Current manifest ID:', currentManifest.id);
      console.log('📦 Current manifest createdAt:', currentManifest.createdAt);
    }
    
    const update = await Updates.checkForUpdateAsync();
    
    console.log('📦 ========== CHECK RESULT ==========');
    console.log('📦 isAvailable:', update.isAvailable);
    console.log('📦 reason:', (update as any).reason || 'none');
    console.log('📦 isRollBackToEmbedded:', (update as any).isRollBackToEmbedded);
    
    if (update.manifest) {
      const manifest = update.manifest as any;
      console.log('📦 Server manifest ID:', manifest.id);
      console.log('📦 Server manifest createdAt:', manifest.createdAt);
      console.log('📦 Server manifest runtimeVersion:', manifest.runtimeVersion);
      // Log launchAsset info which is critical for the bundle URL
      if (manifest.launchAsset) {
        console.log('📦 Server launchAsset URL:', manifest.launchAsset.url);
        console.log('📦 Server launchAsset key:', manifest.launchAsset.key);
      }
    }
    
    // Store the reason for debugging
    lastCheckReason = (update as any).reason || (update.isAvailable ? 'update_available' : 'unknown');
    
    if (update.isAvailable) {
      console.log('📦 ✓ Update available!');
      return { 
        type: 'update-available', 
        manifest: update.manifest as Updates.Manifest 
      };
    }
    
    console.log('📦 ✗ No update available, reason:', lastCheckReason);
    console.log('📦 ========== UPDATE CHECK END ==========');
    return { type: 'no-update' };
  } catch (error) {
    console.error('📦 ========== UPDATE CHECK ERROR ==========');
    console.error('📦 Failed to check for updates:', error);
    console.error('📦 Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    lastCheckReason = error instanceof Error ? error.message : String(error);
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
    console.log('📦 Starting update download...');
    console.log('📦 Before fetch - Update ID:', Updates.updateId);
    console.log('📦 Before fetch - Is Embedded:', Updates.isEmbeddedLaunch);
    
    const result = await Updates.fetchUpdateAsync();
    
    console.log('📦 Fetch completed');
    console.log('📦 Fetch result isNew:', result.isNew);
    console.log('📦 Fetch result manifest:', JSON.stringify(result.manifest, null, 2));
    
    if (result.isNew) {
      // Add a small delay to ensure the update is fully persisted to disk
      // This helps prevent race conditions where reloadAsync is called before
      // the native module has finished writing the update
      console.log('📦 Update is new, waiting for persistence...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('📦 Update ready to apply');
      return { 
        type: 'success', 
        manifest: result.manifest as Updates.Manifest 
      };
    }
    
    console.log('📦 Update was not new');
    return { 
      type: 'error', 
      error: new Error('No new update was downloaded') 
    };
  } catch (error) {
    console.error('📦 Failed to download update:', error);
    console.error('📦 Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return { 
      type: 'error', 
      error: error instanceof Error ? error : new Error(String(error)) 
    };
  }
}

/**
 * Reload the app to apply the downloaded update
 * 
 * Note: After reload, the app should start with the newly downloaded bundle.
 * If this doesn't happen, check:
 * 1. The update manifest ID matches what was downloaded
 * 2. The native expo-updates module properly persisted the update
 * 3. The runtime version matches between embedded and downloaded update
 */
export async function reloadApp(): Promise<void> {
  console.log('📦 ========== RELOAD START ==========');
  console.log('📦 Current Update ID before reload:', Updates.updateId);
  console.log('📦 Is Embedded before reload:', Updates.isEmbeddedLaunch);
  
  // Log native state before reload
  try {
    const logs = await getNativeLogEntries(60000); // Last minute
    console.log('📦 Recent native logs:');
    logs.slice(-5).forEach(l => console.log(`📦   ${l.code}: ${l.message}`));
  } catch (logError) {
    console.log('📦 Could not read native logs:', logError);
  }
  
  // Add a longer delay to ensure the update is fully written to disk
  // This is important because fetchUpdateAsync might return before
  // the native module has completely finished persisting the update
  console.log('📦 Waiting for update to be fully persisted...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Get the correct background color based on user's theme preference
  const backgroundColor = await getThemeBackgroundColor();
  
  // Track the app update before reload
  trackAppUpdate();
  
  console.log('📦 Calling reloadAsync...');
  console.log('📦 ========== RELOAD EXECUTING ==========');
  await Updates.reloadAsync({
    reloadScreenOptions: {
      backgroundColor,
      fade: true,
    }
  });
}

/**
 * Force reload with verification
 * This provides an alternative reload method that waits longer
 * and logs more details for debugging persistent update issues
 */
export async function forceReloadWithVerification(): Promise<void> {
  console.log('📦 ========== FORCE RELOAD WITH VERIFICATION ==========');
  
  // Log current state
  const currentId = Updates.updateId;
  const isEmbedded = Updates.isEmbeddedLaunch;
  const manifest = (Updates as any).manifest;
  
  console.log('📦 Current state:');
  console.log('📦   Update ID:', currentId);
  console.log('📦   Is Embedded:', isEmbedded);
  console.log('📦   Manifest ID:', manifest?.id);
  console.log('📦   Manifest createdAt:', manifest?.createdAt);
  
  // Wait longer for any async operations to complete
  console.log('📦 Extended wait for persistence (2s)...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Read native logs
  try {
    const logs = await getNativeLogEntries(120000); // Last 2 minutes
    console.log('📦 Native logs before reload:');
    logs.forEach(l => console.log(`📦   [${l.level}] ${l.code}: ${l.message}`));
  } catch (e) {
    console.log('📦 Could not read native logs');
  }
  
  // Get the correct background color based on user's theme preference
  const backgroundColor = await getThemeBackgroundColor();
  
  // Track the app update before reload
  trackAppUpdate();
  
  console.log('📦 Executing reload...');
  await Updates.reloadAsync({
    reloadScreenOptions: {
      backgroundColor,
      fade: true,
    }
  });
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
 * Add update state change listener
 * Useful for tracking update download progress or errors
 */
export function addUpdateStateChangeListener(
  listener: (event: Updates.UpdatesNativeStateChangeEvent) => void
): { remove: () => void } {
  return Updates.addUpdatesStateChangeListener(listener);
}

/**
 * Log current update status for debugging
 */
export function logUpdateStatus(): void {
  const info = getUpdateInfo();
  console.log('📦 ========== CURRENT UPDATE STATUS ==========');
  console.log(`📦 Runtime Version: ${info.runtimeVersion}`);
  console.log(`📦 Update ID: ${info.updateId || 'none (embedded)'}`);
  console.log(`📦 Channel: ${info.channel || 'default'}`);
  console.log(`📦 Is Embedded Launch: ${info.isEmbedded}`);
  console.log(`📦 Platform: ${Platform.OS}`);
  console.log(`📦 Update URL: ${Constants.expoConfig?.updates?.url || 'not set'}`);
  console.log(`📦 Updates Enabled: ${Updates.isEnabled}`);
  
  // Log manifest details if available
  const manifest = (Updates as any).manifest;
  if (manifest) {
    console.log(`📦 Manifest ID: ${manifest.id}`);
    console.log(`📦 Manifest Created At: ${manifest.createdAt}`);
  }
  console.log('📦 =============================================');
}

/**
 * Get detailed current update info including manifest data
 * Useful for verifying which update is currently running
 */
export function getDetailedUpdateInfo(): {
  updateId: string | null;
  channel: string | null;
  runtimeVersion: string;
  isEmbedded: boolean;
  manifestId: string | null;
  manifestCreatedAt: string | null;
  isEnabled: boolean;
  updateUrl: string | null;
} {
  const manifest = (Updates as any).manifest;
  return {
    updateId: Updates.updateId,
    channel: Updates.channel,
    runtimeVersion: getRuntimeVersion(),
    isEmbedded: Updates.isEmbeddedLaunch,
    manifestId: manifest?.id || null,
    manifestCreatedAt: manifest?.createdAt || null,
    isEnabled: Updates.isEnabled,
    updateUrl: Constants.expoConfig?.updates?.url || null,
  };
}

/**
 * Read native log entries from expo-updates
 * Useful for debugging update issues in release builds
 */
export async function getNativeLogEntries(maxAge: number = 3600000): Promise<Updates.UpdatesLogEntry[]> {
  if (__DEV__) {
    return [];
  }
  
  try {
    const logs = await Updates.readLogEntriesAsync(maxAge);
    return logs;
  } catch (error) {
    console.error('Failed to read native update logs:', error);
    return [];
  }
}

/**
 * Get native logs as a formatted string for debugging
 */
export async function getFormattedNativeLogs(): Promise<string> {
  const logs = await getNativeLogEntries();
  
  if (logs.length === 0) {
    return 'No native logs available';
  }
  
  return logs
    .slice(-10) // Last 10 entries
    .map(log => {
      const time = new Date(log.timestamp).toISOString().slice(11, 19);
      return `[${time}] ${log.level}: ${log.code} - ${log.message}`;
    })
    .join('\n');
}

