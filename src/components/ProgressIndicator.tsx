import React from 'react';
import { View, styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { Text, FONT_FAMILIES } from './Typography';
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
      <Text.Caption fontFamily={FONT_FAMILIES.medium}>
        {currentStep} of {totalSteps}
      </Text.Caption>
      <ProgressBarContainer>
        <ProgressBarFill style={{ width: `${progress}%` }} />
      </ProgressBarContainer>
    </Container>
  );
}
