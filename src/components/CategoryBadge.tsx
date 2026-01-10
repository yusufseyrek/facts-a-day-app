import React from 'react';
import { XStack } from 'tamagui';

import { Text, FONT_FAMILIES } from './Typography';
import { useTranslation, translateCategory } from '../i18n';
import { hexColors, useTheme, getCategoryNeonColor } from '../theme';
import { getContrastColor } from '../utils/colors';
import { useResponsive } from '../utils/useResponsive';

import type { Category } from '../services/database';

interface CategoryBadgeProps {
  category: string | Category;
  /**
   * Font family to use for the badge text.
   * Use FONT_FAMILIES constants (e.g., FONT_FAMILIES.semibold)
   */
  fontFamily?: string;
  fontSize?: number;
}

export function CategoryBadge({ category, fontFamily, fontSize }: CategoryBadgeProps) {
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
      paddingHorizontal={spacing.md}
      paddingVertical={spacing.sm}
      borderRadius={radius.full}
      alignSelf="flex-start"
      style={{ backgroundColor }}
    >
      <Text.Caption
        color={contrastColor}
        fontFamily={fontFamily || FONT_FAMILIES.semibold}
        fontSize={fontSize}
      >
        {displayName}
      </Text.Caption>
    </XStack>
  );
}
