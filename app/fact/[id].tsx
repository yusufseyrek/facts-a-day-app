import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '../../src/components';
import { FactModal } from '../../src/components/FactModal';
import { useTranslation } from '../../src/i18n';
import { Screens,trackFactView, trackScreenView } from '../../src/services/analytics';
import * as database from '../../src/services/database';
import { hexColors } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactViewSource } from '../../src/services/analytics';
import type { FactWithRelations } from '../../src/services/database';

export default function FactDetailModal() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: FactViewSource }>();
  const router = useRouter();
  const { t } = useTranslation();
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

      const factData = await database.getFactById(factId);
      if (factData) {
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
      } else {
        setError(t('factNotFound'));
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
