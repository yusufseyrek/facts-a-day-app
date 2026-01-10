// Firebase Modular API imports
import { Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAnalytics,
  logEvent as analyticsLogEvent,
  setUserId as setAnalyticsUserId,
  setUserProperty as analyticsSetUserProperty,
} from '@react-native-firebase/analytics';
import { getApp } from '@react-native-firebase/app';
import getAppCheck, {
  getToken as getAppCheckTokenFn,
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';
import {
  crash,
  getCrashlytics,
  log,
  recordError as crashlyticsRecordError,
  setAttribute,
  setAttributes,
  setCrashlyticsCollectionEnabled,
  setUserId as setCrashlyticsUserId,
} from '@react-native-firebase/crashlytics';
import * as Device from 'expo-device';

// Import macOS debug token from platform-specific file
// iOS builds get the real token, Android builds get undefined
import { MACOS_DEBUG_TOKEN } from './appCheckConfig';

// Key for storing the debug token (used for simulators/emulators in development)
const APP_CHECK_DEBUG_TOKEN_KEY = 'appcheck_debug_token';

/**
 * Generate a UUID v4 for debug token
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

/**
 * Get or create a persistent debug token for App Check
 * For development/simulators only - macOS uses a pre-registered token
 */
async function getOrCreateDebugToken(): Promise<string> {
  try {
    const existingToken = await AsyncStorage.getItem(APP_CHECK_DEBUG_TOKEN_KEY);
    if (existingToken) {
      return existingToken;
    }

    const newToken = generateUUID();
    await AsyncStorage.setItem(APP_CHECK_DEBUG_TOKEN_KEY, newToken);
    return newToken;
  } catch {
    return generateUUID();
  }
}

// Get Firebase instances using modular API
const crashlyticsInstance = getCrashlytics();
const analyticsInstance = getAnalytics();

// Track if App Check is initialized
let appCheckInitialized = false;

// Promise that resolves when App Check initialization is complete (or failed)
let appCheckReadyResolve: () => void;
export const appCheckReady = new Promise<void>((resolve) => {
  appCheckReadyResolve = resolve;
});

// Track if JS error handler is already installed
let jsErrorHandlerInstalled = false;

// Maximum retry attempts for App Check initialization
const APP_CHECK_INIT_MAX_RETRIES = 2;
const APP_CHECK_INIT_RETRY_DELAY_MS = 1000;

/**
 * Check if the app is running on macOS (Mac Catalyst or Apple Silicon Mac)
 * App Attest is NOT supported on macOS, so we need to use debug provider there.
 */
function isMacOS(): boolean {
  // Device.osName returns 'macOS' on Mac Catalyst apps
  // Device.modelName contains 'Mac' on Mac devices
  const osName = Device.osName?.toLowerCase() || '';
  const modelName = Device.modelName?.toLowerCase() || '';

  return osName.includes('macos') || osName.includes('mac os') || modelName.includes('mac');
}

/**
 * Initialize Firebase App Check
 *
 * App Check helps protect your backend resources from abuse by ensuring
 * requests come from genuine app instances running on genuine devices.
 *
 * On iOS: Uses App Attest (iOS 14+)
 *         In DEBUG builds, uses Debug provider for simulator testing
 * On Android: Uses Play Integrity
 * On macOS: Uses Debug provider (App Attest is NOT supported on macOS)
 */
export async function initializeAppCheckService() {
  if (appCheckInitialized) {
    return;
  }

  // Determine platform and device type for provider selection
  const isIOS = Platform.OS === 'ios';
  const isRealDevice = Device.isDevice;
  const isMac = isMacOS();

  // Use debug provider if:
  // 1. Running in development mode (__DEV__)
  // 2. Running on emulator/simulator (Play Integrity and App Attest don't work on emulators)
  // 3. Running on macOS (App Attest is NOT supported on macOS)
  const useDebugProvider = __DEV__ || !isRealDevice || isMac;

  // Determine provider names
  const iosProvider = useDebugProvider ? 'debug' : 'appAttest';
  const androidProvider = useDebugProvider ? 'debug' : 'playIntegrity';
  const providerName = isIOS ? iosProvider : androidProvider;

  // Get debug token based on environment
  let debugToken: string | undefined;
  if (useDebugProvider) {
    if (isMac && !__DEV__) {
      // Use pre-registered token for macOS production builds
      debugToken = MACOS_DEBUG_TOKEN;
      console.log('🖥️ App Check: Running on macOS - using pre-registered debug token');
    } else {
      // Use dynamically generated token for simulators/emulators in development
      debugToken = await getOrCreateDebugToken();
      console.log(`🔑 App Check Debug Token: ${debugToken}`);
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= APP_CHECK_INIT_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, APP_CHECK_INIT_RETRY_DELAY_MS));
      }

      const rnfbProvider = new ReactNativeFirebaseAppCheckProvider();

      await rnfbProvider.configure({
        apple: {
          // Use debug on simulators, appAttest on real devices
          provider: iosProvider,
          // Pass debug token for debug provider
          ...(useDebugProvider && debugToken ? { debugToken } : {}),
        },
        android: {
          // Use debug on emulators, playIntegrity on real devices
          provider: androidProvider,
          // Pass debug token for debug provider
          ...(useDebugProvider && debugToken ? { debugToken } : {}),
        },
        // Enable token auto-refresh
        isTokenAutoRefreshEnabled: true,
      });

      await initializeAppCheck(getApp(), {
        provider: rnfbProvider,
        isTokenAutoRefreshEnabled: true,
      });

      appCheckInitialized = true;

      if (__DEV__) {
        console.log(`🔒 App Check: Initialized (${providerName})`);
      }

      // Success - exit the retry loop
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Log error on each attempt
      const errorMessage = lastError.message;

      if (attempt < APP_CHECK_INIT_MAX_RETRIES) {
        console.warn(`⚠️ App Check: Initialization attempt ${attempt + 1} failed: ${errorMessage}`);
      } else {
        // Final attempt failed - log detailed error
        const errorStack = lastError.stack || '';

        console.error(
          `❌ App Check: Initialization FAILED with ${providerName} provider after ${APP_CHECK_INIT_MAX_RETRIES + 1} attempts`
        );
        console.error(`❌ App Check Error: ${errorMessage}`);
        if (errorStack && __DEV__) {
          console.error(`❌ App Check Stack: ${errorStack}`);
        }

        // Also log to Crashlytics for production debugging
        if (!__DEV__) {
          try {
            log(crashlyticsInstance, `App Check init failed (${providerName}): ${errorMessage}`);
            crashlyticsRecordError(crashlyticsInstance, lastError);
          } catch {
            // Silently fail if Crashlytics isn't ready
          }
        }
      }
    }
  }

  // Always resolve the ready promise, even on failure
  // This prevents API calls from hanging forever
  appCheckReadyResolve();
}

