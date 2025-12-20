// Firebase Modular API imports
import {
  getCrashlytics,
  setCrashlyticsCollectionEnabled,
  setUserId as setCrashlyticsUserId,
  setAttribute,
  setAttributes,
  recordError as crashlyticsRecordError,
  log,
  crash,
} from "@react-native-firebase/crashlytics";
import {
  getAnalytics,
  logEvent as analyticsLogEvent,
  setUserId as setAnalyticsUserId,
  setUserProperty as analyticsSetUserProperty,
} from "@react-native-firebase/analytics";
import { getStoredDeviceKey } from "../services/api";

// Get Firebase instances using modular API
const crashlyticsInstance = getCrashlytics();
const analyticsInstance = getAnalytics();

// Track if JS error handler is already installed
let jsErrorHandlerInstalled = false;

/**
 * Initialize Firebase Crashlytics and Analytics
 *
 * Firebase is configured via app.json plugins:
 * - @react-native-firebase/app (with google-services.json and GoogleService-Info.plist)
 * - @react-native-firebase/crashlytics
 * - @react-native-firebase/analytics
 */
export async function initializeFirebase() {
  try {
    // Enable crashlytics collection (disabled in dev mode)
    await setCrashlyticsCollectionEnabled(crashlyticsInstance, !__DEV__);

    // Set user ID for crash reports if available
    const deviceKey = await getStoredDeviceKey();
    if (deviceKey) {
      await setCrashlyticsUserId(crashlyticsInstance, deviceKey);
      await setAnalyticsUserId(analyticsInstance, deviceKey);
    }

    // Install global JS error handler
    installJSErrorHandler();

    if (__DEV__) {
      console.log(
        "Firebase initialized in development mode (crash reporting disabled)"
      );
    }
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
  }
}

/**
 * Install a global JavaScript error handler to capture unhandled errors
 * This catches errors that escape React error boundaries
 */
function installJSErrorHandler() {
  if (jsErrorHandlerInstalled) return;
  jsErrorHandlerInstalled = true;

  // Get the existing error handler
  const previousHandler = ErrorUtils.getGlobalHandler();

  // Install our custom handler
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    // Log to Crashlytics
    try {
      log(crashlyticsInstance, `[JS ${isFatal ? 'FATAL' : 'ERROR'}] ${error.message}`);
      crashlyticsRecordError(crashlyticsInstance, error);
    } catch (e) {
      // Silently fail if Crashlytics fails
    }

    // Call the previous handler (React Native's default)
    if (previousHandler) {
      previousHandler(error, isFatal);
    }
  });

  if (__DEV__) {
    console.log("📱 JS error handler installed for Crashlytics");
  }
}

/**
 * Forward console logs to Crashlytics
 * Call this to capture console.log/warn/error as Crashlytics breadcrumbs
 * Note: Only call this in production, not in development
 */
export function enableCrashlyticsConsoleLogging() {
  if (__DEV__) {
    console.log("Console logging to Crashlytics disabled in dev mode");
    return;
  }

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    originalLog.apply(console, args);
    try {
      log(crashlyticsInstance, `[LOG] ${args.map(String).join(' ')}`);
    } catch (e) {
      // Silently fail
    }
  };

  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args);
    try {
      log(crashlyticsInstance, `[WARN] ${args.map(String).join(' ')}`);
    } catch (e) {
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
    } catch (e) {
      // Silently fail
    }
  };
}

/**
 * Set user context for Crashlytics and Analytics
 * Call this after user logs in or device is registered
 */
export async function setFirebaseUser(deviceKey: string) {
  try {
    const shortKey = deviceKey.substring(0, 8);
    await setCrashlyticsUserId(crashlyticsInstance, shortKey);
    await setAnalyticsUserId(analyticsInstance, shortKey);

    if (deviceKey) {
      await setAttribute(crashlyticsInstance, "device_key", deviceKey);
    }
  } catch (error) {
    console.error("Failed to set Firebase user:", error);
  }
}

/**
 * Clear user context (e.g., on logout)
 */
export async function clearFirebaseUser() {
  try {
    await setCrashlyticsUserId(crashlyticsInstance, "");
    await setAnalyticsUserId(analyticsInstance, null);
  } catch (error) {
    console.error("Failed to clear Firebase user:", error);
  }
}

/**
 * Add custom attributes to crash reports (Crashlytics)
 */
export async function setCrashlyticsAttribute(key: string, value: string) {
  try {
    await setAttribute(crashlyticsInstance, key, value);
  } catch (error) {
    console.error("Failed to set Crashlytics attribute:", error);
  }
}

/**
 * Set user property for Analytics
 * User properties are attached to all subsequent events
 */
export async function setAnalyticsUserProperty(name: string, value: string | null) {
  try {
    await analyticsSetUserProperty(analyticsInstance, name, value);
  } catch (error) {
    console.error("Failed to set Analytics user property:", error);
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
    console.error("Crashlytics error:", error, context);
    return;
  }

  try {
    if (context) {
      // Set context as custom attributes before recording
      setAttributes(crashlyticsInstance, context);
    }
    crashlyticsRecordError(crashlyticsInstance, error);
  } catch (e) {
    console.error("Failed to record error to Crashlytics:", e);
  }
}

/**
 * Log a message to Crashlytics (appears in crash reports)
 */
export function logMessage(message: string) {
  if (__DEV__) {
    console.log("Crashlytics log:", message);
    return;
  }

  try {
    log(crashlyticsInstance, message);
  } catch (error) {
    console.error("Failed to log message to Crashlytics:", error);
  }
}

/**
 * Log an analytics event
 */
export async function logEvent(
  name: string,
  params?: Record<string, string | number | boolean>
) {
  if (__DEV__) {
    console.log(`📊 Analytics Event: ${name}`, params);
  }
  try {
    await analyticsLogEvent(analyticsInstance, name, params);
  } catch (error) {
    console.error("Failed to log analytics event:", error);
  }
}

/**
 * Log screen view for analytics
 * Uses custom 'app_screen_view' event to avoid confusion with Firebase's automatic screen_view
 */
export async function logScreenView(screenName: string, screenClass?: string) {
  if (__DEV__) {
    console.log(`📊 Analytics Screen: ${screenName}`);
  }
  try {
    await analyticsLogEvent(analyticsInstance, 'app_screen_view', {
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  } catch (error) {
    console.error("Failed to log screen view:", error);
  }
}

/**
 * Test Crashlytics by logging an error and then forcing a crash
 * This works in both dev and release modes for testing purposes
 */
export function testCrashlytics() {
  // Log a message that will appear in the crash report
  log(crashlyticsInstance, "Test crash initiated from settings");
  
  // Record a non-fatal error first
  crashlyticsRecordError(crashlyticsInstance, new Error("Test error before crash"));
  
  // Force crash the app (this will terminate the app)
  crash(crashlyticsInstance);
}

// Export instances for direct access if needed
export { crashlyticsInstance as crashlytics, analyticsInstance as analytics };
