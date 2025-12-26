/**
 * useFactImage Hook
 * 
 * A React hook that handles fetching fact images with App Check authentication.
 * 
 * IMPORTANT: Remote image URLs require App Check tokens in headers. Since expo-image
 * cannot add custom headers, all images MUST be downloaded locally with App Check
 * authentication before they can be displayed.
 * 
 * Cache Strategy:
 * 1. In-memory cache (instant, session-only)
 * 2. Local file cache in documentDirectory (persistent, 7-day TTL)
 * 3. Download with App Check only if not cached
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { downloadImageWithAppCheck } from '../services/images';

interface UseFactImageResult {
  /** The local image URI (null if not yet downloaded or download failed) */
  imageUri: string | null;
  /** Whether the image is currently being loaded/downloaded */
  isLoading: boolean;
  /** Whether there was an error downloading the image */
  hasError: boolean;
  /** Whether the image is ready to be displayed */
  isReady: boolean;
  /** Force re-download the image */
  retry: () => void;
}

interface UseFactImageOptions {
  /** If true, forces a fresh download bypassing cache */
  forceRefresh?: boolean;
}

// Maximum size of in-memory cache to prevent memory issues on tablets
// Increased to 200 for better performance on tablets with many facts visible
const MAX_MEMORY_CACHE_SIZE = 200;

// Maximum time to wait for a pending fetch before starting a new one
const PENDING_FETCH_TIMEOUT_MS = 30000; // 30 seconds

// In-memory cache of resolved image URIs (session-only, cleared on app restart)
// This prevents duplicate async calls within a session
const resolvedImages = new Map<string, string>();

// Track when each cache entry was added for LRU eviction
const resolvedImagesTimestamps = new Map<string, number>();

// Track ongoing fetch operations to prevent duplicate downloads
interface PendingFetch {
  promise: Promise<string | null>;
  startTime: number;
}
const pendingFetches = new Map<string, PendingFetch>();

/**
 * Get a cache key for a fact image
 */
function getCacheKey(factId: number): string {
  return `fact-${factId}`;
}

/**
 * Clean up old entries from memory cache using LRU strategy
 */
function cleanupMemoryCacheIfNeeded(): void {
  if (resolvedImages.size <= MAX_MEMORY_CACHE_SIZE) {
    return;
  }
  
  // Sort by timestamp and remove oldest entries
  const entries = Array.from(resolvedImagesTimestamps.entries())
    .sort((a, b) => a[1] - b[1]);
  
  // Remove oldest 20% of entries
  const toRemove = Math.ceil(entries.length * 0.2);
  for (let i = 0; i < toRemove; i++) {
    const key = entries[i][0];
    resolvedImages.delete(key);
    resolvedImagesTimestamps.delete(key);
  }
}

/**
 * Clean up stale pending fetches that may have timed out
 */
function cleanupStalePendingFetches(): void {
  const now = Date.now();
  const staleKeys: string[] = [];
  
  pendingFetches.forEach((fetch, key) => {
    if (now - fetch.startTime > PENDING_FETCH_TIMEOUT_MS) {
      staleKeys.push(key);
    }
  });
  
  staleKeys.forEach(key => {
    pendingFetches.delete(key);
  });
}

/**
 * Hook to fetch and cache fact images with App Check authentication
 * 
 * IMPORTANT: This hook downloads images locally because remote URLs require
 * App Check tokens in headers, which expo-image cannot provide.
 * 
 * @param remoteUrl The remote image URL (requires App Check for access)
 * @param factId The fact ID for caching
 * @param options Optional configuration
 * @returns Object with imageUri (local), loading state, and error state
 */
