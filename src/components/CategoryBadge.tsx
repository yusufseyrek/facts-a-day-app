import React from 'react';
import { styled } from '@tamagui/core';
import { XStack } from 'tamagui';
import { tokens, useTheme, getCategoryNeonColor } from '../theme';
import { LabelText } from './Typography';
import { useTranslation, translateCategory } from '../i18n';
import { getContrastColor } from '../utils/colors';
import type { Category } from '../services/database';

interface CategoryBadgeProps {
  category: string | Category;
  fontWeight?: string;
  fontSize?: number;
}

const BadgeContainer = styled(XStack, {
  paddingHorizontal: tokens.space.md,
  paddingVertical: tokens.space.sm,
  borderRadius: tokens.radius.full,
  alignSelf: 'flex-start',
});

export function CategoryBadge({ category, fontWeight, fontSize }: CategoryBadgeProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  // Determine if category is a Category object or a string
  let displayName: string;
  let categorySlug: string;

  if (typeof category === 'string') {
    displayName = translateCategory(category, t);
    categorySlug = category;
  } else {
    displayName = category.name;
    categorySlug = category.slug || category.name.toLowerCase().replace(/\s+/g, '-');
  }

  // Get neon color for this category
  const neonColor = getCategoryNeonColor(categorySlug, theme);
  const contrastColor = getContrastColor(neonColor);

  return (
    <BadgeContainer style={{ backgroundColor: neonColor }}>
        <LabelText
          fontSize={fontSize || 12}
          color={contrastColor}
          fontWeight={fontWeight || tokens.fontWeight.semibold}
        >
          {displayName}
        </LabelText>
      </BadgeContainer>
  );
}
