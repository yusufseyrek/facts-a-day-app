import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FactModal } from '../../src/components/FactModal';
import type { FactWithRelations } from '../../src/services/database';
import * as database from '../../src/services/database';
import { BodyText } from '../../src/components';
import { tokens } from '../../src/theme/tokens';
import { useTranslation } from '../../src/i18n';
import { trackFactView, trackScreenView, Screens, type FactViewSource } from '../../src/services/analytics';

export default function FactDetailModal() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: FactViewSource }>();
  const router = useRouter();
  const { t } = useTranslation();
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
          backgroundColor: tokens.color.dark.background,
        }}
      >
        <ActivityIndicator size="large" color={tokens.color.light.primary} />
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
          padding: tokens.space.lg,
          backgroundColor: tokens.color.dark.background,
        }}
      >
        <BodyText color="$textSecondary">{error || t('factNotFound')}</BodyText>
      </View>
    );
  }

  return <FactModal fact={fact} onClose={handleClose} />;
}
