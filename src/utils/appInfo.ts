/**
 * App version info utilities
 * Extracted to avoid circular dependencies between services
 */

import { Platform } from 'react-native';

import Constants from 'expo-constants';

/**
 * Get OTA-aware app version info from Constants.expoConfig
 * These values update when an OTA bundle is applied (unlike native build values)
 */
export function getAppVersionInfo(): {
  platform: string;
  appVersion: string;
  buildNumber: string;
  platformBuildId: string;
} {
  const platform = Platform.OS;
  const appVersion = Constants.expoConfig?.version || 'unknown';
  const buildNumber =
    platform === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber || 'unknown'
      : String(Constants.expoConfig?.android?.versionCode || 'unknown');
  const platformBuildId = `${platform}_${appVersion}_${buildNumber}`;

  return { platform, appVersion, buildNumber, platformBuildId };
}
