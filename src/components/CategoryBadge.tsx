import React from 'react';
import { styled } from '@tamagui/core';
import { XStack } from 'tamagui';
import { hexColors, spacing, radius, sizes, useTheme, getCategoryNeonColor } from '../theme';
import { Text, FONT_FAMILIES } from './Typography';
import { useTranslation, translateCategory } from '../i18n';
import { getContrastColor } from '../utils/colors';
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

const BadgeContainer = styled(XStack, {
  paddingHorizontal: spacing.phone.md,
  paddingVertical: spacing.phone.sm,
  borderRadius: radius.phone.full,
  alignSelf: 'flex-start',
});

export function CategoryBadge({ category, fontFamily, fontSize }: CategoryBadgeProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

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
    <BadgeContainer style={{ backgroundColor }}>
        <Text.Caption
          color={contrastColor}
          fontFamily={fontFamily || FONT_FAMILIES.semibold}
          fontSize={fontSize}
        >
          {displayName}
        </Text.Caption>
      </BadgeContainer>
  );
}
