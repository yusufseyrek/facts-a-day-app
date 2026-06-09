import { useEffect, useRef, useState } from 'react';

import { resolveFactImageUri } from '../services/images';
import { onNetworkChange } from '../services/network';

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

    const resolve = () => {
      resolveFactImageUri(factId, remoteUrl).then((uri) => {
        if (!cancelled) setResolvedUri(uri);
      });
    };

    resolve();

    // Re-resolve when connectivity changes: if the first resolve happened while
    // we were (or appeared) offline and fell back to a null local cache, a
    // reconnect must retry so the remote URL is finally used. Without this a
    // transient offline blip at mount would strand the image at null.
    const unsubscribe = onNetworkChange(() => {
      if (remoteUrl) resolve();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [factId, remoteUrl]);

  return resolvedUri;
}
