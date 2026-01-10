/**
 * App Check configuration for Android
 *
 * This file is only bundled in Android builds.
 * iOS builds use appCheckConfig.ios.ts instead.
 *
 * Android uses Play Integrity for App Check, so no debug token is needed here.
 */

/**
 * macOS debug token - not used on Android, so we export undefined.
 * This ensures the token is never included in Android builds.
 */
export const MACOS_DEBUG_TOKEN: string | undefined = undefined;