export function useFactImage(
  remoteUrl: string | null | undefined,
  factId: number,
  options: UseFactImageOptions = {}
): UseFactImageResult {
  const { forceRefresh = false } = options;
  
  // Simple cache key based on factId only (URL is always the same for a fact)
  const cacheKey = useMemo(() => getCacheKey(factId), [factId]);
  
  // Get memory-cached URI SYNCHRONOUSLY to prevent flicker
  // This runs during render, not in an effect
  const memoryCachedUri = useMemo(() => {
    if (forceRefresh) return null;
    const cached = resolvedImages.get(cacheKey);
    if (cached) {
      // Update timestamp for LRU
      resolvedImagesTimestamps.set(cacheKey, Date.now());
    }
    return cached || null;
  }, [cacheKey, forceRefresh]);
  
  // Initialize state with memory cache value
  const [imageUri, setImageUri] = useState<string | null>(() => memoryCachedUri);
  const [isLoading, setIsLoading] = useState<boolean>(() => !!remoteUrl && !memoryCachedUri);
  const [hasError, setHasError] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  
  // Use ref to track last set URI to prevent unnecessary updates
  const lastUriRef = useRef<string | null>(imageUri);
  
  // Track mounted state
  const isMounted = useRef(true);
  
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // Sync with memory cache immediately when it becomes available
  useEffect(() => {
    if (!forceRefresh && memoryCachedUri && lastUriRef.current !== memoryCachedUri) {
      lastUriRef.current = memoryCachedUri;
      setImageUri(memoryCachedUri);
      setIsLoading(false);
      setHasError(false);
    }
  }, [memoryCachedUri, forceRefresh]);
  
  // Fetch image effect (only when not in memory cache)
  useEffect(() => {
    // Skip if no URL
    if (!remoteUrl) {
      if (lastUriRef.current !== null) {
        lastUriRef.current = null;
        setImageUri(null);
      }
      setIsLoading(false);
      setHasError(false);
      return;
    }
    
    // Skip if already have this URI from memory cache
    if (!forceRefresh && lastUriRef.current && resolvedImages.get(cacheKey) === lastUriRef.current) {
      setIsLoading(false);
      return;
    }
    
    // Need to check file cache or download
    const fetchImage = async () => {
      if (!isMounted.current) return;
      
      try {
        // Clean up stale pending fetches first
        cleanupStalePendingFetches();
        
        // Check if there's already a pending fetch for this image that's still valid
        let pendingFetch = pendingFetches.get(cacheKey);
        const now = Date.now();
        
        // Start new fetch if:
        // 1. No pending fetch exists
        // 2. Force refresh requested
        // 3. Retry requested
        // 4. Pending fetch is stale (timed out)
        const shouldStartNewFetch = 
          !pendingFetch || 
          forceRefresh || 
          retryCount > 0 ||
          (now - pendingFetch.startTime > PENDING_FETCH_TIMEOUT_MS);
        
        let fetchPromise: Promise<string | null>;
        
        if (shouldStartNewFetch) {
          setIsLoading(true);
          setHasError(false);
          
          // downloadImageWithAppCheck handles file cache check internally
          // It will return cached file URI if valid, or download if not
          fetchPromise = downloadImageWithAppCheck(
            remoteUrl,
            factId,
            forceRefresh || retryCount > 0
          );
          
          pendingFetches.set(cacheKey, {
            promise: fetchPromise,
            startTime: now,
          });
        } else {
          // Reuse existing pending fetch
          fetchPromise = pendingFetch!.promise;
          setIsLoading(true);
        }
        
        const localUri = await fetchPromise;
        
        // Clean up pending fetch after completion
        pendingFetches.delete(cacheKey);
        
        if (!isMounted.current) return;
        
        if (localUri) {
          // Clean up memory cache if it's getting too large
          cleanupMemoryCacheIfNeeded();
          
          // Store in memory cache for instant access within session
          resolvedImages.set(cacheKey, localUri);
          resolvedImagesTimestamps.set(cacheKey, Date.now());
          
          // Only update state if URI changed to prevent flicker
          if (lastUriRef.current !== localUri) {
            lastUriRef.current = localUri;
            setImageUri(localUri);
          }
          setHasError(false);
        } else {
          // Don't clear existing URI on error - keep showing cached/previous image
          if (!lastUriRef.current) {
            setHasError(true);
          }
        }
      } catch {
        pendingFetches.delete(cacheKey);
        
        if (!isMounted.current) return;
        
        // Don't clear existing URI on error
        if (!lastUriRef.current) {
          setHasError(true);
        }
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    };
    
    fetchImage();
  // Note: imageUri is intentionally NOT in dependencies to prevent re-fetch loops
  }, [remoteUrl, factId, cacheKey, forceRefresh, retryCount]);
  
  // Retry function
  const retry = useCallback(() => {
    resolvedImages.delete(cacheKey);
    resolvedImagesTimestamps.delete(cacheKey);
    pendingFetches.delete(cacheKey);
    lastUriRef.current = null;
    setRetryCount(prev => prev + 1);
  }, [cacheKey]);
  
  // Image is ready when we have a local URI and not loading
  const isReady = !!imageUri && !isLoading;
  
  return {
    imageUri,
    isLoading,
    hasError,
    isReady,
    retry,
  };
}

/**
 * Hook to prefetch multiple fact images in the background
 * Useful for prefetching images in a list before they're displayed
 * 
 * @param facts Array of objects with image_url and id properties
 */
export function usePrefetchFactImages(
  facts: Array<{ id: number; image_url?: string | null }>
): void {
  useEffect(() => {
    if (facts.length === 0) return;
    
    // Prefetch images in the background
    const prefetch = async () => {
      for (const fact of facts) {
        if (fact.image_url) {
          const cacheKey = getCacheKey(fact.id);
          
          // Skip if already resolved in this session
          if (resolvedImages.has(cacheKey)) {
            continue;
          }
          
          try {
            // downloadImageWithAppCheck checks file cache first
            const uri = await downloadImageWithAppCheck(fact.image_url, fact.id);
            if (uri) {
              cleanupMemoryCacheIfNeeded();
              resolvedImages.set(cacheKey, uri);
              resolvedImagesTimestamps.set(cacheKey, Date.now());
            }
          } catch {
            // Silently fail for prefetch
          }
        }
      }
    };
    
    // Start prefetch after a short delay to prioritize visible content
    const timeoutId = setTimeout(prefetch, 500);
    
    return () => clearTimeout(timeoutId);
  }, [facts]);
}

/**
 * Clear the in-memory image cache (session cache only)
 * File cache persists until 7-day TTL expires
 */
export function clearImageCache(): void {
  resolvedImages.clear();
  resolvedImagesTimestamps.clear();
  pendingFetches.clear();
}
