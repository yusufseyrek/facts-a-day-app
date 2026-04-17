/**
 * WidgetBridge Native Module
 *
 * Thin wrapper around the native WidgetBridge module that handles
 * writing widget data to shared storage (App Group UserDefaults on iOS,
 * SharedPreferences on Android) and triggering widget timeline reloads.
 *
 * The native module is registered by the withFactWidget config plugin.
 */

import { NativeModules, Platform } from 'react-native';

interface WidgetBridgeModule {
  setWidgetData(jsonString: string): Promise<void>;
  reloadWidgets(): Promise<void>;
}

const NativeWidgetBridge = NativeModules.WidgetBridge as WidgetBridgeModule | undefined;

/**
 * Write JSON data to platform-specific shared storage for widget consumption.
 * - iOS: Writes to App Group UserDefaults (group.dev.seyrek.factsaday)
 * - Android: Writes to SharedPreferences accessible by the widget process
 */
export async function setWidgetData(jsonString: string): Promise<void> {
  if (!NativeWidgetBridge) {
    if (__DEV__) console.log('WidgetBridge: native module not available');
    return;
  }
  try {
    await NativeWidgetBridge.setWidgetData(jsonString);
  } catch (error) {
    if (__DEV__) console.error('WidgetBridge.setWidgetData failed:', error);
  }
}

/**
 * Trigger widget timeline reload on both platforms.
 * - iOS: Calls WidgetCenter.shared.reloadAllTimelines()
 * - Android: Sends broadcast to AppWidgetProvider via AppWidgetManager
 */
export async function reloadWidgets(): Promise<void> {
  if (!NativeWidgetBridge) {
    if (__DEV__) console.log('WidgetBridge: native module not available');
    return;
  }
  try {
    await NativeWidgetBridge.reloadWidgets();
  } catch (error) {
    if (__DEV__) console.error('WidgetBridge.reloadWidgets failed:', error);
  }
}

/**
 * Check if the native widget bridge is available on the current platform.
 */
export function isWidgetBridgeAvailable(): boolean {
  return NativeWidgetBridge != null;
}
