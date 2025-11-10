import React from 'react';
import { styled } from '@tamagui/core';
import { XStack } from 'tamagui';
import { tokens } from '../theme/tokens';
import { LabelText } from './Typography';

interface TagPillProps {
  tag: string;
}

const PillContainer = styled(XStack, {
  backgroundColor: '$surface',
  borderWidth: 1,
  borderColor: '$border',
  paddingHorizontal: tokens.space.md,
  paddingVertical: tokens.space.sm,
  borderRadius: tokens.radius.full,
});

export function TagPill({ tag }: TagPillProps) {
  return (
    <PillContainer>
      <LabelText fontSize={tokens.fontSize.label} color="$textSecondary">
        {tag}
      </LabelText>
    </PillContainer>
  );
}
