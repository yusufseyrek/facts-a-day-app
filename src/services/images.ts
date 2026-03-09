/**
 * Image Service
 *
 * This service handles downloading fact images for local use (e.g., iOS notifications).
 * Display images no longer require local downloads — components use remote URLs
 * directly with expo-image.
 *
 * The service:
 * 1. Downloads images to local storage when needed (notifications)
 * 2. Pre-caches home screen & story images for offline access (2-day TTL)
 * 3. Provides cache management functions (clear, size)
 *
 * IMPORTANT: Uses documentDirectory (persistent) instead of cacheDirectory
 * because cacheDirectory can be cleared by the OS at any time.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { IMAGE_CACHE, IMAGE_DOWNLOAD_RETRY, PRECACHE } from '../config/images';

import { getFactsForOfflineCache } from './database';
import { getIsConnected } from './network';

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
 * Call this at app startup to pre-warm the directory check.
 */
export async function ensureImagesDirExists(): Promise<void> {
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
  const fileExtension = validExtensions.includes(extension) ? extension : 'webp';

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
export function getCachedFactImageSync(factId: number): string | null {
  const entry = fileExistenceCache.get(factId);
  if (entry && Date.now() - entry.checkedAt < IMAGE_CACHE.FILE_EXISTENCE_CACHE_MAX_AGE_MS) {
    return entry.uri;
  }
  return null;
}

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
  const maxAgeMs = IMAGE_CACHE.MAX_AGE_MS;

  try {
    // Fast path: check known extension first (single file system call)
    const knownExt = knownExtensions.get(factId);
    if (knownExt) {
      const localUri = `${FACT_IMAGES_DIR}fact-${factId}.${knownExt}`;
      try {
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        if (fileInfo.exists) {
          // Reject files that are too small (corrupt/partial downloads)
          if (fileInfo.size !== undefined && fileInfo.size < IMAGE_CACHE.MIN_FILE_SIZE_BYTES) {
            FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
            knownExtensions.delete(factId);
          } else if (fileInfo.modificationTime) {
            // Check if cache is still valid (2-day TTL)
            const ageMs = Date.now() - fileInfo.modificationTime * 1000;
            if (ageMs > maxAgeMs) {
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
    const extensions = ['webp', 'jpg', 'jpeg', 'png', 'gif'];
    const checkResults = await Promise.all(
      extensions.map(async (ext) => {
        const localUri = `${FACT_IMAGES_DIR}fact-${factId}.${ext}`;
        try {
          const fileInfo = await FileSystem.getInfoAsync(localUri);

          if (fileInfo.exists) {
            // Reject files that are too small (corrupt/partial downloads)
            if (fileInfo.size !== undefined && fileInfo.size < IMAGE_CACHE.MIN_FILE_SIZE_BYTES) {
              FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
              return null;
            }

            // Check if cache is still valid (2-day TTL)
            if (fileInfo.modificationTime) {
              const ageMs = Date.now() - fileInfo.modificationTime * 1000;

              if (ageMs > maxAgeMs) {
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
 * Download an image to local storage.
 *
 * Used primarily for iOS notification image attachments. Display images
 * no longer need local downloads — use remote URLs directly with expo-image.
 *
 * @param imageUrl The remote image URL to download
 * @param factId Optional fact ID for better caching
 * @param forceRefresh If true, bypasses cache and re-downloads
 * @returns Local file URI of the downloaded image, or null if download fails
 */
export async function downloadImage(
  imageUrl: string,
  factId?: number,
  forceRefresh: boolean = false
): Promise<string | null> {
  try {
    // Check cache first (unless force refresh)
    if (!forceRefresh && factId !== undefined) {
      const cachedUri = await getCachedFactImage(factId);
      if (cachedUri) {
        return cachedUri;
      }

      const pendingDownload = pendingDownloads.get(factId);
      if (pendingDownload) {
        return pendingDownload;
      }
    }

    await ensureImagesDirExists();

    const downloadPromise = performImageDownload(imageUrl, factId);

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
  factId: number | undefined
): Promise<string | null> {
  try {
    const filename = getCacheFilename(imageUrl, factId);
    const localUri = `${FACT_IMAGES_DIR}${filename}`;
    const tempUri = `${localUri}.${Date.now()}.tmp`;

    for (let attempt = 0; attempt < IMAGE_DOWNLOAD_RETRY.MAX_ATTEMPTS; attempt++) {
      try {
        let downloadStatus = 0;

        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Download timeout')), IMAGE_DOWNLOAD_RETRY.TIMEOUT_MS)
          );
          const downloadResult = await Promise.race([
            FileSystem.downloadAsync(imageUrl, tempUri),
            timeoutPromise,
          ]);

          downloadStatus = downloadResult.status;

          if (downloadResult.status === 200) {
            const fileInfo = await FileSystem.getInfoAsync(tempUri);
            if (!fileInfo.exists) {
              throw new Error('Downloaded file does not exist');
            }
            if (fileInfo.size !== undefined && fileInfo.size < IMAGE_CACHE.MIN_FILE_SIZE_BYTES) {
              FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
              throw new Error(`Downloaded file too small: ${fileInfo.size} bytes`);
            }

            await FileSystem.moveAsync({ from: tempUri, to: localUri });

            if (factId !== undefined) {
              fileExistenceCache.set(factId, { uri: localUri, checkedAt: Date.now() });
              const ext = localUri.split('.').pop() || 'jpg';
              knownExtensions.set(factId, ext);
            }

            return localUri;
          }
        } catch {
          FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});

          try {
            const controller = new AbortController();
            const fetchTimeout = setTimeout(
              () => controller.abort(),
              IMAGE_DOWNLOAD_RETRY.TIMEOUT_MS
            );

            const response = await fetch(imageUrl, {
              method: 'GET',
              signal: controller.signal,
            });

            clearTimeout(fetchTimeout);
            downloadStatus = response.status;

            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);

              if (uint8Array.length < IMAGE_CACHE.MIN_FILE_SIZE_BYTES) {
                throw new Error(`Fetched image too small: ${uint8Array.length} bytes`);
              }

              let binary = '';
              const chunkSize = 32768;
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
                binary += String.fromCharCode.apply(null, Array.from(chunk));
              }
              const base64Data = btoa(binary);

              await FileSystem.writeAsStringAsync(tempUri, base64Data, {
                encoding: FileSystem.EncodingType.Base64,
              });

              const writtenInfo = await FileSystem.getInfoAsync(tempUri);
              if (!writtenInfo.exists) {
                throw new Error('Written file does not exist');
              }
              if (
                writtenInfo.size !== undefined &&
                writtenInfo.size < IMAGE_CACHE.MIN_FILE_SIZE_BYTES
              ) {
                FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
                throw new Error(`Written file too small: ${writtenInfo.size} bytes`);
              }

              await FileSystem.moveAsync({ from: tempUri, to: localUri });

              if (factId !== undefined) {
                fileExistenceCache.set(factId, { uri: localUri, checkedAt: Date.now() });
                const ext = localUri.split('.').pop() || 'jpg';
                knownExtensions.set(factId, ext);
              }

              return localUri;
            }
          } catch {
            FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
          }
        }

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (downloadStatus >= 400 && downloadStatus < 500 && downloadStatus !== 429) {
          return null;
        }
      } catch {
        // Continue to retry
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
 * Clear all in-memory caches
 */
function clearImageMemoryCaches(): void {
  fileExistenceCache.clear();
  knownExtensions.clear();
  pendingExistenceChecks.clear();
  pendingDownloads.clear();
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

/**
 * Resolve the best available image URI for a fact.
 * Checks local cache first (with retry), falls back to remote URL only when online.
 * Returns null when offline and no cached image exists.
 */
export async function resolveFactImageUri(
  factId: number,
  remoteUrl: string | undefined | null
): Promise<string | null> {
  // Try local cache
  const localUri = await getCachedFactImage(factId);

  if (localUri) return localUri;

  // Fall back to remote URL only when online
  if (remoteUrl && getIsConnected()) return remoteUrl;

  return null;
}

/**
 * Pre-cache images for offline access.
 * Downloads images for: fact of the day, popular, worth knowing, and last 10 facts per category (story view).
 *
 * @param maxImages Optional cap on images to download (for background sessions)
 * @param onProgress Optional callback with progress 0-1
 * @returns Summary of pre-caching results
 */
let _preCacheInProgress = false;

export async function preCacheOfflineImages(
  maxImages?: number,
  onProgress?: (progress: number) => void
): Promise<{ total: number; alreadyCached: number; downloaded: number; failed: number }> {
  // Prevent concurrent pre-cache runs from fighting over progress state
  if (_preCacheInProgress) {
    return { total: 0, alreadyCached: 0, downloaded: 0, failed: 0 };
  }
  _preCacheInProgress = true;

  try {
    return await _preCacheOfflineImagesInner(maxImages, onProgress);
  } finally {
    _preCacheInProgress = false;
  }
}

async function _preCacheOfflineImagesInner(
  maxImages?: number,
  onProgress?: (progress: number) => void
): Promise<{ total: number; alreadyCached: number; downloaded: number; failed: number }> {
  const factsToCache = await getFactsForOfflineCache();

  let alreadyCached = 0;
  let downloaded = 0;
  let failed = 0;

  // Filter to only uncached images
  const uncached: Array<{ id: number; image_url: string }> = [];
  for (const fact of factsToCache) {
    const cached = await getCachedFactImage(fact.id);
    if (cached) {
      alreadyCached++;
    } else {
      uncached.push(fact);
    }
  }

  // If everything is already cached, signal complete immediately
  if (uncached.length === 0) {
    onProgress?.(1);
    return { total: factsToCache.length, alreadyCached, downloaded, failed };
  }

  // Apply max limit (for background sessions with limited time)
  const toDownload = maxImages ? uncached.slice(0, maxImages) : uncached;

  onProgress?.(0);
  let completed = 0;

  // Download with concurrency control
  const concurrency = PRECACHE.CONCURRENCY;
  for (let i = 0; i < toDownload.length; i += concurrency) {
    const batch = toDownload.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((fact) => downloadImage(fact.image_url, fact.id))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      completed++;
      if (result.status === 'fulfilled' && result.value) {
        downloaded++;
      } else {
        failed++;
      }
    }
    onProgress?.(completed / toDownload.length);
  }

  return {
    total: factsToCache.length,
    alreadyCached,
    downloaded,
    failed,
  };
}
