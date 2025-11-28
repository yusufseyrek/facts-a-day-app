import React from 'react';
import { View, styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { BodyText } from './Typography';
import { tokens, useTheme, createGlowStyle } from '../theme';

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

  // Subtle glow on the progress bar
  const glowStyle = createGlowStyle('cyan', 'subtle', theme);

  return (
    <Container>
      <BodyText fontSize={tokens.fontSize.small} fontWeight={tokens.fontWeight.medium}>
        {currentStep} of {totalSteps}
      </BodyText>
      <ProgressBarContainer style={glowStyle}>
        <ProgressBarFill style={{ width: `${progress}%` }} />
      </ProgressBarContainer>
    </Container>
  );
}
