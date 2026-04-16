import React from 'react';
import { View } from 'react-native';

import { XStack, YStack } from 'tamagui';

import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

import type { CategoryStat } from '../../services/stats';

interface CategoryBreakdownProps {
  categories: CategoryStat[];
}

export const CategoryBreakdown = React.memo(function CategoryBreakdown({
  categories,
}: CategoryBreakdownProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius } = useResponsive();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

  if (categories.length === 0) return null;

  const maxCount = Math.max(1, ...categories.map((c) => c.count));
  const barHeight = spacing.sm;
  const trackColor = isDark ? hexColors.dark.border : hexColors.light.border;

  return (
    <YStack gap={spacing.sm}>
      <YStack gap={spacing.xs}>
        <Text.Title color={textColor}>{t('statsTopCategories')}</Text.Title>
        <Text.Caption color={secondaryColor}>{t('statsTopCategoriesSubtitle')}</Text.Caption>
      </YStack>
      <YStack
        backgroundColor={colors.cardBackground}
        borderRadius={radius.lg}
        padding={spacing.lg}
        gap={spacing.md}
      >
        {categories.map((c) => {
          const pct = Math.round((c.count / maxCount) * 100);
          const fill = c.colorHex || colors.primary;
          return (
            <YStack key={c.slug} gap={spacing.xs}>
              <XStack alignItems="center" justifyContent="space-between">
                <Text.Label
                  color={textColor}
                  fontFamily={FONT_FAMILIES.medium}
                  flex={1}
                  numberOfLines={1}
                >
                  {c.name}
                </Text.Label>
                <Text.Caption color={secondaryColor} fontFamily={FONT_FAMILIES.semibold}>
                  {c.count}
                </Text.Caption>
              </XStack>
              <View
                style={{
                  width: '100%',
                  height: barHeight,
                  backgroundColor: trackColor,
                  borderRadius: barHeight / 2,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    backgroundColor: fill,
                    borderRadius: barHeight / 2,
                  }}
                />
              </View>
            </YStack>
          );
        })}
      </YStack>
    </YStack>
  );
});
