import { Platform } from 'react-native';

import * as Device from 'expo-device';

/**
 * True when the app is running on macOS — either Mac Catalyst or a "Designed for
 * iPad" build running on Apple Silicon. expo-device reports the host machine as
 * DESKTOP in both cases; Platform.isMac (Catalyst) and the osName/modelName
 * fallbacks cover the edges.
 *
 * Two call sites rely on this:
 *  - App Check (src/config/firebase.ts) falls back to the debug provider, since
 *    App Attest is unsupported on macOS.
 *  - Native form sheets (e.g. app/remove-ads.tsx) must host their content in a
 *    ScrollView here: on a Mac the modal is a fixed-size centered card whose
 *    height the OS will not size to content (the `fitToContents` detent only
 *    applies to the compact-width bottom-sheet presentation), and unlike a real
 *    iPad the window is freely resizable below the tablet width breakpoint.
 */
export function isMacOS(): boolean {
  // Works for both Mac Catalyst and "Designed for iPad" running on Mac.
  if (Device.deviceType === Device.DeviceType.DESKTOP) return true;

  // React Native's Platform.isMac (Mac Catalyst).
  if ((Platform as any).isMac === true) return true;

  // expo-device osName/modelName fallback.
  const osName = Device.osName?.toLowerCase() || '';
  const modelName = Device.modelName?.toLowerCase() || '';
  return osName.includes('macos') || osName.includes('mac os') || modelName.includes('mac');
}
