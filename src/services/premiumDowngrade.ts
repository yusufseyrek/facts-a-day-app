import { Alert } from 'react-native';

import { MINIMUM_CATEGORIES } from '../config/app';

import * as api from './api';
import { emitFeedRefresh, markFeedRefreshPending } from './contentRefresh';
import * as db from './database';
import * as onboardingService from './onboarding';

/**
 * Handle premium -> free downgrade:
 * 1. Get premium category slugs from local DB
 * 2. Re-fetch metadata without includePremium (free-tier only)
 * 3. Delete premium categories from local DB
 * 4. Remove premium slugs from user's selected categories
 * 5. Delete facts from premium categories (except favorites)
 * 6. Clean up orphaned questions
 * 7. Alert user if remaining selection < MINIMUM_CATEGORIES
 * 8. Emit feed refresh
 */
export async function handlePremiumDowngrade(locale: string): Promise<void> {
  try {
    // 1. Get premium category slugs BEFORE re-fetching metadata
    const premiumSlugs = await db.getPremiumCategorySlugs();
    if (premiumSlugs.length === 0) return;

    // 2. Re-fetch metadata without includePremium (free-tier only)
    const metadata = await api.getMetadata(locale);
    await db.insertCategories(metadata.categories);

    // 3. Delete premium categories from local DB
    await db.deletePremiumCategories();

    // 4. Remove premium slugs from user's selected categories
    const premiumSlugSet = new Set(premiumSlugs);
    const currentSelection = await onboardingService.getSelectedCategories();
    const filteredSelection = currentSelection.filter((s) => !premiumSlugSet.has(s));

    if (filteredSelection.length !== currentSelection.length) {
      await onboardingService.setSelectedCategories(filteredSelection);
    }

    // 5. Delete facts from premium categories (except favorites)
    await db.deleteFactsByCategorySlugs(premiumSlugs);

    // 6. Clean up orphaned questions
    const database = await db.openDatabase();
    await database.runAsync('DELETE FROM questions WHERE fact_id NOT IN (SELECT id FROM facts)');

    // 7. Clear feed cache so it rebuilds from updated DB state
    const { invalidateFeedMemoryCache } = await import('./dailyFeed');
    invalidateFeedMemoryCache();

    // 8. Alert user if remaining selection is below minimum
    if (filteredSelection.length < MINIMUM_CATEGORIES) {
      Alert.alert(
        'Categories Updated',
        `Your subscription has ended. Some premium categories were removed. Please select at least ${MINIMUM_CATEGORIES} categories.`
      );
    }

    // 9. Emit feed refresh
    emitFeedRefresh();
    markFeedRefreshPending();

    if (__DEV__) console.log(`Premium downgrade: removed ${premiumSlugs.length} premium categories`);
  } catch (error) {
    console.error('Premium downgrade cleanup failed:', error);
  }
}
