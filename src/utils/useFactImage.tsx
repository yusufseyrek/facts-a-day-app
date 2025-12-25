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

import { useState, useEffect, useCallback, useRef } from 'react';
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

// In-memory cache of resolved image URIs (session-only, cleared on app restart)
// This prevents duplicate async calls within a session
const resolvedImages = new Map<string, string>();

// Track ongoing fetch operations to prevent duplicate downloads
const pendingFetches = new Map<string, Promise<string | null>>();

/**
 * Get a cache key for a fact image
 */
function getCacheKey(factId: number): string {
  return `fact-${factId}`;
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
  const cacheKey = getCacheKey(factId);
  
  // Check in-memory cache for instant result (only valid within session)
  const memoryCachedUri = !forceRefresh ? resolvedImages.get(cacheKey) : null;
  
  // Initialize state
  const [imageUri, setImageUri] = useState<string | null>(memoryCachedUri || null);
  const [isLoading, setIsLoading] = useState<boolean>(!!remoteUrl && !memoryCachedUri);
  const [hasError, setHasError] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  
  // Track mounted state
  const isMounted = useRef(true);
  
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // Fetch image effect
  useEffect(() => {
    // Skip if no URL
    if (!remoteUrl) {
      setImageUri(null);
      setIsLoading(false);
      setHasError(false);
      return;
    }
    
    // Check in-memory cache (instant)
    if (!forceRefresh && resolvedImages.has(cacheKey)) {
      const cached = resolvedImages.get(cacheKey)!;
      if (imageUri !== cached) {
        setImageUri(cached);
      }
      setIsLoading(false);
      setHasError(false);
      return;
    }
    
    // Need to check file cache or download
    const fetchImage = async () => {
      if (!isMounted.current) return;
      
      try {
        // Check if there's already a pending fetch for this image
        let fetchPromise = pendingFetches.get(cacheKey);
        
        if (!fetchPromise || forceRefresh || retryCount > 0) {
          setIsLoading(true);
          setHasError(false);
          
          // downloadImageWithAppCheck handles file cache check internally
          // It will return cached file URI if valid, or download if not
          fetchPromise = downloadImageWithAppCheck(
            remoteUrl,
            factId,
            forceRefresh || retryCount > 0
          );
          
          pendingFetches.set(cacheKey, fetchPromise);
        }
        
        const localUri = await fetchPromise;
        
        // Clean up pending fetch
        pendingFetches.delete(cacheKey);
        
        if (!isMounted.current) return;
        
        if (localUri) {
          // Store in memory cache for instant access within session
          resolvedImages.set(cacheKey, localUri);
          setImageUri(localUri);
          setHasError(false);
        } else {
          console.error(`❌ Failed to get image for fact ${factId}`);
          setImageUri(null);
          setHasError(true);
        }
      } catch (error) {
        pendingFetches.delete(cacheKey);
        
        if (!isMounted.current) return;
        
        console.error(`❌ Error getting image for fact ${factId}:`, error);
        setImageUri(null);
        setHasError(true);
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    };
    
    fetchImage();
  }, [remoteUrl, factId, cacheKey, forceRefresh, retryCount, imageUri]);
  
  // Retry function
  const retry = useCallback(() => {
    resolvedImages.delete(cacheKey);
    pendingFetches.delete(cacheKey);
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
              resolvedImages.set(cacheKey, uri);
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
  pendingFetches.clear();
  console.log('🗑️ In-memory image cache cleared');
}
