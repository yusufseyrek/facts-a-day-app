import { Platform } from 'react-native';

import * as Application from 'expo-application';

/**
 * A stable per-device identifier that SURVIVES app uninstall/reinstall on the
 * same device, used by the server-side reinstall-recovery flow to re-bind a
 * reinstalled device to its anonymous account (see services/user.ts and
 * /api/users/recover).
 *
 * Android: SSAID (Settings.Secure.ANDROID_ID) — stable per app-signing-key
 * across uninstall, needs no permission, and (unlike Auto Backup / Block Store)
 * does NOT depend on the user having Google Backup enabled, so it covers ~all
 * Android reinstalls.
 *
 * iOS: returns null. IDFV resets when the app is removed, so it cannot match a
 * prior account; iOS recovers via its Keychain-persisted secret instead (see
 * userIdentity.ts). Returning null makes the recover/bind calls no-ops on iOS.
 */
export async function getStableDeviceId(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const id = Application.getAndroidId();
    // SSAID is a 64-bit hex string; guard against the rare empty/placeholder.
    return id && id.length >= 8 ? id : null;
  } catch {
    return null;
  }
}