/**
 * Initialize Firebase Crashlytics and Analytics
 *
 * Firebase is configured via app.json plugins:
 * - @react-native-firebase/app (with google-services.json and GoogleService-Info.plist)
 * - @react-native-firebase/crashlytics
 * - @react-native-firebase/analytics
 * - @react-native-firebase/app-check
 */
export async function initializeFirebase() {
  try {
    // Initialize App Check first (before other Firebase services)
    await initializeAppCheckService();

    // Enable crashlytics collection (disabled in dev mode)
    await setCrashlyticsCollectionEnabled(crashlyticsInstance, !__DEV__);

    // Install global JS error handler
    installJSErrorHandler();

    if (__DEV__) {
      console.log('Firebase initialized in development mode (crash reporting disabled)');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

/**
 * Install a global JavaScript error handler to capture unhandled errors
 * This catches errors that escape React error boundaries
 * Only sends to Crashlytics in production
 */
function installJSErrorHandler() {
  if (jsErrorHandlerInstalled) return;
  jsErrorHandlerInstalled = true;

  // Get the existing error handler
  const previousHandler = ErrorUtils.getGlobalHandler();

  // Install our custom handler
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    // Log to Crashlytics (only in production)
    if (!__DEV__) {
      try {
        log(crashlyticsInstance, `[JS ${isFatal ? 'FATAL' : 'ERROR'}] ${error.message}`);
        crashlyticsRecordError(crashlyticsInstance, error);
      } catch {
        // Silently fail if Crashlytics fails
      }
    }

    // Call the previous handler (React Native's default)
    if (previousHandler) {
      previousHandler(error, isFatal);
    }
  });

  if (__DEV__) {
    console.log('📱 JS error handler installed for Crashlytics (disabled in dev)');
  }
}

/**
 * Forward console logs to Crashlytics
 * Call this to capture console.log/warn/error as Crashlytics breadcrumbs
 * Note: Only call this in production, not in development
 */
export function enableCrashlyticsConsoleLogging() {
  if (__DEV__) {
    console.log('Console logging to Crashlytics disabled in dev mode');
    return;
  }

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    originalLog.apply(console, args);
    try {
      log(crashlyticsInstance, `[LOG] ${args.map(String).join(' ')}`);
    } catch {
      // Silently fail
    }
  };

  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args);
    try {
      log(crashlyticsInstance, `[WARN] ${args.map(String).join(' ')}`);
    } catch {
      // Silently fail
    }
  };

  console.error = (...args: unknown[]) => {
    originalError.apply(console, args);
    try {
      log(crashlyticsInstance, `[ERROR] ${args.map(String).join(' ')}`);
      // Also record as non-fatal error if first arg is an Error
      if (args[0] instanceof Error) {
        crashlyticsRecordError(crashlyticsInstance, args[0]);
      }
    } catch {
      // Silently fail
    }
  };
}

