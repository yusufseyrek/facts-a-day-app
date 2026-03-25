import React from 'react';
import { View } from 'react-native';

import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { CompactFactCard } from './CompactFactCard';
import { FONT_FAMILIES, Text } from './Typography';

import type { FactWithRelations } from '../services/database';

interface RelatedFactsProps {
  facts: FactWithRelations[];
  onFactPress: (factId: number) => void;
  categoryColor: string | null;
  categoryName: string;
  containerWidth: number;
}

const RelatedFactsComponent = ({
  facts,
  onFactPress,
  categoryColor,
  categoryName,
  containerWidth,
}: RelatedFactsProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, borderWidths } = useResponsive();
  const colors = hexColors[theme];

  if (facts.length === 0) return null;

  const separatorColor = categoryColor
    ? `${categoryColor}33` // 20% opacity
    : colors.border;

  return (
    <View style={{ marginTop: spacing.md }}>
      {/* Separator */}
      <View
        style={{
          height: borderWidths.hairline,
          backgroundColor: separatorColor,
          marginBottom: spacing.xl,
        }}
      />

      {/* Section header */}
      <Text.Body
        color="$textSecondary"
        fontFamily={FONT_FAMILIES.bold}
        style={{ marginBottom: spacing.md }}
      >
        {t('relatedFacts', { category: categoryName })}
      </Text.Body>

      {/* Vertical card list */}
      <View style={{ gap: spacing.md }}>
        {facts.slice(0, 3).map((fact) => (
          <CompactFactCard
            key={fact.id}
            fact={fact}
            onPress={() => onFactPress(fact.id)}
            cardWidth={Math.round(containerWidth * 0.85)}
            titleLines={3}
          />
        ))}
      </View>
    </View>
  );
};

export const RelatedFacts = React.memo(RelatedFactsComponent);
