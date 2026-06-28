import { useSyncExternalStore } from 'react';

/**
 * Whether the currently-focused search-bearing tab (search / favorites) has a
 * control docked at the header's RIGHT edge that the floating mini-player pill
 * must tuck to the LEFT of:
 *  - the native search CANCEL button while the field is active, or
 *  - the category-clear ✕ (search tab, iOS, a category selected).
 *
 * When false the right corner is clear and the pill hugs the edge instead of
 * floating awkwardly inboard. Written by the search & favorites screens (from
 * the search bar's focus/cancel events + category state); read by
 * PersistentMiniPlayer. A single module-level flag is safe because only one
 * search-bearing tab is focused at a time and each screen resets it to false on
 * blur. Mirrors the factMorph overlay store pattern (useSyncExternalStore).
 */
let rightEdgeOccupied = false;
const listeners = new Set<() => void>();

export function setSearchHeaderRightEdgeOccupied(occupied: boolean): void {
  if (rightEdgeOccupied === occupied) return;
  rightEdgeOccupied = occupied;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return rightEdgeOccupied;
}

/** Re-renders the caller when the search header's right-edge occupancy changes. */
export function useSearchHeaderRightEdgeOccupied(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
