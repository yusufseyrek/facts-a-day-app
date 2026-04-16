import { Alert } from 'react-native';

import { MINIMUM_CATEGORIES } from '../config/app';

import { emitFeedRefresh, markFeedRefreshPending } from './contentRefresh';
import * as db from './database';
import * as onboardingService from './onboarding';

/**
 * Remove any premium categories from a free user's selection and clean up
 * their facts/questions. Silently no-ops if no premium categories are selected.
 *
 * Called from:
 * - handlePremiumDowngrade() when a subscription expires
 * - contentRefresh after metadata sync (catches free→premium category changes)
 *
 * Returns true if any categories were deselected.
 */
export async function reconcilePremiumCategories(): Promise<boolean> {
  const premiumSlugs = await db.getPremiumCategorySlugs();
  if (premiumSlugs.length === 0) return false;

  const premiumSlugSet = new Set(premiumSlugs);
  const currentSelection = await onboardingService.getSelectedCategories();
  const filteredSelection = currentSelection.filter((s) => !premiumSlugSet.has(s));

  if (filteredSelection.length === currentSelection.length) return false;

  // Deselect premium categories
  await onboardingService.setSelectedCategories(filteredSelection);

  // Delete facts from premium categories (except favorites)
  await db.deleteFactsByCategorySlugs(premiumSlugs);

  // Clean up orphaned questions
  const database = await db.openDatabase();
  await database.runAsync('DELETE FROM questions WHERE fact_id NOT IN (SELECT id FROM facts)');

  // Clear feed cache so it rebuilds from updated DB state
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { invalidateFeedMemoryCache } = require('./dailyFeed') as typeof import('./dailyFeed');
  invalidateFeedMemoryCache();

  // Emit feed refresh
  emitFeedRefresh();
  markFeedRefreshPending();

  if (__DEV__) console.log(`reconcilePremiumCategories: deselected ${currentSelection.length - filteredSelection.length} premium categories`);
  return true;
}

/**
 * Handle premium -> free downgrade:
 * 1. Reconcile premium categories (deselect + cleanup)
 * 2. Alert user if remaining selection < MINIMUM_CATEGORIES
 *
 * Note: Premium categories remain in the local DB so they can be shown
 * as locked in the category picker (conversion opportunity).
 */
export async function handlePremiumDowngrade(_locale: string): Promise<void> {
  try {
    const changed = await reconcilePremiumCategories();

    if (changed) {
      const currentSelection = await onboardingService.getSelectedCategories();
      if (currentSelection.length < MINIMUM_CATEGORIES) {
        Alert.alert(
          'Categories Updated',
          `Your subscription has ended. Some premium categories were removed. Please select at least ${MINIMUM_CATEGORIES} categories.`
        );
      }
    }
  } catch (error) {
    console.error('Premium downgrade cleanup failed:', error);
  }
}
