/**
 * App Check Token Cache
 *
 * Centralized token caching to prevent rate limiting from Firebase.
 * App Check tokens are JWTs with an expiration time. We decode the token
 * to get the actual expiration time and refresh before it expires.
 */

import { getApp } from '@react-native-firebase/app';
import getAppCheck, { getToken } from '@react-native-firebase/app-check';

import { getAppCheckReady, isAppCheckInitialized } from '../config/appCheckState';

// Token cache
let cachedToken: string | null = null;
let tokenExpirationMs: number = 0; // Actual token expiration time in milliseconds

// Refresh the token 5 minutes before it expires to avoid edge cases
const EXPIRATION_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

// Prevent concurrent token fetches
let tokenFetchPromise: Promise<string | null> | null = null;

// Rate-limit cooldown: don't retry token fetch until this time
let rateLimitedUntilMs: number = 0;
const RATE_LIMIT_COOLDOWN_MS = 30 * 1000; // 30 seconds

/**
 * Decode JWT payload to extract expiration time
 * App Check tokens are JWTs with an 'exp' claim (seconds since epoch)
 */
function getTokenExpirationMs(token: string): number | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('⚠️ App Check: Token is not a valid JWT format');
      return null;
    }

    // Decode the payload (base64url encoded)
    const payload = parts[1];
    // Handle base64url (replace - with +, _ with /)
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if necessary
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    // Decode and parse
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);

    if (typeof parsed.exp !== 'number') {
      console.warn('⚠️ App Check: Token does not contain exp claim');
      return null;
    }

    // exp is in seconds, convert to milliseconds
    return parsed.exp * 1000;
  } catch (error) {
    if (__DEV__) {
      console.warn('⚠️ App Check: Failed to decode token expiration:', error);
    }
    return null;
  }
}

/**
 * Check if the cached token is still valid (not expired + buffer)
 */
function isCachedTokenValid(): boolean {
  if (!cachedToken || !tokenExpirationMs) {
    return false;
  }

  const now = Date.now();
  // Token is valid if current time is before (expiration - buffer)
  return now < tokenExpirationMs - EXPIRATION_BUFFER_MS;
}

/**
 * Get a cached App Check token, fetching a new one only if necessary
 *
 * This function:
 * 1. Returns the cached token if still valid (not expired)
 * 2. Fetches a new token if cache is expired or will expire soon
 * 3. Prevents concurrent token fetches (deduplication)
 *
 * @returns App Check token or null if unavailable
 */
export async function getCachedAppCheckToken(): Promise<string | null> {
  // Return cached token if still valid
  if (isCachedTokenValid()) {
    return cachedToken;
  }

  // If we're in a rate-limit cooldown, return cached token or null without retrying
  if (Date.now() < rateLimitedUntilMs) {
    if (cachedToken && tokenExpirationMs && Date.now() < tokenExpirationMs) {
      return cachedToken;
    }
    return null;
  }

  // If a fetch is already in progress, wait for it
  if (tokenFetchPromise) {
    return tokenFetchPromise;
  }

  // Fetch a new token
  tokenFetchPromise = fetchNewToken();

  try {
    const token = await tokenFetchPromise;
    return token;
  } finally {
    tokenFetchPromise = null;
  }
}

/**
 * Internal function to fetch a new App Check token
 */
