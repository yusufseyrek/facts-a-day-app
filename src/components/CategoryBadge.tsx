import React from 'react';
import { View as RNView } from 'react-native';
import { styled } from '@tamagui/core';
import { XStack } from 'tamagui';
import { tokens, useTheme, getCategoryNeonColor, getCategoryNeonColorName, createGlowStyle } from '../theme';
import { LabelText } from './Typography';
import { useTranslation, translateCategory } from '../i18n';
import type { Category } from '../services/database';

interface CategoryBadgeProps {
  category: string | Category;
}

const BadgeContainer = styled(XStack, {
  paddingHorizontal: tokens.space.md,
  paddingVertical: tokens.space.sm,
  borderRadius: tokens.radius.full,
  alignSelf: 'flex-start',
});

export function CategoryBadge({ category }: CategoryBadgeProps) {
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
  const neonColorName = getCategoryNeonColorName(categorySlug);

  // Subtle glow effect
  const glowStyle = createGlowStyle(neonColorName, 'subtle', theme);

  return (
    <RNView style={glowStyle}>
      <BadgeContainer style={{ backgroundColor: neonColor }}>
        <LabelText
          fontSize={12}
          color="#FFFFFF"
          fontWeight={tokens.fontWeight.semibold}
        >
          {displayName}
        </LabelText>
      </BadgeContainer>
    </RNView>
  );
}
