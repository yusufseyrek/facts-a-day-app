import React from 'react';
import { View, styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { SmallText, FONT_FAMILIES } from './Typography';
import { tokens } from '../theme/tokens';

const Container = styled(YStack, {
  gap: tokens.space.sm,
});

const ProgressBarContainer = styled(View, {
  width: '100%',
  height: 6,
  backgroundColor: '$neutralLight',
  borderRadius: tokens.radius.full,
  overflow: 'hidden',
});

const ProgressBarFill = styled(View, {
  height: '100%',
  backgroundColor: '$primary',
  borderRadius: tokens.radius.full,
});

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <Container>
      <SmallText fontFamily={FONT_FAMILIES.medium}>
        {currentStep} of {totalSteps}
      </SmallText>
      <ProgressBarContainer>
        <ProgressBarFill style={{ width: `${progress}%` }} />
      </ProgressBarContainer>
    </Container>
  );
}
