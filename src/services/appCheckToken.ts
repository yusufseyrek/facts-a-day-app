/**
 * App Check Token Cache
 * 
 * Centralized token caching to prevent rate limiting from Firebase.
 * App Check tokens are valid for ~1 hour, so we cache them and only
 * refresh when they're about to expire.
 */

import { getApp } from '@react-native-firebase/app';
import getAppCheck, { getToken } from '@react-native-firebase/app-check';
import { appCheckReady, isAppCheckInitialized } from '../config/firebase';

// Token cache
let cachedToken: string | null = null;
let tokenFetchTime: number = 0;

// Token is valid for ~1 hour (3600 seconds), but we refresh 5 minutes early
// to avoid using an about-to-expire token
const TOKEN_VALIDITY_MS = 25 * 60 * 1000; // 25 minutes

// Prevent concurrent token fetches
let tokenFetchPromise: Promise<string | null> | null = null;

/**
 * Check if the cached token is still valid
 */
function isCachedTokenValid(): boolean {
  if (!cachedToken || !tokenFetchTime) {
    return false;
  }
  
  const elapsed = Date.now() - tokenFetchTime;
  return elapsed < TOKEN_VALIDITY_MS;
}

/**
 * Get a cached App Check token, fetching a new one only if necessary
 * 
 * This function:
 * 1. Returns the cached token if still valid
 * 2. Fetches a new token if cache is expired or empty
 * 3. Prevents concurrent token fetches (deduplication)
 * 
 * @returns App Check token or null if unavailable
 */
export async function getCachedAppCheckToken(): Promise<string | null> {
  // Return cached token if still valid
  if (isCachedTokenValid()) {
    if (__DEV__) {
      const remainingMinutes = Math.round((TOKEN_VALIDITY_MS - (Date.now() - tokenFetchTime)) / 60000);
      console.log(`🔒 App Check: Using cached token (valid for ~${remainingMinutes} more minutes)`);
    }
    return cachedToken;
  }
  
  // If a fetch is already in progress, wait for it
  if (tokenFetchPromise) {
    if (__DEV__) {
      console.log('🔒 App Check: Waiting for in-flight token request...');
    }
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
    if (__DEV__) {
      console.log('🔒 App Check: Waiting for initialization...');
    }
    await appCheckReady;
    
    // Check if initialization was successful
    if (!isAppCheckInitialized()) {
      console.warn('⚠️ App Check: Initialization failed, skipping token retrieval');
      return null;
    }
    
    if (__DEV__) {
      console.log('🔒 App Check: Fetching new token...');
    }
    
    const appCheckInstance = getAppCheck(getApp());
    
    // Use false to allow SDK-level caching first, fall back to force refresh if needed
    // The SDK will return a cached token if available and valid
    const { token } = await getToken(appCheckInstance, false);
    
    // Cache the token
    cachedToken = token;
    tokenFetchTime = Date.now();
    
    if (__DEV__) {
      const tokenPreview = token ? `${token.substring(0, 20)}...` : 'null';
      console.log(`🔒 App Check: New token cached successfully (${tokenPreview})`);
    }
    
    return token;
  } catch (error) {
    // Log detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code || 'unknown';
    
    console.error(`❌ App Check: Token retrieval FAILED`);
    console.error(`❌ App Check Error Code: ${errorCode}`);
    console.error(`❌ App Check Error Message: ${errorMessage}`);
    
    // If we have a previously cached token that's not too old, return it as fallback
    // This handles temporary network issues gracefully
    if (cachedToken && tokenFetchTime) {
      const elapsed = Date.now() - tokenFetchTime;
      const maxFallbackAge = 60 * 60 * 1000; // 1 hour (full validity period)
      
      if (elapsed < maxFallbackAge) {
        console.warn(`⚠️ App Check: Using fallback cached token (${Math.round(elapsed / 60000)} min old)`);
        return cachedToken;
      }
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
  tokenFetchTime = 0;
  
  // Wait for any in-flight request
  if (tokenFetchPromise) {
    await tokenFetchPromise;
  }
  
  try {
    if (__DEV__) {
      console.log('🔒 App Check: Force refreshing token...');
    }
    
    await appCheckReady;
    
    if (!isAppCheckInitialized()) {
      return null;
    }
    
    const appCheckInstance = getAppCheck(getApp());
    // Force refresh with true
    const { token } = await getToken(appCheckInstance, true);
    
    cachedToken = token;
    tokenFetchTime = Date.now();
    
    return token;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ App Check: Force refresh failed: ${errorMessage}`);
    return null;
  }
}

/**
 * Clear the token cache (useful for testing or logout)
 */
export function clearAppCheckTokenCache(): void {
  cachedToken = null;
  tokenFetchTime = 0;
  tokenFetchPromise = null;
  
  if (__DEV__) {
    console.log('🔒 App Check: Token cache cleared');
  }
}

/**
 * Get cache status for debugging
 */
export function getAppCheckCacheStatus(): {
  hasCachedToken: boolean;
  tokenAge: number | null;
  isValid: boolean;
} {
  const tokenAge = tokenFetchTime ? Date.now() - tokenFetchTime : null;
  
  return {
    hasCachedToken: !!cachedToken,
    tokenAge,
    isValid: isCachedTokenValid(),
  };
}

