/**
 * Image Service with App Check Token Support
 * 
 * This service handles downloading fact images with Firebase App Check tokens
 * to authenticate requests to protected image endpoints.
 * 
 * The service:
 * 1. Gets an App Check token before downloading
 * 2. Downloads images with the token in the X-Firebase-AppCheck header
 * 3. Caches images locally for offline access and performance (7-day TTL)
 * 4. Provides both hooks for React components and utility functions for services
 * 
 * IMPORTANT: Uses documentDirectory (persistent) instead of cacheDirectory
 * because cacheDirectory can be cleared by the OS at any time.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { getCachedAppCheckToken, forceRefreshAppCheckToken } from './appCheckToken';

// Directory for cached fact images - uses documentDirectory for persistence
// cacheDirectory is NOT reliable for multi-day caching as it can be cleared by OS
const FACT_IMAGES_DIR = `${FileSystem.documentDirectory}fact-images/`;

// Maximum cache age in milliseconds (7 days)
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Retry configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE_MS = 1000;

// In-memory cache for file existence to avoid repeated file system checks
// Key: factId, Value: { uri: string, checkedAt: number }
// This prevents multiple components from hitting the file system for the same fact
const fileExistenceCache = new Map<number, { uri: string; checkedAt: number }>();

// Maximum age for file existence cache (30 minutes - long enough for typical session)
const FILE_EXISTENCE_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

// Track pending file existence checks to prevent duplicate async operations
const pendingExistenceChecks = new Map<number, Promise<string | null>>();

// Track pending downloads to prevent duplicate network requests for the same image
// Key: factId, Value: Promise that resolves to the local URI
const pendingDownloads = new Map<number, Promise<string | null>>();

// Cache whether the images directory exists (checked once per session)
let imagesDirExists = false;
let imagesDirCheckPromise: Promise<void> | null = null;

/**
 * Ensure the fact images directory exists (cached - only checks once per session)
 */
async function ensureImagesDirExists(): Promise<void> {
  // Fast path: directory already confirmed to exist
  if (imagesDirExists) {
    return;
  }
  
  // If a check is in progress, wait for it
  if (imagesDirCheckPromise) {
    return imagesDirCheckPromise;
  }
  
  // Start a new check
  imagesDirCheckPromise = (async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(FACT_IMAGES_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(FACT_IMAGES_DIR, { intermediates: true });
      }
      imagesDirExists = true;
    } finally {
      imagesDirCheckPromise = null;
    }
  })();
  
  return imagesDirCheckPromise;
}


/**
 * Generate a cache key/filename for an image URL
 * Uses fact ID if provided, otherwise hashes the URL
 */
