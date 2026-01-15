import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '../../src/components';
import { FactModal } from '../../src/components/FactModal';
import { useTranslation } from '../../src/i18n';
import { Screens, trackFactView, trackScreenView } from '../../src/services/analytics';
import * as api from '../../src/services/api';
import * as database from '../../src/services/database';
import { getLastConsumedFact } from '../../src/services/randomFact';
import { hexColors } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactViewSource } from '../../src/services/analytics';
import type { FactWithRelations } from '../../src/services/database';

export default function FactDetailModal() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: FactViewSource }>();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { spacing } = useResponsive();
  const [fact, setFact] = useState<FactWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasTrackedView, setHasTrackedView] = useState(false);

  useEffect(() => {
    loadFact();
    trackScreenView(Screens.FACT_DETAIL);
  }, [id]);

  const loadFact = async () => {
    try {
      setLoading(true);
      setError(null);

      const factId = parseInt(id, 10);
      if (isNaN(factId)) {
        setError(t('invalidFactId'));
        return;
      }

      // First check if this is a pre-loaded random fact (instant, no DB query needed)
      const preloadedFact = getLastConsumedFact(factId);
      if (preloadedFact) {
        setFact(preloadedFact);
        setLoading(false);

        // Track fact view
        if (!hasTrackedView) {
          setHasTrackedView(true);
          const categorySlug = preloadedFact.categoryData?.slug || preloadedFact.category || 'unknown';
          trackFactView({
            factId: preloadedFact.id,
            category: categorySlug,
            source: source || 'feed',
          });
        }
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

      // Track fact view (only once per modal open)
      if (!hasTrackedView) {
        setHasTrackedView(true);
        const categorySlug = factData.categoryData?.slug || factData.category || 'unknown';
        trackFactView({
          factId: factData.id,
          category: categorySlug,
          source: source || 'feed',
        });
      }
    } catch (err) {
      console.error('Error loading fact:', err);
      setError(t('failedToLoadFact'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    router.back();
  };

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

  return <FactModal fact={fact} onClose={handleClose} />;
}
