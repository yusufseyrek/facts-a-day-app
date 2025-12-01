import React from 'react';
import { View, styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { BodyText } from './Typography';
import { tokens, useTheme } from '../theme';

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
  const { theme } = useTheme();
  const progress = (currentStep / totalSteps) * 100;

  return (
    <Container>
      <BodyText fontSize={tokens.fontSize.small} fontWeight={tokens.fontWeight.medium}>
        {currentStep} of {totalSteps}
      </BodyText>
      <ProgressBarContainer>
        <ProgressBarFill style={{ width: `${progress}%` }} />
      </ProgressBarContainer>
    </Container>
  );
}
