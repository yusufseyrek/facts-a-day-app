import { useEffect, useRef, useState } from 'react';

import { resolveFactImageUri } from '../services/images';

/**
 * Resolves the best available image URI for a fact (local cache → remote URL).
 * Resets immediately on fact change to prevent stale images from recycled cells.
 *
 * @param factId The fact ID
 * @param remoteUrl The remote image URL (may be null/undefined)
 * @param initialUri Optional initial URI to show before resolution (e.g., for layout stability)
 * @returns The resolved URI, or null if unavailable
 */
export function useResolvedImageUri(
  factId: number,
  remoteUrl: string | undefined | null,
  initialUri?: string | null
): string | null {
  const [resolvedUri, setResolvedUri] = useState<string | null>(initialUri ?? null);

  // Reset immediately on fact change to prevent stale images from recycled cells
  const lastFactIdRef = useRef(factId);
  if (lastFactIdRef.current !== factId) {
    lastFactIdRef.current = factId;
    setResolvedUri(initialUri ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    resolveFactImageUri(factId, remoteUrl).then((uri) => {
      if (!cancelled) setResolvedUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [factId, remoteUrl]);

  return resolvedUri;
}
