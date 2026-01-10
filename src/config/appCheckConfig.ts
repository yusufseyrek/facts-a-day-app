/**
 * App Check configuration - Base/fallback file
 *
 * This file provides TypeScript types and a fallback for platforms
 * that don't have a specific implementation.
 *
 * Platform-specific implementations:
 * - appCheckConfig.ios.ts - Used for iOS/macOS (contains the real token)
 * - appCheckConfig.android.ts - Used for Android (no token needed)
 *
 * Metro bundler automatically picks the right file based on platform.
 */

/**
 * Pre-registered debug token for macOS production builds.
 * Only defined in iOS builds - Android builds get undefined.
 */
export const MACOS_DEBUG_TOKEN: string | undefined = undefined;
