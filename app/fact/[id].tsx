import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { CloseButton, Text } from '../../src/components';
import { FactModal } from '../../src/components/FactModal';
import { useFactMorph } from '../../src/components/factMorph/FactMorphContext';
import { useFactDetail, usePrefetchFactDetails } from '../../src/hooks/useFactDetail';
import { useTranslation } from '../../src/i18n';
import { Screens, trackFactView, trackScreenView } from '../../src/services/analytics';
import * as database from '../../src/services/database';
import { hexColors } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactViewSource } from '../../src/services/analytics';

/**
 * The fact detail screen. Backs two routes that differ ONLY in how the native
 * stack presents them (see app/_layout.tsx):
 *  - fact/[id]        → presentation:'card'  (horizontal swipe-back)
 *  - fact/modal/[id]  → presentation:'modal' (renders correctly over the story
 *                       fullScreenModal, where a card would land behind it)
 * `presentedAsModal` is forwarded to FactModal so the iOS header top padding
 * matches the presentation.
 */
export default function FactDetailScreen({
  presentedAsModal = false,
}: {
  presentedAsModal?: boolean;
}) {
  const {
    id,
    source,
    factIds: factIdsParam,
    currentIndex: currentIndexParam,
  } = useLocalSearchParams<{
    id: string;
    source?: FactViewSource;
    factIds?: string;
    currentIndex?: string;
  }>();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { spacing } = useResponsive();
  const insets = useSafeAreaInsets();
  // Non-null when hosted by the morph route — closing must play the reverse
  // morph instead of popping instantly.
  const morph = useFactMorph();

  // Parse fact ID list for navigation
  const factIds = useMemo(() => {
    if (!factIdsParam) return null;
    try {
      const parsed = JSON.parse(factIdsParam);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }, [factIdsParam]);

  const initialIndex = currentIndexParam ? parseInt(currentIndexParam, 10) : 0;
  const [currentIndex, setCurrentIndex] = useState(isNaN(initialIndex) ? 0 : initialIndex);
  // When a related fact is tapped we display that id instead of the route/list id.
  const [overrideFactId, setOverrideFactId] = useState<number | null>(null);
  const trackedFactIds = useRef(new Set<number>());

  // Resolve the fact id to show: a tapped related fact wins; otherwise the
  // current list index; otherwise the route param.
  const currentFactId = useMemo(() => {
    if (overrideFactId !== null) return overrideFactId;
    if (factIds && currentIndex >= 0 && currentIndex < factIds.length) {
      return factIds[currentIndex];
    }
    return parseInt(id, 10);
  }, [overrideFactId, factIds, currentIndex, id]);

  const hasNext = overrideFactId === null && factIds !== null && currentIndex < factIds.length - 1;
  const hasPrevious = overrideFactId === null && factIds !== null && currentIndex > 0;
  const totalCount = factIds ? factIds.length : undefined;

  // Data: instant from cache (initialData), refetched in the background for
  // questions. No more blocking fetch behind a full-screen spinner on a warm tap.
  const { data: apiFact, isLoading, isError } = useFactDetail(currentFactId, locale);

  const fact = useMemo(() => (apiFact ? database.mapApiFactToRelations(apiFact) : null), [apiFact]);

  // Warm the cache for the adjacent facts so swiping prev/next is instant —
  // some list surfaces (Discover category browse) keep facts in local state, so
  // without this the next fact isn't cached and triggers a blocking fetch.
  const prefetchFactDetails = usePrefetchFactDetails(locale);
  useEffect(() => {
    if (!factIds || overrideFactId !== null) return;
    const neighbors: number[] = [];
    if (currentIndex + 1 < factIds.length) neighbors.push(factIds[currentIndex + 1]);
    if (currentIndex - 1 >= 0) neighbors.push(factIds[currentIndex - 1]);
    if (neighbors.length > 0) prefetchFactDetails(neighbors);
  }, [factIds, currentIndex, overrideFactId, prefetchFactDetails]);

  useEffect(() => {
    trackScreenView(Screens.FACT_DETAIL);
  }, []);

  // Track a view once per fact, when its data is available.
  useEffect(() => {
    if (!fact) return;
    if (trackedFactIds.current.has(fact.id)) return;
    trackedFactIds.current.add(fact.id);
    const categorySlug = fact.categoryData?.slug || fact.category || 'unknown';
    trackFactView({
      factId: fact.id,
      category: categorySlug,
      source: source || 'home_latest',
    });
  }, [fact, source]);

  const handleClose = useCallback(() => {
    if (morph) {
      morph.close();
      return;
    }
    router.back();
  }, [router, morph]);

  // The loading/error early returns need their own close affordance: under the
  // morph presentation there is no native dismiss gesture, and even as a card
  // an explicit X beats relying on the swipe-back.
  const earlyCloseButton = (
    <CloseButton
      onPress={handleClose}
      style={{ position: 'absolute', top: Math.max(insets.top, spacing.xl), right: spacing.xl }}
    />
  );

  const handleNext = useCallback(() => {
    if (!factIds || currentIndex >= factIds.length - 1) return;
    setOverrideFactId(null);
    setCurrentIndex((i) => i + 1);
  }, [factIds, currentIndex]);

  const handlePrevious = useCallback(() => {
    if (!factIds || currentIndex <= 0) return;
    setOverrideFactId(null);
    setCurrentIndex((i) => i - 1);
  }, [factIds, currentIndex]);

  const handleRelatedFactPress = useCallback((factId: number) => {
    setOverrideFactId(factId);
  }, []);

  // Only show the spinner when we have NOTHING to render yet (cold tap with no
  // cached fact). A warm tap has initialData, so this is skipped entirely.
  if (isLoading && !fact) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: hexColors.dark.background,
        }}
      >
        <ActivityIndicator size="large" color={hexColors.light.primary} />
        {earlyCloseButton}
      </View>
    );
  }

  if ((isError && !fact) || !fact) {
    const invalid = !Number.isFinite(currentFactId) || currentFactId <= 0;
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.lg,
          backgroundColor: hexColors.dark.background,
        }}
      >
        <Text.Body color="$textSecondary">
          {invalid ? t('invalidFactId') : t('factNotFound')}
        </Text.Body>
        {earlyCloseButton}
      </View>
    );
  }

  return (
    <FactModal
      fact={fact}
      onClose={handleClose}
      onNext={factIds && overrideFactId === null ? handleNext : undefined}
      onPrevious={factIds && overrideFactId === null ? handlePrevious : undefined}
      hasNext={hasNext}
      hasPrevious={hasPrevious}
      currentIndex={factIds && overrideFactId === null ? currentIndex : undefined}
      totalCount={overrideFactId === null ? totalCount : undefined}
      source={source}
      onRelatedFactPress={handleRelatedFactPress}
      presentedAsModal={presentedAsModal}
    />
  );
}
