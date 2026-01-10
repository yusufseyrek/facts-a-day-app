/**
 * Image Service with App Check Token Support
 *
 * This service handles downloading fact images with Firebase App Check tokens
 * to authenticate requests to protected image endpoints.
 *
 * The service:
 * 1. Gets an App Check token before downloading (if available)
 * 2. Downloads images with the token in the X-Firebase-AppCheck header
 * 3. Falls back to direct URL access if App Check token is unavailable
 * 4. Caches images locally for offline access and performance (7-day TTL)
 * 5. Provides both hooks for React components and utility functions for services
 *
 * FALLBACK BEHAVIOR: If App Check token is not available (e.g., initialization
 * failed, emulator, etc.), the service will attempt to download images without
 * the token. If the server requires App Check (returns 401/403), it fails fast.
 *
 * IMPORTANT: Uses documentDirectory (persistent) instead of cacheDirectory
 * because cacheDirectory can be cleared by the OS at any time.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { PREFETCH_SETTINGS } from '../config/factListSettings';
import { IMAGE_CACHE, IMAGE_DOWNLOAD_RETRY } from '../config/images';

import { forceRefreshAppCheckToken, getCachedAppCheckToken } from './appCheckToken';

// Directory for cached fact images - uses documentDirectory for persistence
// cacheDirectory is NOT reliable for multi-day caching as it can be cleared by OS
const FACT_IMAGES_DIR = `${FileSystem.documentDirectory}${IMAGE_CACHE.FACT_IMAGES_DIR_NAME}`;

// In-memory cache for file existence to avoid repeated file system checks
// Key: factId, Value: { uri: string, checkedAt: number }
// This prevents multiple components from hitting the file system for the same fact
const fileExistenceCache = new Map<number, { uri: string; checkedAt: number }>();

// Registry to track the actual file extension for each fact (avoids extension guessing)
// Populated on download success, used for faster cache checks on subsequent sessions
const knownExtensions = new Map<number, string>();

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
    hash = (hash << 5) - hash + char;
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
      if (ageMs > IMAGE_CACHE.MAX_AGE_MS) {
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
  if (
    existenceEntry &&
    now - existenceEntry.checkedAt < IMAGE_CACHE.FILE_EXISTENCE_CACHE_MAX_AGE_MS
  ) {
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
 * Uses known extension for single-call lookup, falls back to parallel check
 */
