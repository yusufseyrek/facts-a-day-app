import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FactModal } from '../../src/components/FactModal';
import type { FactWithRelations } from '../../src/services/database';
import * as database from '../../src/services/database';
import { BodyText } from '../../src/components';
import { tokens } from '../../src/theme/tokens';

export default function FactDetailModal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [fact, setFact] = useState<FactWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFact();
  }, [id]);

  const loadFact = async () => {
    try {
      setLoading(true);
      setError(null);

      const factId = parseInt(id, 10);
      if (isNaN(factId)) {
        setError('Invalid fact ID');
        return;
      }

      const factData = await database.getFactById(factId);
      if (factData) {
        setFact(factData);
      } else {
        setError('Fact not found');
      }
    } catch (err) {
      console.error('Error loading fact:', err);
      setError('Failed to load fact');
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
        <BodyText color="$textSecondary">{error || 'Fact not found'}</BodyText>
      </View>
    );
  }

  return <FactModal fact={fact} onClose={handleClose} />;
}
