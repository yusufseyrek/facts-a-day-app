import React from 'react';
import { styled } from '@tamagui/core';
import { XStack } from 'tamagui';
import { tokens } from '../theme/tokens';
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

  // Determine if category is a Category object or a string
  let displayName: string;
  let backgroundColor: string;

  if (typeof category === 'string') {
    displayName = translateCategory(category, t);
    backgroundColor = '#0066FF'; // Default color
  } else {
    displayName = category.name;
    backgroundColor = category.color_hex || '#0066FF'; // Use category color or default
  }

  return (
    <BadgeContainer style={{ backgroundColor }}>
      <LabelText
        fontSize={12}
        color="#FFFFFF"
        fontWeight={tokens.fontWeight.semibold}
      >
        {displayName}
      </LabelText>
    </BadgeContainer>
  );
}