async function performFileExistenceCheck(factId: number): Promise<string | null> {
  try {
    // Fast path: check known extension first (single file system call)
    const knownExt = knownExtensions.get(factId);
    if (knownExt) {
      const localUri = `${FACT_IMAGES_DIR}fact-${factId}.${knownExt}`;
      try {
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        if (fileInfo.exists) {
          // Check if cache is still valid (7 days)
          if (fileInfo.modificationTime) {
            const ageMs = Date.now() - fileInfo.modificationTime * 1000;
            if (ageMs > IMAGE_CACHE.MAX_AGE_MS) {
              FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
              knownExtensions.delete(factId);
            } else {
              return localUri;
            }
          } else {
            return localUri;
          }
        } else {
          // File no longer exists, remove from registry
          knownExtensions.delete(factId);
        }
      } catch {
        knownExtensions.delete(factId);
      }
    }

    // Fallback: check all extensions in parallel
    const extensions = ['jpg', 'webp', 'jpeg', 'png', 'gif'];
    const checkResults = await Promise.all(
      extensions.map(async (ext) => {
        const localUri = `${FACT_IMAGES_DIR}fact-${factId}.${ext}`;
        try {
          const fileInfo = await FileSystem.getInfoAsync(localUri);

          if (fileInfo.exists) {
            // Check if cache is still valid (7 days)
            if (fileInfo.modificationTime) {
              const ageMs = Date.now() - fileInfo.modificationTime * 1000;

              if (ageMs > IMAGE_CACHE.MAX_AGE_MS) {
                // Delete expired file in background, don't wait
                FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
                return null;
              }
            }
            // Store extension for future fast lookups
            knownExtensions.set(factId, ext);
            return localUri;
          }
        } catch {
          // Ignore individual check errors
        }
        return null;
      })
    );

    // Return first valid result (maintains extension priority order)
    return checkResults.find((uri) => uri !== null) || null;
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
  _forceRefresh: boolean
): Promise<string | null> {
  try {
    // Get App Check token (uses cache to prevent rate limiting)
    let appCheckToken = await getCachedAppCheckToken();

    // Track if we're using fallback mode (no App Check token)
    const usingFallback = !appCheckToken;

    if (usingFallback && __DEV__) {
      console.warn(
        `⚠️ Image Download: No App Check token available for factId=${factId}, attempting fallback without token`
      );
    }

    // Prepare download destination
    const filename = getCacheFilename(imageUrl, factId);
    const localUri = `${FACT_IMAGES_DIR}${filename}`;

    // Track if we've already tried refreshing the token
    let hasRetriedWithFreshToken = false;

    for (let attempt = 0; attempt < IMAGE_DOWNLOAD_RETRY.MAX_ATTEMPTS; attempt++) {
      try {
        // Build headers - include App Check token if available
        const headers: Record<string, string> = {};
        if (appCheckToken) {
          headers['X-Firebase-AppCheck'] = appCheckToken;
        }

        // Use FileSystem.downloadAsync FIRST - it's much faster because it streams
        // directly to disk instead of loading into memory and converting to base64
        let downloadStatus = 0;

        try {
          // Try FileSystem.downloadAsync first - fastest option
          const downloadResult = await FileSystem.downloadAsync(imageUrl, localUri, { headers });

          downloadStatus = downloadResult.status;

          if (downloadResult.status === 200) {
            // Update file existence cache so subsequent calls don't hit file system
            if (factId !== undefined) {
              fileExistenceCache.set(factId, { uri: downloadResult.uri, checkedAt: Date.now() });
              // Store extension for faster lookups in future sessions
              const ext = downloadResult.uri.split('.').pop() || 'jpg';
              knownExtensions.set(factId, ext);
            }

            return downloadResult.uri;
          }
        } catch {
          // If downloadAsync fails (e.g., headers not supported in some versions),
          // fall back to fetch + streaming write
          try {
            const response = await fetch(imageUrl, {
              method: 'GET',
              headers,
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
                // Store extension for faster lookups in future sessions
                const ext = localUri.split('.').pop() || 'jpg';
                knownExtensions.set(factId, ext);
              }

              return localUri;
            }
          } catch {
            // Continue to retry logic
          }
        }

        // Handle 401/403 - likely App Check token issue
        // Try refreshing the token once before giving up (only if we had a token to begin with)
        if (
          (downloadStatus === 401 || downloadStatus === 403) &&
          !hasRetriedWithFreshToken &&
          !usingFallback
        ) {
          hasRetriedWithFreshToken = true;

          const freshToken = await forceRefreshAppCheckToken();
          if (freshToken) {
            appCheckToken = freshToken;
            // Don't count this as an attempt - decrement before continue
            // because the for loop will increment attempt at the end of the iteration
            attempt--;
            continue;
          } else {
            // Token refresh failed - continue with remaining retries
            // The server might still accept the request in some cases
            if (__DEV__) {
              console.warn(
                '⚠️ Image Download: Failed to refresh App Check token, continuing with retries'
              );
            }
          }
        }

        // In fallback mode, 401/403 means the server requires App Check - fail fast
        if ((downloadStatus === 401 || downloadStatus === 403) && usingFallback) {
          if (__DEV__) {
            console.warn(
              `⚠️ Image Download: Server rejected request without App Check token (${downloadStatus})`
            );
          }
          return null;
        }

        // Handle non-200 status codes
        // Don't retry on client errors (4xx) except 429 (rate limit) and already handled 401/403
        if (downloadStatus >= 400 && downloadStatus < 500 && downloadStatus !== 429) {
          return null;
        }

        // Set error for debugging (prefixed to indicate unused but kept for context)
        const _lastError = new Error(`HTTP ${downloadStatus}`);
      } catch (error) {
        // Error captured for potential debugging (prefixed to indicate unused)
        const _caughtError = error instanceof Error ? error : new Error(String(error));
      }

      // Wait before retrying (exponential backoff)
      if (attempt < IMAGE_DOWNLOAD_RETRY.MAX_ATTEMPTS - 1) {
        const delay = IMAGE_DOWNLOAD_RETRY.DELAY_BASE_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Prefetch an image for later use
 * Downloads the image in the background and caches it locally
 *
 * @param imageUrl The remote image URL
 * @param factId The fact ID for caching
 */
export async function prefetchFactImage(imageUrl: string, factId: number): Promise<void> {
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

// Track prefetched fact IDs to prevent duplicate prefetch requests
const prefetchedFactIds = new Set<number>();

// Track active prefetch count
let activePrefetchCount = 0;
const prefetchQueue: Array<{ imageUrl: string; factId: number }> = [];

/**
 * Process the next item in the prefetch queue
 */
async function processPrefetchQueue(): Promise<void> {
  // Check if we can start another download
  if (activePrefetchCount >= PREFETCH_SETTINGS.maxConcurrent || prefetchQueue.length === 0) {
    return;
  }

  // Get next item from queue
  const item = prefetchQueue.shift();
  if (!item) return;

  activePrefetchCount++;

  try {
    await prefetchFactImage(item.imageUrl, item.factId);
  } catch {
    // Silently fail for prefetch, but remove from tracking set on failure
    prefetchedFactIds.delete(item.factId);
  } finally {
    activePrefetchCount--;
    // Process next item in queue
    processPrefetchQueue();
  }
}

/**
 * Prefetch images for a list of facts with rate limiting
 *
 * This function:
 * 1. Only prefetches the first N images initially (for visible items)
 * 2. Limits concurrent downloads to prevent network saturation
 * 3. Uses a queue system to process downloads sequentially in batches
 *
 * @param facts Array of facts with image_url and id properties
 * @param maxInitialPrefetch Maximum number of images to prefetch initially (default: 6)
 */
export function prefetchFactImagesWithLimit(
  facts: Array<{ id: number; image_url?: string | null }>,
  maxInitialPrefetch: number = PREFETCH_SETTINGS.maxInitialPrefetch
): void {
  // Filter to only facts with images that haven't been prefetched yet
  const factsWithImages = facts.filter((fact) => fact.image_url && !prefetchedFactIds.has(fact.id));

  if (factsWithImages.length === 0) {
    return;
  }

  // Clear prefetch set if it gets too large to prevent memory leaks
  if (prefetchedFactIds.size > PREFETCH_SETTINGS.maxCacheSize) {
    prefetchedFactIds.clear();
    prefetchQueue.length = 0; // Clear queue too
  }

  // Only prefetch the first N items initially (most likely to be visible)
  const factsToQueue = factsWithImages.slice(0, maxInitialPrefetch);

  // Add to tracking set and queue
  factsToQueue.forEach((fact) => {
    prefetchedFactIds.add(fact.id);
    prefetchQueue.push({
      imageUrl: fact.image_url!,
      factId: fact.id,
    });
  });

  // Start processing queue (will respect concurrent limit)
  for (let i = 0; i < PREFETCH_SETTINGS.maxConcurrent; i++) {
    processPrefetchQueue();
  }
}

/**
 * Clear all in-memory caches
 * Called when clearing disk cache or when memory pressure is detected
 */
function clearImageMemoryCaches(): void {
  fileExistenceCache.clear();
  knownExtensions.clear();
  pendingExistenceChecks.clear();
  pendingDownloads.clear();
  prefetchedFactIds.clear();
  prefetchQueue.length = 0;
  imagesDirExists = false;
}

/**
 * Clear all cached images to free up disk space
 *
 * @returns Object with count of deleted files and freed space estimate
 */
export async function clearAllCachedImages(): Promise<{
  deletedCount: number;
  freedBytes: number;
}> {
  try {
    // Clear in-memory caches first
    clearImageMemoryCaches();

    // Check if directory exists
    const dirInfo = await FileSystem.getInfoAsync(FACT_IMAGES_DIR);
    if (!dirInfo.exists) {
      return { deletedCount: 0, freedBytes: 0 };
    }

    const files = await FileSystem.readDirectoryAsync(FACT_IMAGES_DIR);
    let deletedCount = 0;
    let freedBytes = 0;

    for (const file of files) {
      const filePath = `${FACT_IMAGES_DIR}${file}`;

      try {
        // Get file size before deleting
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists && fileInfo.size) {
          freedBytes += fileInfo.size;
        }

        await FileSystem.deleteAsync(filePath, { idempotent: true });
        deletedCount++;
      } catch {
        // Ignore individual file errors
      }
    }

    return { deletedCount, freedBytes };
  } catch {
    return { deletedCount: 0, freedBytes: 0 };
  }
}

/**
 * Get the total size of cached images
 *
 * @returns Total size in bytes
 */
export async function getCachedImagesSize(): Promise<number> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(FACT_IMAGES_DIR);
    if (!dirInfo.exists) {
      return 0;
    }

    const files = await FileSystem.readDirectoryAsync(FACT_IMAGES_DIR);
    let totalSize = 0;

    for (const file of files) {
      const filePath = `${FACT_IMAGES_DIR}${file}`;

      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists && fileInfo.size) {
          totalSize += fileInfo.size;
        }
      } catch {
        // Ignore individual file errors
      }
    }

    return totalSize;
  } catch {
    return 0;
  }
}