async function fetchNewToken(): Promise<string | null> {
  try {
    // Wait for App Check initialization to complete first
    await getAppCheckReady();

    // Check if initialization was successful
    if (!isAppCheckInitialized()) {
      console.warn('⚠️ App Check: Initialization failed or not complete, skipping token retrieval');
      return null;
    }

    const appCheckInstance = getAppCheck(getApp());

    // Use false to allow SDK-level caching first, fall back to force refresh if needed
    // The SDK will return a cached token if available and valid
    const { token } = await getToken(appCheckInstance, false);

    // Validate that token is a non-empty string
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      console.warn('⚠️ App Check: getToken returned invalid/empty token');
      // Return cached token if available and not actually expired
      if (cachedToken && tokenExpirationMs && Date.now() < tokenExpirationMs) {
        console.log('🔒 App Check: Using cached token as fallback');
        return cachedToken;
      }
      return null;
    }

    // Extract expiration time from JWT token
    const expiration = getTokenExpirationMs(token);
    if (!expiration) {
      // If we can't decode the token, use a conservative fallback (25 minutes from now)
      console.warn('⚠️ App Check: Could not decode token expiration, using fallback');
      tokenExpirationMs = Date.now() + 25 * 60 * 1000;
    } else {
      tokenExpirationMs = expiration;
    }

    // Log token expiration info
    const expiresIn = Math.round((tokenExpirationMs - Date.now()) / 1000 / 60);
    const expirationDate = new Date(tokenExpirationMs).toISOString();
    console.log(`🔒 App Check: Token obtained, expires in ${expiresIn} min (${expirationDate})`);

    // Cache the token
    cachedToken = token;

    return token;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code || 'unknown';

    // Detect rate-limiting or attestation failure and set cooldown to avoid spamming
    const isRateLimited = errorMessage.includes('Too many attempts');
    const isAttestationFailure = errorMessage.includes('App attestation failed');

    if (isRateLimited || isAttestationFailure) {
      rateLimitedUntilMs = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      if (__DEV__) {
        console.warn(`⚠️ App Check: ${isRateLimited ? 'Rate limited' : 'Attestation failed'}, cooling down for ${RATE_LIMIT_COOLDOWN_MS / 1000}s`);
      }
    } else if (__DEV__) {
      console.warn(`⚠️ App Check: Token retrieval failed (${errorCode}): ${errorMessage}`);
    }

    // If we have a previously cached token that's not actually expired, return it as fallback
    // This handles temporary network issues gracefully
    if (cachedToken && tokenExpirationMs && Date.now() < tokenExpirationMs) {
      return cachedToken;
    }

    return null;
  }
}

/**
 * Prime the token cache with an externally-obtained token.
 * Called during App Check initialization to eagerly cache the first token,
 * so it's available before the first API request fires.
 */
export function primeTokenCache(token: string): void {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return;
  }

  const expiration = getTokenExpirationMs(token);
  if (!expiration) {
    // Use conservative fallback (25 minutes from now)
    tokenExpirationMs = Date.now() + 25 * 60 * 1000;
  } else {
    tokenExpirationMs = expiration;
  }

  cachedToken = token;

  if (__DEV__) {
    const expiresIn = Math.round((tokenExpirationMs - Date.now()) / 1000 / 60);
    console.log(`🔒 App Check: Token cache primed, expires in ${expiresIn} min`);
  }
}

/**
 * Force refresh the cached token
 * Use this when you know the token is invalid (e.g., after a 401 response)
 */
export async function forceRefreshAppCheckToken(): Promise<string | null> {
  // If we're in a rate-limit cooldown, don't force refresh
  if (Date.now() < rateLimitedUntilMs) {
    return cachedToken;
  }

  // Clear the cache
  cachedToken = null;
  tokenExpirationMs = 0;

  // Wait for any in-flight request
  if (tokenFetchPromise) {
    await tokenFetchPromise;
  }

  try {
    await getAppCheckReady();

    if (!isAppCheckInitialized()) {
      return null;
    }

    const appCheckInstance = getAppCheck(getApp());
    // Force refresh with true
    const { token } = await getToken(appCheckInstance, true);

    // Validate that token is a non-empty string
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      console.warn('⚠️ App Check: Force refresh returned invalid/empty token');
      return null;
    }

    // Extract expiration time from JWT token
    const expiration = getTokenExpirationMs(token);
    if (!expiration) {
      // If we can't decode the token, use a conservative fallback (25 minutes from now)
      tokenExpirationMs = Date.now() + 25 * 60 * 1000;
    } else {
      tokenExpirationMs = expiration;
    }

    // Log token expiration info
    const expiresIn = Math.round((tokenExpirationMs - Date.now()) / 1000 / 60);
    const expirationDate = new Date(tokenExpirationMs).toISOString();
    console.log(`🔒 App Check: Token refreshed, expires in ${expiresIn} min (${expirationDate})`);

    cachedToken = token;

    return token;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Too many attempts') || errorMessage.includes('App attestation failed')) {
      rateLimitedUntilMs = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    }

    if (__DEV__) {
      console.warn(`⚠️ App Check: Force refresh failed: ${errorMessage}`);
    }
    return null;
  }
}
