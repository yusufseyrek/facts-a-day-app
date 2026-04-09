import { Alert } from 'react-native';

import { MINIMUM_CATEGORIES } from '../config/app';

import { emitFeedRefresh, markFeedRefreshPending } from './contentRefresh';
import * as db from './database';
import * as onboardingService from './onboarding';

/**
 * Handle premium -> free downgrade:
 * 1. Get premium category slugs from local DB
 * 2. Remove premium slugs from user's selected categories
 * 3. Delete facts from premium categories (except favorites)
 * 4. Clean up orphaned questions
 * 5. Alert user if remaining selection < MINIMUM_CATEGORIES
 * 6. Emit feed refresh
 *
 * Note: Premium categories remain in the local DB so they can be shown
 * as locked in the category picker (conversion opportunity).
 */
export async function handlePremiumDowngrade(_locale: string): Promise<void> {
  try {
    const premiumSlugs = await db.getPremiumCategorySlugs();
    if (premiumSlugs.length === 0) return;

    // Deselect any premium categories from user's selection
    const premiumSlugSet = new Set(premiumSlugs);
    const currentSelection = await onboardingService.getSelectedCategories();
    const filteredSelection = currentSelection.filter((s) => !premiumSlugSet.has(s));

    if (filteredSelection.length !== currentSelection.length) {
      await onboardingService.setSelectedCategories(filteredSelection);
    }

    // Delete facts from premium categories (except favorites)
    await db.deleteFactsByCategorySlugs(premiumSlugs);

    // Clean up orphaned questions
    const database = await db.openDatabase();
    await database.runAsync('DELETE FROM questions WHERE fact_id NOT IN (SELECT id FROM facts)');

    // Clear feed cache so it rebuilds from updated DB state
    const { invalidateFeedMemoryCache } = await import('./dailyFeed');
    invalidateFeedMemoryCache();

    // Alert user if remaining selection is below minimum
    if (filteredSelection.length < MINIMUM_CATEGORIES) {
      Alert.alert(
        'Categories Updated',
        `Your subscription has ended. Some premium categories were removed. Please select at least ${MINIMUM_CATEGORIES} categories.`
      );
    }

    // Emit feed refresh
    emitFeedRefresh();
    markFeedRefreshPending();

    if (__DEV__) console.log(`Premium downgrade: deselected ${premiumSlugs.length} premium categories`);
  } catch (error) {
    console.error('Premium downgrade cleanup failed:', error);
  }
}
