/**
 * App Check configuration for iOS/macOS
 * 
 * This file is only bundled in iOS builds (including Mac Catalyst).
 * Android builds use appCheckConfig.android.ts instead.
 */

/**
 * Pre-registered debug token for macOS production builds.
 * 
 * App Attest is NOT supported on macOS, so we use a debug token instead.
 * This token must be registered in Firebase Console:
 * Firebase Console → App Check → Apps → iOS app → Manage debug tokens
 * 
 * IMPORTANT: Replace with your own registered token!
 * Run `uuidgen` in terminal to generate a new UUID.
 */
export const MACOS_DEBUG_TOKEN = '83F8C1E7-A6CB-4211-B604-E80C97490BB7'; 

