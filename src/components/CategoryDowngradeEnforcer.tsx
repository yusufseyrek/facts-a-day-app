import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { useRouter, useSegments } from 'expo-router';

import { CATEGORY_LIMITS } from '../config/app';
import { usePremium } from '../contexts';
import { useTranslation } from '../i18n';
import * as onboardingService from '../services/onboarding';
import * as preferencesService from '../services/preferences';

/**
 * Invisible component that enforces the free-tier category limit when a user
 * is downgraded from premium. Shows an alert giving the user the choice to
 * pick which categories to keep or let the app auto-trim.
 *
 * Re-shows the alert whenever the user navigates back without fixing the issue.
 */
export function CategoryDowngradeEnforcer() {
  const { isPremium, isLoading } = usePremium();
  const router = useRouter();
  const segments = useSegments();
  const { t, locale } = useTranslation();
  const prevPremiumRef = useRef<boolean | null>(null);
  const needsEnforcementRef = useRef(false);
  const alertVisibleRef = useRef(false);

  const enforce = async () => {
    if (alertVisibleRef.current) return;

    const categories = await onboardingService.getSelectedCategories();
    if (categories.length <= CATEGORY_LIMITS.FREE.max) {
      needsEnforcementRef.current = false;
      return;
    }

    needsEnforcementRef.current = true;
    alertVisibleRef.current = true;

    Alert.alert(
      t('downgradeTitle'),
      t('downgradeMessage', { max: CATEGORY_LIMITS.FREE.max }),
      [
        {
          text: t('downgradeChooseCategories'),
          onPress: () => {
            alertVisibleRef.current = false;
            router.push('/settings/categories');
          },
        },
        {
          text: t('downgradeAutoAdjust'),
          style: 'destructive',
          onPress: async () => {
            const trimmed = categories.slice(0, CATEGORY_LIMITS.FREE.max);
            await onboardingService.setSelectedCategories(trimmed);
            await preferencesService.handleCategoriesChange(trimmed, locale);
            needsEnforcementRef.current = false;
            alertVisibleRef.current = false;
          },
        },
      ],
      { cancelable: false }
    );
  };

  // Trigger on premium status change
  useEffect(() => {
    if (isLoading) return;

    const wasPremium = prevPremiumRef.current;
    prevPremiumRef.current = isPremium;

    if (!isPremium && (wasPremium === true || wasPremium === null)) {
      enforce();
    }
  }, [isPremium, isLoading]);

  // Re-check when user navigates back from categories screen without saving
  const onCategoriesScreen = segments.join('/').includes('settings/categories');
  const wasOnCategoriesRef = useRef(false);

  useEffect(() => {
    const wasOnCategories = wasOnCategoriesRef.current;
    wasOnCategoriesRef.current = onCategoriesScreen;

    // Only re-enforce when leaving the categories screen (was on it, now isn't)
    if (wasOnCategories && !onCategoriesScreen && needsEnforcementRef.current && !isPremium) {
      enforce();
    }
  }, [onCategoriesScreen]);

  return null;
}
