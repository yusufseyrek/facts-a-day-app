/**
 * App Check Token Cache
 * 
 * Centralized token caching to prevent rate limiting from Firebase.
 * App Check tokens are JWTs with an expiration time. We decode the token
 * to get the actual expiration time and refresh before it expires.
 */

import { getApp } from '@react-native-firebase/app';
import getAppCheck, { getToken } from '@react-native-firebase/app-check';
import { appCheckReady, isAppCheckInitialized } from '../config/firebase';

// Token cache
let cachedToken: string | null = null;
let tokenExpirationMs: number = 0; // Actual token expiration time in milliseconds

// Refresh the token 5 minutes before it expires to avoid edge cases
const EXPIRATION_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

// Prevent concurrent token fetches
let tokenFetchPromise: Promise<string | null> | null = null;

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
  return now < (tokenExpirationMs - EXPIRATION_BUFFER_MS);
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
    await appCheckReady;
    
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
    
    // Cache the token
    cachedToken = token;
    
    return token;
  } catch (error) {
    if (__DEV__) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as any)?.code || 'unknown';
      console.error(`❌ App Check: Token retrieval FAILED (${errorCode}): ${errorMessage}`);
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
 * Force refresh the cached token
 * Use this when you know the token is invalid (e.g., after a 401 response)
 */
export async function forceRefreshAppCheckToken(): Promise<string | null> {
  // Clear the cache
  cachedToken = null;
  tokenExpirationMs = 0;
  
  // Wait for any in-flight request
  if (tokenFetchPromise) {
    await tokenFetchPromise;
  }
  
  try {
    await appCheckReady;
    
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
    
    cachedToken = token;
    
    return token;
  } catch (error) {
    if (__DEV__) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ App Check: Force refresh failed: ${errorMessage}`);
    }
    return null;
  }
}

/**
 * Clear the token cache (useful for testing or logout)
 */
export function clearAppCheckTokenCache(): void {
  cachedToken = null;
  tokenExpirationMs = 0;
  tokenFetchPromise = null;
}

/**
 * Get cache status for debugging
 */
export function getAppCheckCacheStatus(): {
  hasCachedToken: boolean;
  expiresAt: number | null;
  expiresInMs: number | null;
  isValid: boolean;
} {
  const now = Date.now();
  const expiresInMs = tokenExpirationMs ? tokenExpirationMs - now : null;
  
  return {
    hasCachedToken: !!cachedToken,
    expiresAt: tokenExpirationMs || null,
    expiresInMs,
    isValid: isCachedTokenValid(),
  };
}

