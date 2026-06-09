import { Alert } from 'react-native';

import { MINIMUM_CATEGORIES } from '../config/app';

import * as api from './api';
import { emitFeedRefresh, markFeedRefreshPending } from './contentRefresh';
import * as onboardingService from './onboarding';

/**
 * Remove any premium categories from a free user's selection. Facts are served
 * on demand from the API (no local mirror to clean up), so this just deselects
 * the premium categories and refreshes the feed. Silently no-ops if none are
 * selected.
 *
 * Returns true if any categories were deselected.
 */
export async function reconcilePremiumCategories(): Promise<boolean> {
  const metadata = await api.getMetadata();
  const premiumSlugs = metadata.categories.filter((c) => c.is_premium).map((c) => c.slug);
  if (premiumSlugs.length === 0) return false;

  const premiumSlugSet = new Set(premiumSlugs);
  const currentSelection = await onboardingService.getSelectedCategories();
  const filteredSelection = currentSelection.filter((s) => !premiumSlugSet.has(s));

  if (filteredSelection.length === currentSelection.length) return false;

  // Deselect premium categories
  await onboardingService.setSelectedCategories(filteredSelection);

  // The feed re-fetches from the API with the new selection.
  emitFeedRefresh();
  markFeedRefreshPending();

  if (__DEV__)
    console.log(
      `reconcilePremiumCategories: deselected ${currentSelection.length - filteredSelection.length} premium categories`
    );
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
