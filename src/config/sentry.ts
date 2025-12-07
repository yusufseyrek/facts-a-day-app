import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

/**
 * Initialize Sentry crash reporting
 *
 * To use Sentry:
 * 1. Create a Sentry account at https://sentry.io
 * 2. Create a new React Native project
 * 3. Get your DSN from the project settings
 * 4. Add SENTRY_DSN to app.json extra config
 *
 * Example:
 * "extra": {
 *   "SENTRY_DSN": "https://your-key@sentry.io/your-project-id"
 * }
 */
export function initializeSentry() {
  const sentryDsn = Constants.expoConfig?.extra?.SENTRY_DSN;

  // Only initialize if DSN is provided
  if (!sentryDsn) {
    if (__DEV__) {
      console.warn("Sentry DSN not found. Crash reporting is disabled.");
      console.warn(
        "Add SENTRY_DSN to app.json extra config to enable crash reporting."
      );
    }
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    // Enable in production, disable in development
    enabled: !__DEV__,
    // Environment based on DEV flag
    environment: __DEV__ ? "development" : "production",
    // Capture 100% of transactions in production for performance monitoring
    tracesSampleRate: 1.0,
    // Enable automatic session tracking
    enableAutoSessionTracking: true,
    // Automatically track performance and errors
    enableAutoPerformanceTracing: true,
    
    // Configure Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.mobileReplayIntegration(),
      Sentry.feedbackIntegration(),
    ],

    // Before sending events, you can modify them here
    beforeSend(event) {
      // Don't send events in development
      if (__DEV__) {
        return null;
      }
      return event;
    },
  });

  if (__DEV__) {
    console.log(
      "Sentry initialized in development mode (events will not be sent)"
    );
  }
}

/**
 * Set user context for Sentry
 * Call this after user logs in or device is registered
 */
export function setSentryUser(userId: string, deviceKey?: string) {
  Sentry.setUser({
    id: userId,
    // Add any additional user context
    ...(deviceKey && { deviceKey: deviceKey.substring(0, 8) }), // Only first 8 chars for privacy
  });
}

/**
 * Clear user context (e.g., on logout)
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Add custom context to error reports
 */
export function setSentryContext(key: string, value: any) {
  Sentry.setContext(key, value);
}

/**
 * Manually capture an exception
 * Use this for caught errors that you still want to track
 */
export function captureException(error: Error, context?: Record<string, any>) {
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setContext(key, value);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture a message (for non-error logging)
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = "info"
) {
  Sentry.captureMessage(message, level);
}

// Export Sentry for direct access if needed
export { Sentry };
