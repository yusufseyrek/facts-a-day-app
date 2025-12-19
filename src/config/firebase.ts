// Firebase Modular API imports
import {
  getCrashlytics,
  setCrashlyticsCollectionEnabled,
  setUserId as setCrashlyticsUserId,
  setAttribute,
  setAttributes,
  recordError as crashlyticsRecordError,
  log,
} from "@react-native-firebase/crashlytics";
import {
  getAnalytics,
  logEvent as analyticsLogEvent,
  logScreenView as analyticsLogScreenView,
  setUserId as setAnalyticsUserId,
} from "@react-native-firebase/analytics";
import { getStoredDeviceKey } from "../services/api";

// Get Firebase instances using modular API
const crashlyticsInstance = getCrashlytics();
const analyticsInstance = getAnalytics();

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
 * Set user context for Crashlytics and Analytics
 * Call this after user logs in or device is registered
 */
export async function setFirebaseUser(userId: string, deviceKey?: string) {
  try {
    await setCrashlyticsUserId(crashlyticsInstance, userId);
    await setAnalyticsUserId(analyticsInstance, userId);

    if (deviceKey) {
      // Only first 8 chars for privacy
      await setAttribute(crashlyticsInstance, "deviceKey", deviceKey.substring(0, 8));
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
 * Add custom attributes to crash reports
 */
export async function setFirebaseAttribute(key: string, value: string) {
  try {
    await setAttribute(crashlyticsInstance, key, value);
  } catch (error) {
    console.error("Failed to set Firebase attribute:", error);
  }
}

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
  try {
    await analyticsLogEvent(analyticsInstance, name, params);
  } catch (error) {
    console.error("Failed to log analytics event:", error);
  }
}

/**
 * Log screen view for analytics
 */
export async function logScreenView(screenName: string, screenClass?: string) {
  try {
    await analyticsLogScreenView(analyticsInstance, {
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  } catch (error) {
    console.error("Failed to log screen view:", error);
  }
}

// Export instances for direct access if needed
export { crashlyticsInstance as crashlytics, analyticsInstance as analytics };
