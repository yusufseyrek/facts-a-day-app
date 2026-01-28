import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '../../src/components';
import { FactModal } from '../../src/components/FactModal';
import { useTranslation } from '../../src/i18n';
import { Screens, trackFactView, trackScreenView } from '../../src/services/analytics';
import * as api from '../../src/services/api';
import * as database from '../../src/services/database';
import { prefetchFactImage } from '../../src/services/images';
import { getLastConsumedFact } from '../../src/services/randomFact';
import { hexColors } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactViewSource } from '../../src/services/analytics';
import type { FactWithRelations } from '../../src/services/database';

export default function FactDetailModal() {
  const { id, source, factIds: factIdsParam, currentIndex: currentIndexParam } =
    useLocalSearchParams<{
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

  // Pre-fetch images for the 3 nearest facts on each side of the current position
  useEffect(() => {
    if (!factIds) return;
    const start = Math.max(0, currentIndex - 3);
    const end = Math.min(factIds.length - 1, currentIndex + 3);
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
  }, [factIds, currentIndex]);

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

      // First check if this is a pre-loaded random fact (instant, no DB query needed)
      const preloadedFact = getLastConsumedFact(factId);
      if (preloadedFact) {
        setFact(preloadedFact);
        setLoading(false);
        trackView(preloadedFact);
        return;
      }

      // Fall back to local database
      let factData = await database.getFactById(factId);

      // If not found locally, fetch from API (for deep links to facts not yet synced)
      if (!factData) {
        try {
          const apiResponse = await api.getFactById(factId, locale, true);
          // Validate API response has required fields
          if (!apiResponse || !apiResponse.content) {
            setError(t('factNotFound'));
            return;
          }
          // Look up category from local DB (categories are already synced)
          const categoryData = apiResponse.category
            ? await database.getCategoryBySlug(apiResponse.category)
            : null;

          // Save fact to database for offline access
          const factToSave: database.Fact = {
            id: apiResponse.id,
            title: apiResponse.title,
            content: apiResponse.content,
            summary: apiResponse.summary,
            category: apiResponse.category,
            source_url: apiResponse.source_url,
            image_url: apiResponse.image_url,
            language: apiResponse.language,
            created_at: apiResponse.created_at,
            last_updated: apiResponse.updated_at,
          };
          await database.insertFacts([factToSave]);

          // Save questions to database if present
          if (apiResponse.questions && apiResponse.questions.length > 0) {
            const questionsToSave: database.Question[] = apiResponse.questions.map((q) => ({
              id: q.id,
              fact_id: apiResponse.id,
              question_type: q.question_type,
              question_text: q.question_text,
              correct_answer: q.correct_answer,
              wrong_answers: q.wrong_answers ? JSON.stringify(q.wrong_answers) : null,
              explanation: q.explanation,
              difficulty: q.difficulty,
            }));
            await database.insertQuestions(questionsToSave);
          }

          // Map API response to FactWithRelations
          factData = {
            ...apiResponse,
            last_updated: apiResponse.updated_at,
            categoryData,
          };
        } catch {
          // API also failed - fact doesn't exist
          setError(t('factNotFound'));
          return;
        }
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
      source: source || 'feed',
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
    />
  );
}
