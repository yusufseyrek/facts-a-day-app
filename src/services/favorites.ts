import { trackFactFavoriteAdd, trackFactFavoriteRemove } from './analytics';
import { checkAndAwardBadges } from './badges';
import * as database from './database';
import { downloadImage } from './images';

/**
 * Toggle favorite status for a fact and handle all side effects:
 * analytics tracking, badge checking, and offline image caching.
 *
 * UI concerns (haptics, animations, error alerts) are left to the caller.
 */
export async function performFavoriteToggle(
  factId: number,
  categorySlug: string,
  imageUrl?: string
): Promise<boolean> {
  const newStatus = await database.toggleFavorite(factId);

  if (newStatus) {
    trackFactFavoriteAdd({ factId, category: categorySlug });
    checkAndAwardBadges().catch(() => {});
    if (imageUrl) {
      downloadImage(imageUrl, factId).catch(() => {});
    }
  } else {
    trackFactFavoriteRemove({ factId, category: categorySlug });
  }

  return newStatus;
}
