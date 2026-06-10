import React from 'react';

import { View } from '@tamagui/core';
import { XStack, YStack } from 'tamagui';

import { useResponsive } from '../utils';

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  rightElement?: React.ReactNode;
}

export function ProgressIndicator({
  currentStep,
  totalSteps,
  rightElement,
}: ProgressIndicatorProps) {
  const { spacing, radius, borderWidths } = useResponsive();

  return (
    <YStack gap={spacing.sm}>
      <XStack alignItems="center" gap={rightElement ? spacing.lg : 0}>
        {/* One pill per step, filled up to the current one */}
        <XStack
          flex={1}
          gap={spacing.xs}
          alignItems="center"
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
        >
          {Array.from({ length: totalSteps }).map((_, index) => (
            <View
              key={index}
              flex={1}
              height={borderWidths.extraHeavy}
              borderRadius={radius.full}
              backgroundColor={index < currentStep ? '$primary' : '$neutralLight'}
              opacity={index < currentStep ? 1 : 0.6}
            />
          ))}
        </XStack>
        {rightElement}
      </XStack>
    </YStack>
  );
}