/**
 * Clear user context (e.g., on logout)
 * Disabled in dev mode since analytics/crashlytics collection is disabled
 */
export async function clearFirebaseUser() {
  if (__DEV__) {
    return;
  }
  try {
    await setCrashlyticsUserId(crashlyticsInstance, '');
    await setAnalyticsUserId(analyticsInstance, null);
  } catch (error) {
    console.error('Failed to clear Firebase user:', error);
  }
}

/**
 * Add custom attributes to crash reports (Crashlytics)
 * Disabled in dev mode since crashlytics collection is disabled
 */
export async function setCrashlyticsAttribute(key: string, value: string) {
  if (__DEV__) {
    return;
  }
  try {
    await setAttribute(crashlyticsInstance, key, value);
  } catch (error) {
    console.error('Failed to set Crashlytics attribute:', error);
  }
}

/**
 * Set user property for Analytics
 * User properties are attached to all subsequent events
 * Disabled in dev mode to prevent polluting analytics data
 */
export async function setAnalyticsUserProperty(name: string, value: string | null) {
  if (__DEV__) {
    return;
  }
  try {
    await analyticsSetUserProperty(analyticsInstance, name, value);
  } catch (error) {
    console.error('Failed to set Analytics user property:', error);
  }
}

// Legacy alias for backwards compatibility
export const setFirebaseAttribute = setCrashlyticsAttribute;

/**
 * Record an error to Crashlytics
 * Use this for caught errors that you still want to track
 */
export function recordError(error: Error, context?: Record<string, string>) {
  if (__DEV__) {
    console.error('Crashlytics error:', error, context);
    return;
  }

  try {
    if (context) {
      // Set context as custom attributes before recording
      setAttributes(crashlyticsInstance, context);
    }
    crashlyticsRecordError(crashlyticsInstance, error);
  } catch (e) {
    console.error('Failed to record error to Crashlytics:', e);
  }
}

/**
 * Log a message to Crashlytics (appears in crash reports)
 */
export function logMessage(message: string) {
  if (__DEV__) {
    console.log('Crashlytics log:', message);
    return;
  }

  try {
    log(crashlyticsInstance, message);
  } catch (error) {
    console.error('Failed to log message to Crashlytics:', error);
  }
}

/**
 * Log an analytics event
 * Disabled in dev mode to prevent polluting analytics data
 */
export async function logEvent(name: string, params?: Record<string, string | number | boolean>) {
  if (__DEV__) {
    console.log(`📊 Analytics Event: ${name}`, params);
    return;
  }
  try {
    await analyticsLogEvent(analyticsInstance, name, params);
  } catch (error) {
    console.error('Failed to log analytics event:', error);
  }
}

/**
 * Log screen view for analytics
 * Uses custom 'app_screen_view' event to avoid confusion with Firebase's automatic screen_view
 * Disabled in dev mode to prevent polluting analytics data
 */
export async function logScreenView(screenName: string, screenClass?: string) {
  if (__DEV__) {
    console.log(`📊 Analytics Screen: ${screenName}`);
    return;
  }
  try {
    await analyticsLogEvent(analyticsInstance, 'app_screen_view', {
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  } catch (error) {
    console.error('Failed to log screen view:', error);
  }
}

/**
 * Test Crashlytics by logging an error and then forcing a crash
 * This works in both dev and release modes for testing purposes
 */
export function testCrashlytics() {
  // Log a message that will appear in the crash report
  log(crashlyticsInstance, 'Test crash initiated from settings');

  // Record a non-fatal error first
  crashlyticsRecordError(crashlyticsInstance, new Error('Test error before crash'));

  // Force crash the app (this will terminate the app)
  crash(crashlyticsInstance);
}

/**
 * Check if App Check is initialized
 */
export function isAppCheckInitialized(): boolean {
  return appCheckInitialized;
}

/**
 * Get the current App Check token (for debugging)
 * This can be used to verify App Check is working correctly
 * Uses the modular API (v22+)
 */
export async function getAppCheckToken() {
  // Wait for App Check initialization to complete
  await appCheckReady;

  if (!appCheckInitialized) {
    console.warn('App Check not initialized');
    return null;
  }

  try {
    const appCheckInstance = getAppCheck(getApp());
    const { token } = await getAppCheckTokenFn(appCheckInstance, true);
    return token;
  } catch (error) {
    console.error('Failed to get App Check token:', error);
    return null;
  }
}

// Export instances for direct access if needed
export { analyticsInstance as analytics, crashlyticsInstance as crashlytics };
