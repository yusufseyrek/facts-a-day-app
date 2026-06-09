import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '../../src/components';
import { FactModal } from '../../src/components/FactModal';
import { useTranslation } from '../../src/i18n';
import { Screens, trackFactView, trackScreenView } from '../../src/services/analytics';
import * as api from '../../src/services/api';
import * as database from '../../src/services/database';
import { hexColors } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactViewSource } from '../../src/services/analytics';
import type { FactWithRelations } from '../../src/services/database';

export default function FactDetailModal() {
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
  const [fact, setFact] = useState<FactWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trackedFactIds = useRef(new Set<number>());

  // Determine the current fact ID — either from navigation state or the route param
  const currentFactId = useMemo(() => {
    if (factIds && currentIndex >= 0 && currentIndex < factIds.length) {
      return factIds[currentIndex];
    }
    return parseInt(id, 10);
  }, [factIds, currentIndex, id]);

  const hasNext = factIds !== null && currentIndex < factIds.length - 1;
  const hasPrevious = factIds !== null && currentIndex > 0;
  const totalCount = factIds ? factIds.length : undefined;

  useEffect(() => {
    trackScreenView(Screens.FACT_DETAIL);
  }, []);

  const isInitialLoad = useRef(true);
  useEffect(() => {
    const isNavigation = !isInitialLoad.current;
    isInitialLoad.current = false;
    loadFact(currentFactId, isNavigation);
  }, [currentFactId]);

  const loadFact = async (factId: number, isNavigation = false) => {
    try {
      // Only show full loading screen on initial load, not when navigating
      if (!isNavigation) {
        setLoading(true);
      }
      setError(null);

      if (isNaN(factId)) {
        setError(t('invalidFactId'));
        return;
      }

      // Facts are served on demand from the API (no local mirror). The feed and
      // by-ids endpoints return category attribution inline, so mapping is a
      // pure transform — no local category lookup needed.
      let factData: FactWithRelations;
      try {
        const apiResponse = await api.getFactById(factId, locale, true);
        if (!apiResponse || !apiResponse.content) {
          setError(t('factNotFound'));
          return;
        }
        factData = database.mapApiFactToRelations(apiResponse);
      } catch {
        setError(t('factNotFound'));
        return;
      }

      setFact(factData);
      trackView(factData);
    } catch (err) {
      console.error('Error loading fact:', err);
      setError(t('failedToLoadFact'));
    } finally {
      setLoading(false);
    }
  };

  const trackView = (factData: FactWithRelations) => {
    if (trackedFactIds.current.has(factData.id)) return;
    trackedFactIds.current.add(factData.id);
    const categorySlug = factData.categoryData?.slug || factData.category || 'unknown';
    trackFactView({
      factId: factData.id,
      category: categorySlug,
      source: source || 'home_latest',
    });
  };

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleNext = useCallback(() => {
    if (!factIds || currentIndex >= factIds.length - 1) return;
    setCurrentIndex(currentIndex + 1);
  }, [factIds, currentIndex]);

  const handlePrevious = useCallback(() => {
    if (!factIds || currentIndex <= 0) return;
    setCurrentIndex(currentIndex - 1);
  }, [factIds, currentIndex]);

  const handleRelatedFactPress = useCallback((factId: number) => {
    loadFact(factId, true);
  }, []);

  if (loading) {
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
      </View>
    );
  }

  if (error || !fact) {
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
        <Text.Body color="$textSecondary">{error || t('factNotFound')}</Text.Body>
      </View>
    );
  }

  return (
    <FactModal
      fact={fact}
      onClose={handleClose}
      onNext={factIds ? handleNext : undefined}
      onPrevious={factIds ? handlePrevious : undefined}
      hasNext={hasNext}
      hasPrevious={hasPrevious}
      currentIndex={factIds ? currentIndex : undefined}
      totalCount={totalCount}
      source={source}
      onRelatedFactPress={handleRelatedFactPress}
    />
  );
}