function getCacheFilename(imageUrl: string, factId?: number): string {
  // Extract file extension from URL or default to jpg
  const urlPath = imageUrl.split('?')[0]; // Remove query params
  const extension = urlPath.split('.').pop()?.toLowerCase() || 'jpg';
  const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const fileExtension = validExtensions.includes(extension) ? extension : 'jpg';
  
  if (factId !== undefined) {
    return `fact-${factId}.${fileExtension}`;
  }
  
  // Create a simple hash of the URL for caching
  let hash = 0;
  for (let i = 0; i < imageUrl.length; i++) {
    const char = imageUrl.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `img-${Math.abs(hash).toString(16)}.${fileExtension}`;
}

/**
 * Check if a cached image exists and is still valid (internal helper)
 */
async function getCachedImageUri(imageUrl: string, factId?: number): Promise<string | null> {
  try {
    const filename = getCacheFilename(imageUrl, factId);
    const localUri = `${FACT_IMAGES_DIR}${filename}`;
    
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    
    if (!fileInfo.exists) {
      return null;
    }
    
    // Check if cache is still valid
    if (fileInfo.modificationTime) {
      const ageMs = Date.now() - fileInfo.modificationTime * 1000;
      if (ageMs > MAX_CACHE_AGE_MS) {
        // Delete expired file
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        return null;
      }
    }
    
    return localUri;
  } catch {
    return null;
  }
}

/**
 * Check if a fact image is already cached (public API)
 * 
 * This function only checks the local cache without downloading.
 * Use this for quick cache checks before deciding to download.
 * 
 * Optimized with in-memory existence cache to prevent redundant file system
 * operations when multiple components mount simultaneously (common on tablets).
 * 
 * @param factId The fact ID to check
 * @returns Local file URI if cached and valid, null otherwise
 */
export async function getCachedFactImage(factId: number): Promise<string | null> {
  const now = Date.now();
  
  // Check in-memory existence cache first (fast path for tablets with many cards)
  const existenceEntry = fileExistenceCache.get(factId);
  if (existenceEntry && (now - existenceEntry.checkedAt) < FILE_EXISTENCE_CACHE_MAX_AGE_MS) {
    // Return cached result without hitting file system
    return existenceEntry.uri;
  }
  
  // Check if there's already a pending existence check for this fact
  const pendingCheck = pendingExistenceChecks.get(factId);
  if (pendingCheck) {
    // Wait for the existing check to complete
    return pendingCheck;
  }
  
  // Start a new existence check and track it
  const checkPromise = performFileExistenceCheck(factId);
  pendingExistenceChecks.set(factId, checkPromise);
  
  try {
    const result = await checkPromise;
    
    // Cache the result for future calls
    if (result) {
      fileExistenceCache.set(factId, { uri: result, checkedAt: now });
    }
    
    return result;
  } finally {
    // Clean up pending check
    pendingExistenceChecks.delete(factId);
  }
}

/**
 * Internal: Actually performs the file system check for cached image
 * Uses sequential checks with early return for best performance
 * (most images are jpg or webp, so we check those first)
 */
async function performFileExistenceCheck(factId: number): Promise<string | null> {
  try {
    // No need to ensure directory exists - if it doesn't, file checks will simply fail
    // Check for common image extensions - ordered by frequency for early return
    // jpg and webp are most common, so check them first
    const extensions = ['jpg', 'webp', 'jpeg', 'png', 'gif'];
    
    for (const ext of extensions) {
      const localUri = `${FACT_IMAGES_DIR}fact-${factId}.${ext}`;
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      
      if (fileInfo.exists) {
        // Check if cache is still valid (7 days)
        if (fileInfo.modificationTime) {
          const ageMs = Date.now() - fileInfo.modificationTime * 1000;
          
          if (ageMs > MAX_CACHE_AGE_MS) {
            // Delete expired file in background, don't wait
            FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
            continue;
          }
        }
        
        // Valid cached image found - return immediately
        return localUri;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Download an image with App Check token authentication
 * 
 * This function:
 * 1. Checks the local file cache first (7-day TTL)
 * 2. If not cached, downloads with App Check token in header
 * 3. Caches the downloaded image locally
 * 
 * @param imageUrl The remote image URL to download
 * @param factId Optional fact ID for better caching
 * @param forceRefresh If true, bypasses cache and re-downloads
 * @returns Local file URI of the downloaded image, or null if download fails
 */
export async function downloadImageWithAppCheck(
  imageUrl: string,
  factId?: number,
  forceRefresh: boolean = false
): Promise<string | null> {
  try {
    // Check cache first (unless force refresh) - BEFORE ensuring directory exists
    // This makes cache hits faster by avoiding unnecessary async operations
    if (!forceRefresh && factId !== undefined) {
      // Use getCachedFactImage which checks ALL extensions
      // This is more reliable than URL-based extension detection
      const cachedUri = await getCachedFactImage(factId);
      if (cachedUri) {
        return cachedUri;
      }
      
      // Check if there's already a pending download for this fact
      // This prevents duplicate network requests when multiple components
      // request the same image simultaneously
      const pendingDownload = pendingDownloads.get(factId);
      if (pendingDownload && !forceRefresh) {
        if (__DEV__) {
          console.log(`🔄 Image Download: Waiting for pending download of factId=${factId}`);
        }
        return pendingDownload;
      }
    } else if (!forceRefresh && factId === undefined) {
      // Fallback for non-fact images (use URL-based lookup)
      const cachedUri = await getCachedImageUri(imageUrl, factId);
      if (cachedUri) {
        return cachedUri;
      }
    }
    
    // Only ensure directory exists when we need to download
    await ensureImagesDirExists();
    
    // Start the actual download and track it if we have a factId
    const downloadPromise = performImageDownload(imageUrl, factId, forceRefresh);
    
    if (factId !== undefined) {
      pendingDownloads.set(factId, downloadPromise);
      try {
        const result = await downloadPromise;
        return result;
      } finally {
        pendingDownloads.delete(factId);
      }
    }
    
    return downloadPromise;
  } catch {
    if (factId !== undefined) {
      pendingDownloads.delete(factId);
    }
    return null;
  }
}

/**
 * Internal function that performs the actual image download
 */
async function performImageDownload(
  imageUrl: string,
  factId: number | undefined,
  forceRefresh: boolean
): Promise<string | null> {
  try {
    // Get App Check token (uses cache to prevent rate limiting)
    let appCheckToken = await getCachedAppCheckToken();
    
    // REQUIRED: Do not make image requests without a valid App Check token
    if (!appCheckToken) {
      console.error(`❌ Image Download: No App Check token available for factId=${factId} - aborting request`);
      console.error('❌ Image Download: Check App Check initialization logs for the root cause');
      return null;
    }
    
    if (__DEV__) {
      const tokenPreview = appCheckToken.substring(0, 30);
      console.log(`🔒 Image Download: Token obtained for factId=${factId} (${tokenPreview}...)`);
    }
    
    // Prepare download destination
    const filename = getCacheFilename(imageUrl, factId);
    const localUri = `${FACT_IMAGES_DIR}${filename}`;
    
    // Track if we've already tried refreshing the token
    let hasRetriedWithFreshToken = false;
    
    // Download with retries
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        // Build headers with App Check token (token is guaranteed to be non-null at this point)
        const headers: Record<string, string> = {
          'X-Firebase-AppCheck': appCheckToken,
        };
        
        // Log headers being sent (helps debug missing header issues)
        if (__DEV__ && attempt === 0) {
          console.log(`🔒 Image Download: Sending request with X-Firebase-AppCheck header for factId=${factId}`);
        }
        
        // Use FileSystem.downloadAsync FIRST - it's much faster because it streams
        // directly to disk instead of loading into memory and converting to base64
        let downloadStatus = 0;
        
        try {
          // Try FileSystem.downloadAsync first - fastest option
          const downloadResult = await FileSystem.downloadAsync(
            imageUrl,
            localUri,
            { headers }
          );
          
          downloadStatus = downloadResult.status;
          
          if (downloadResult.status === 200) {
            // Update file existence cache so subsequent calls don't hit file system
            if (factId !== undefined) {
              fileExistenceCache.set(factId, { uri: downloadResult.uri, checkedAt: Date.now() });
            }
            
            if (__DEV__) {
              console.log(`✅ Image Download: Success for factId=${factId} using downloadAsync`);
            }
            
            return downloadResult.uri;
          }
        } catch (downloadError) {
          // If downloadAsync fails (e.g., headers not supported in some versions),
          // fall back to fetch + streaming write
          if (__DEV__) {
            console.log(`⚠️ Image Download: downloadAsync failed for factId=${factId}, trying fetch...`, downloadError);
          }
          
          try {
            const response = await fetch(imageUrl, { 
              method: 'GET',
              headers 
            });
            
            downloadStatus = response.status;
            
            if (response.ok) {
              // Use arrayBuffer for better performance than base64
              const arrayBuffer = await response.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              
              // Convert to base64 more efficiently
              let binary = '';
              const chunkSize = 32768; // Process in chunks for large images
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
                binary += String.fromCharCode.apply(null, Array.from(chunk));
              }
              const base64Data = btoa(binary);
              
              // Write the base64 data to file
              await FileSystem.writeAsStringAsync(localUri, base64Data, {
                encoding: FileSystem.EncodingType.Base64,
              });
              
              // Update file existence cache so subsequent calls don't hit file system
              if (factId !== undefined) {
                fileExistenceCache.set(factId, { uri: localUri, checkedAt: Date.now() });
              }
              
              if (__DEV__) {
                console.log(`✅ Image Download: Success for factId=${factId} using fetch`);
              }
              
              return localUri;
            }
          } catch (fetchError) {
            if (__DEV__) {
              console.log(`⚠️ Image Download: fetch also failed for factId=${factId}`, fetchError);
            }
            // Continue to retry logic
          }
        }
        
        // Handle 401/403 - likely App Check token issue
        // Try refreshing the token once before giving up
        if ((downloadStatus === 401 || downloadStatus === 403) && !hasRetriedWithFreshToken) {
          hasRetriedWithFreshToken = true;
          
          if (__DEV__) {
            console.log(`🔄 Image Download: Got ${downloadStatus}, refreshing App Check token...`);
          }
          
          const freshToken = await forceRefreshAppCheckToken();
          if (freshToken) {
            appCheckToken = freshToken;
            // Don't count this as an attempt - decrement before continue
            // because the for loop will increment attempt at the end of the iteration
            attempt--;
            continue;
          } else {
            // Cannot proceed without a valid token
            console.error('❌ Image Download: Failed to refresh App Check token - aborting');
            return null;
          }
        }
        
        // Handle non-200 status codes
        // Don't retry on client errors (4xx) except 429 (rate limit) and already handled 401/403
        if (downloadStatus >= 400 && downloadStatus < 500 && downloadStatus !== 429) {
          if (__DEV__) {
            console.warn(`⚠️ Image Download: Failed with status ${downloadStatus} for factId=${factId}`);
          }
          return null;
        }
        
        lastError = new Error(`HTTP ${downloadStatus}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      
      // Wait before retrying (exponential backoff)
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    if (__DEV__ && lastError) {
      console.warn(`⚠️ Image Download: All retries failed for factId=${factId}:`, lastError.message);
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Get a fact image URI with App Check authentication
 * This function checks the cache first, then downloads if needed
 * 
 * @param imageUrl The remote image URL
 * @param factId The fact ID for caching
 * @returns Object with localUri (if available) and loading state
 */
export async function getFactImageUri(
  imageUrl: string,
  factId: number
): Promise<{ uri: string | null; fromCache: boolean }> {
  // Check cache first using getCachedFactImage which checks ALL extensions
  // This is more reliable than URL-based extension detection
  const cachedUri = await getCachedFactImage(factId);
  if (cachedUri) {
    return { uri: cachedUri, fromCache: true };
  }
  
  // Download with App Check
  const downloadedUri = await downloadImageWithAppCheck(imageUrl, factId);
  return { uri: downloadedUri, fromCache: false };
}

/**
 * Prefetch an image for later use
 * Downloads the image in the background and caches it locally
 * 
 * @param imageUrl The remote image URL
 * @param factId The fact ID for caching
 */
export async function prefetchFactImage(
  imageUrl: string,
  factId: number
): Promise<void> {
  try {
    // Check if already cached using getCachedFactImage which checks ALL extensions
    // This is more reliable than URL-based extension detection
    const cachedUri = await getCachedFactImage(factId);
    if (cachedUri) {
      return; // Already cached
    }
    
    // Download in background
    await downloadImageWithAppCheck(imageUrl, factId);
  } catch {
    // Silently fail for prefetch
  }
}

/**
 * Clean up old cached images to free up disk space
 * Called periodically to prevent cache from growing indefinitely
 * 
 * @param maxAgeDays Maximum age in days before images are deleted (default: 7)
 * @returns Number of images deleted
 */
export async function cleanupOldCachedImages(maxAgeDays: number = 7): Promise<number> {
  try {
    await ensureImagesDirExists();
    
    const files = await FileSystem.readDirectoryAsync(FACT_IMAGES_DIR);
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = `${FACT_IMAGES_DIR}${file}`;
      
      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        
        if (fileInfo.exists && fileInfo.modificationTime) {
          const fileAgeMs = now - fileInfo.modificationTime * 1000;
          
          if (fileAgeMs > maxAgeMs) {
            await FileSystem.deleteAsync(filePath, { idempotent: true });
            deletedCount++;
            
            // Extract factId from filename (format: fact-{id}.{ext})
            const match = file.match(/^fact-(\d+)\./);
            if (match) {
              const factId = parseInt(match[1], 10);
              fileExistenceCache.delete(factId);
            }
          }
        }
      } catch {
        // Ignore individual file errors
      }
    }
    
    return deletedCount;
  } catch {
    return 0;
  }
}

/**
 * Clear all in-memory caches (file existence cache, pending checks, and pending downloads)
 * Useful when needing to force a fresh check, e.g., after app update
 */
export function clearImageMemoryCaches(): void {
  fileExistenceCache.clear();
  pendingExistenceChecks.clear();
  pendingDownloads.clear();
  imagesDirExists = false;
  imagesDirCheckPromise = null;
}

/**
 * Delete a specific cached image for a fact
 * 
 * @param factId The fact ID
 */
export async function deleteCachedFactImage(factId: number): Promise<void> {
  try {
    // Clear from existence cache first
    fileExistenceCache.delete(factId);
    pendingExistenceChecks.delete(factId);
    
    const extensions = ['jpg', 'jpeg', 'webp', 'png', 'gif'];
    
    for (const ext of extensions) {
      const uri = `${FACT_IMAGES_DIR}fact-${factId}.${ext}`;
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    }
  } catch {
    // Ignore deletion errors
  }
}

/**
 * Get the cache directory path (for debugging)
 */
export function getCacheDirectory(): string {
  return FACT_IMAGES_DIR;
}

