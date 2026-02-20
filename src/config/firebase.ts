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

import { APP_CHECK } from './app';
import { isDeviceOnline } from '../utils/network';
// Import macOS debug token from platform-specific file
// iOS builds get the real token, Android builds get undefined
import { MACOS_DEBUG_TOKEN } from './appCheckConfig';
import {
  getAppCheckReady,
  isAppCheckInitialized,
  resetAppCheckReady,
  resolveAppCheckReady,
  setAppCheckInitFailed,
  setAppCheckInitialized,
} from './appCheckState';
import { primeTokenCache } from '../services/appCheckToken';

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

// Track if JS error handler is already installed
let jsErrorHandlerInstalled = false;

// Destructure App Check constants for readability
const {
  INIT_MAX_RETRIES: APP_CHECK_INIT_MAX_RETRIES,
  INIT_RETRY_DELAY_MS: APP_CHECK_INIT_RETRY_DELAY_MS,
  FIRST_TOKEN_MAX_ATTEMPTS,
  FIRST_TOKEN_RETRY_DELAY_MS,
} = APP_CHECK;

/**
 * Check if the app is running on macOS (Mac Catalyst or "Designed for iPad" on Mac)
 * App Attest is NOT supported on macOS, so we need to use debug provider there.
 */
function isMacOS(): boolean {
  // Method 1: Check Device.deviceType === DESKTOP (3)
  // This works for both Mac Catalyst and "Designed for iPad" running on Mac
  // expo-device correctly identifies the host machine as DESKTOP
  if (Device.deviceType === Device.DeviceType.DESKTOP) {
    return true;
  }

  // Method 2: Check React Native's Platform.isMac (for Mac Catalyst)

  if ((Platform as any).isMac === true) {
    return true;
  }

  // Method 3: Check expo-device osName/modelName (fallback)
  const osName = Device.osName?.toLowerCase() || '';
  const modelName = Device.modelName?.toLowerCase() || '';

  if (osName.includes('macos') || osName.includes('mac os') || modelName.includes('mac')) {
    return true;
  }

  return false;
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
  console.log(
    `[AppCheck] initializeAppCheckService called — __DEV__=${__DEV__}, STRICT_MODE=${APP_CHECK.STRICT_MODE_ENABLED}, alreadyInit=${isAppCheckInitialized()}`
  );

  if (isAppCheckInitialized()) {
    resolveAppCheckReady();
    return;
  }

  try {
    // Determine platform and device type for provider selection
    const isIOS = Platform.OS === 'ios';
    const isRealDevice = Device.isDevice;
    const isMac = isMacOS();

    // Use debug provider if:
    // 1. Running in development mode (__DEV__) — covers simulators/emulators in dev
    // 2. Running on macOS (App Attest is NOT supported on macOS, uses pre-registered token)
    // Note: Emulators in release builds intentionally use the real provider so that
    // failure is detected and the blocking screen can be shown.
    const useDebugProvider = __DEV__ || isMac;

    console.log(
      `[AppCheck] isIOS=${isIOS}, isRealDevice=${isRealDevice}, isMac=${isMac}, useDebugProvider=${useDebugProvider}`
    );

    // Determine provider names
    const iosProvider = useDebugProvider ? 'debug' : 'appAttest';
    const androidProvider = useDebugProvider ? 'debug' : 'playIntegrity';
    const providerName = isIOS ? iosProvider : androidProvider;

    // Get debug token based on environment
    let debugToken: string | undefined;
    if (useDebugProvider) {
      if (isMac) {
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

        try {
          await initializeAppCheck(getApp(), {
            provider: rnfbProvider,
            isTokenAutoRefreshEnabled: true,
          });
        } catch (initError) {
          // Firebase SDK throws if initializeAppCheck is called twice (retry flow)
          const msg = initError instanceof Error ? initError.message : String(initError);
          if (msg.includes('already initialized') || msg.includes('already been called')) {
            // Already initialized — proceed to token fetch
          } else {
            throw initError;
          }
        }

        setAppCheckInitialized(true);
        console.log(
          `[AppCheck] Init SUCCESS — provider=${providerName}, isInitialized=${isAppCheckInitialized()}`
        );

        // Eagerly fetch and cache the first token so it's available
        // before the first API request fires (closes the timing gap
        // between initializeAppCheck() and token availability)
        try {
          const appCheckInstance = getAppCheck(getApp());
          let firstToken: string | null = null;
          let lastTokenError: string = '';

          for (let tokenAttempt = 0; tokenAttempt < FIRST_TOKEN_MAX_ATTEMPTS; tokenAttempt++) {
            try {
              if (tokenAttempt > 0) {
                await new Promise((r) => setTimeout(r, FIRST_TOKEN_RETRY_DELAY_MS));
              }
              const result = await getAppCheckTokenFn(appCheckInstance, false);
              if (result.token && result.token.trim().length > 0) {
                firstToken = result.token;
                break;
              }
            } catch (tokenError) {
              const msg = tokenError instanceof Error ? tokenError.message : String(tokenError);
              lastTokenError = msg;
              // Stop retrying if rate-limited or attestation failed (retries will only make it worse)
              if (msg.includes('Too many attempts') || msg.includes('App attestation failed')) {
                if (__DEV__) {
                  console.warn(
                    '⚠️ App Check: First token blocked by rate limit/attestation, stopping retries'
                  );
                }
                break;
              }
              if (__DEV__) {
                console.warn(
                  `⚠️ App Check: First token attempt ${tokenAttempt + 1} failed:`,
                  tokenError
                );
              }
            }
          }

          if (firstToken) {
            primeTokenCache(firstToken);
            console.log('[AppCheck] First token obtained and cached');
          } else {
            console.log('[AppCheck] Could not obtain first token');
            // Don't roll back appCheckInitialized — the SDK IS initialized.
            // Start background retry to get the token while the app proceeds.
            if (APP_CHECK.STRICT_MODE_ENABLED && !__DEV__) {
              logEvent('app_check_failed', {
                reason: 'first_token_failure',
                provider: providerName,
                error: lastTokenError,
                platform: Platform.OS,
              });

              if (lastTokenError.includes('App attestation failed')) {
                // Attestation rejected — likely non-real device.
                // One quick retry (attestation key may now be cached), then block.
                startAttestationFailedRetry(providerName, lastTokenError);
              } else if (lastTokenError.includes('Too many attempts')) {
                // Rate limited — don't retry, don't block, proceed without token
                console.log('[AppCheck] Rate limited — proceeding without token');
              } else {
                // Transient error — full background retry with exponential backoff
                startBackgroundTokenRetry(providerName);
              }
            }
          }
        } catch (prefetchError) {
          const prefetchMsg =
            prefetchError instanceof Error ? prefetchError.message : String(prefetchError);
          console.log(`[AppCheck] First token prefetch threw: ${prefetchMsg}`);
          // Don't roll back — start background retry instead
          if (APP_CHECK.STRICT_MODE_ENABLED && !__DEV__) {
            logEvent('app_check_failed', {
              reason: 'token_prefetch_error',
              provider: providerName,
              error: prefetchMsg,
              platform: Platform.OS,
            });

            if (prefetchMsg.includes('App attestation failed')) {
              startAttestationFailedRetry(providerName, prefetchMsg);
            } else if (prefetchMsg.includes('Too many attempts')) {
              console.log('[AppCheck] Rate limited — proceeding without token');
            } else {
              startBackgroundTokenRetry(providerName);
            }
          }
        }

        // Success - exit the retry loop
        console.log('[AppCheck] Init loop completed successfully, breaking');
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`[AppCheck] Init attempt FAILED: ${lastError.message}`);

        // Log error on each attempt
        const errorMessage = lastError.message;

        if (attempt < APP_CHECK_INIT_MAX_RETRIES) {
          console.warn(
            `⚠️ App Check: Initialization attempt ${attempt + 1} failed: ${errorMessage}`
          );
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

          // Also log to Crashlytics and Analytics for production debugging
          if (!__DEV__) {
            try {
              log(crashlyticsInstance, `App Check init failed (${providerName}): ${errorMessage}`);
              crashlyticsRecordError(crashlyticsInstance, lastError);
            } catch {
              // Silently fail if Crashlytics isn't ready
            }
            logEvent('app_check_failed', {
              reason: 'init_retries_exhausted',
              provider: providerName,
              error: errorMessage,
              platform: Platform.OS,
            });
          }
        }
      }
    }
  } finally {
    // Always resolve the ready promise, even on failure
    // This prevents API calls from hanging forever
    resolveAppCheckReady();

    console.log(
      `[AppCheck] FINALLY — isInitialized=${isAppCheckInitialized()}, __DEV__=${__DEV__}, STRICT_MODE=${APP_CHECK.STRICT_MODE_ENABLED}`
    );

    // If init failed in production with strict mode, set failure flag for blocking screen
    // but only when the device is online — offline failures are not a security concern
    if (!isAppCheckInitialized() && !__DEV__ && APP_CHECK.STRICT_MODE_ENABLED) {
      const online = await isDeviceOnline();
      if (online) {
        console.log('[AppCheck] Setting appCheckInitFailed = true (blocking screen will show)');
        setAppCheckInitFailed(true);
      } else {
        console.log('[AppCheck] Device is offline — skipping blocking screen');
      }
    } else {
      console.log(`[AppCheck] NOT setting failure flag — init succeeded or conditions not met`);
    }
  }
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
    // Safety: ensure appCheckReady resolves even on catastrophic failure
    // (resolving an already-resolved Promise is a no-op)
    resolveAppCheckReady();
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
 * Quick retry for attestation-failed errors.
 * "App attestation failed" is likely a non-real device (emulator/virtual).
 * We give one extra chance (the attestation key may have been cached by now),
 * then block if it still fails.
 */
