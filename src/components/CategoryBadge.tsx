import React from 'react';

import { XStack } from 'tamagui';

import { translateCategory, useTranslation } from '../i18n';
import { getCategoryNeonColor, useTheme } from '../theme';
import { getContrastColor } from '../utils/colors';
import { useResponsive } from '../utils/useResponsive';

import { FONT_FAMILIES, Text } from './Typography';

import type { Category } from '../services/database';

interface CategoryBadgeProps {
  category: string | Category;
  /** Fact ID displayed as identifier in the badge */
  factId?: number;
  /**
   * Font family to use for the badge text.
   * Use FONT_FAMILIES constants (e.g., FONT_FAMILIES.semibold)
   */
  fontFamily?: string;
  fontSize?: number;
  /** Compact variant with reduced padding, suitable for inline use in cards */
  compact?: boolean;
}

export function CategoryBadge({ category, factId, fontFamily, fontSize, compact }: CategoryBadgeProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { spacing, radius } = useResponsive();

  // Determine if category is a Category object or a string
  let displayName: string;
  let categorySlug: string;
  let backgroundColor: string;

  if (typeof category === 'string') {
    displayName = translateCategory(category, t);
    categorySlug = category;
    // Use hardcoded color mapping for string categories
    backgroundColor = getCategoryNeonColor(categorySlug, theme);
  } else {
    displayName = category.name;
    categorySlug = category.slug || category.name.toLowerCase().replace(/\s+/g, '-');
    // Use color_hex from database if available, otherwise fall back to hardcoded mapping
    backgroundColor = category.color_hex || getCategoryNeonColor(categorySlug, theme);
  }

  const contrastColor = getContrastColor(backgroundColor);

  return (
    <XStack
      paddingHorizontal={compact ? spacing.sm : spacing.md}
      paddingVertical={compact ? 2 : spacing.xs}
      borderRadius={radius.full}
      alignSelf="flex-start"
      style={{ backgroundColor }}
    >
      <Text.Caption
        color={contrastColor}
        fontFamily={fontFamily || FONT_FAMILIES.semibold}
        fontSize={fontSize}
      >
        {factId != null ? `${displayName}#${factId}` : displayName}
      </Text.Caption>
    </XStack>
  );
}
