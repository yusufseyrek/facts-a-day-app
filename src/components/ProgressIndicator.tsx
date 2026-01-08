import React from 'react';
import { View, styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { Text, FONT_FAMILIES } from './Typography';
import { hexColors, spacing, radius } from '../theme';
import { useResponsive } from '../utils';

const Container = styled(YStack, {
  gap: spacing.phone.sm,
});

const ProgressBarContainer = styled(View, {
  width: '100%',
  backgroundColor: '$neutralLight',
  borderRadius: radius.phone.full,
  overflow: 'hidden',
});

const ProgressBarFill = styled(View, {
  height: '100%',
  backgroundColor: '$primary',
  borderRadius: radius.phone.full,
});

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  const { borderWidths } = useResponsive();
  const progress = (currentStep / totalSteps) * 100;


  return (
    <Container>
      <Text.Caption fontFamily={FONT_FAMILIES.medium}>
        {currentStep} of {totalSteps}
      </Text.Caption>
      <ProgressBarContainer height={borderWidths.extraHeavy}>
        <ProgressBarFill style={{ width: `${progress}%` }} />
      </ProgressBarContainer>
    </Container>
  );
}