function startAttestationFailedRetry(providerName: string, originalError: string) {
  (async () => {
    console.log('[AppCheck] Attestation failed — one quick retry in 3s...');
    await new Promise((r) => setTimeout(r, APP_CHECK.ATTESTATION_FAILED_RETRY_MS));

    try {
      const appCheckInstance = getAppCheck(getApp());
      const result = await getAppCheckTokenFn(appCheckInstance, false);
      if (result.token && result.token.trim().length > 0) {
        primeTokenCache(result.token);
        console.log('[AppCheck] Quick retry succeeded — token obtained');
        logEvent('app_check_bg_retry_success', {
          attempt: 1,
          error_type: 'attestation_failed',
          platform: Platform.OS,
        });
        return;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log('[AppCheck] Quick retry also failed:', msg);
    }

    // Quick retry failed — block if online
    const online = await isDeviceOnline();
    if (online) {
      logEvent('app_check_blocked', {
        reason: 'attestation_failed_persistent',
        provider: providerName,
        error: originalError,
        platform: Platform.OS,
      });
      setAppCheckInitFailed(true);
    }
  })();
}

/**
 * Full background retry for transient first-token failures.
 * Uses exponential backoff (3s, 6s, 12s, 24s, 48s ≈ 93s total).
 * The app proceeds normally while this runs in the background.
 * When the token is obtained, it's primed into the cache for subsequent API calls.
 * If all retries are exhausted and the device is online, the blocking screen is shown.
 */
function startBackgroundTokenRetry(providerName: string) {
  const delays = APP_CHECK.BG_RETRY_DELAYS_MS;

  (async () => {
    const appCheckInstance = getAppCheck(getApp());

    for (let i = 0; i < delays.length; i++) {
      await new Promise((r) => setTimeout(r, delays[i]));

      try {
        const result = await getAppCheckTokenFn(appCheckInstance, false);
        if (result.token && result.token.trim().length > 0) {
          primeTokenCache(result.token);
          console.log(`[AppCheck] Background retry ${i + 1} succeeded — token obtained`);
          logEvent('app_check_bg_retry_success', {
            attempt: i + 1,
            delay_ms: delays[i],
            platform: Platform.OS,
          });
          return;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`[AppCheck] Background retry ${i + 1} failed: ${msg}`);

        // Stop if rate-limited or attestation permanently failed
        if (msg.includes('Too many attempts') || msg.includes('App attestation failed')) {
          logEvent('app_check_bg_retry_stopped', {
            attempt: i + 1,
            error: msg,
            platform: Platform.OS,
          });
          break;
        }
      }
    }

    // All retries exhausted or stopped early — block if online
    const online = await isDeviceOnline();
    if (online) {
      logEvent('app_check_bg_retry_exhausted', {
        provider: providerName,
        platform: Platform.OS,
      });
      setAppCheckInitFailed(true);
    }
  })();
}

/**
 * Get the current App Check token (for debugging)
 * This can be used to verify App Check is working correctly
 * Uses the modular API (v22+)
 */
export async function getAppCheckToken() {
  // Wait for App Check initialization to complete
  await getAppCheckReady();

  if (!isAppCheckInitialized()) {
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

/**
 * Retry App Check initialization (called from blocking screen retry button)
 * Resets state and re-runs the full init flow.
 * @returns true if initialization succeeded
 */
export async function retryAppCheckInit(): Promise<boolean> {
  resetAppCheckReady();
  setAppCheckInitFailed(false);
  setAppCheckInitialized(false);
  await initializeAppCheckService();
  const success = isAppCheckInitialized();
  logEvent('app_check_retry', { success, platform: Platform.OS });
  return success;
}

// Re-export shared App Check state for consumers that import from this module
export { getAppCheckReady, isAppCheckInitialized } from './appCheckState';

// Export instances for direct access if needed
export { analyticsInstance as analytics, crashlyticsInstance as crashlytics };
