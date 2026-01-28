import * as database from '../services/database';
import { prefetchFactImage } from '../services/images';

interface PrefetchableItem {
  image_url?: string | null;
  id: number;
}

/**
 * Prefetch images for items adjacent to the current index.
 * Works with any ordered list of items that have image_url and id.
 *
 * @param items - Array of items with image_url and id
 * @param currentIndex - Current position in the array
 * @param radius - How many items on each side to prefetch (default: 3)
 */
export function prefetchAdjacentImages(
  items: PrefetchableItem[],
  currentIndex: number,
  radius: number = 3
): void {
  if (items.length === 0) return;

  const start = Math.max(0, currentIndex - radius);
  const end = Math.min(items.length - 1, currentIndex + radius);

  for (let i = start; i <= end; i++) {
    if (i === currentIndex) continue;
    const item = items[i];
    if (item?.image_url) {
      prefetchFactImage(item.image_url, item.id);
    }
  }
}

/**
 * Prefetch images for facts adjacent to the current index, given only an array of fact IDs.
 * Fetches each fact from the database to get its image_url before prefetching.
 *
 * @param factIds - Array of fact IDs in display order
 * @param currentIndex - Current position in the array
 * @param radius - How many items on each side to prefetch (default: 3)
 */
export function prefetchAdjacentFactsByIds(
  factIds: number[],
  currentIndex: number,
  radius: number = 3
): void {
  if (factIds.length === 0) return;

  const start = Math.max(0, currentIndex - radius);
  const end = Math.min(factIds.length - 1, currentIndex + radius);
  const idsToFetch: number[] = [];

  for (let i = start; i <= end; i++) {
    if (i !== currentIndex) idsToFetch.push(factIds[i]);
  }

  if (idsToFetch.length === 0) return;

  Promise.all(
    idsToFetch.map((factId) =>
      database.getFactById(factId).then((f) => {
        if (f?.image_url) {
          prefetchFactImage(f.image_url, f.id);
        }
      })
    )
  ).catch(() => {
    // Silently ignore prefetch errors
  });
}
