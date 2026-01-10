import React from 'react';

import { View } from '@tamagui/core';
import { YStack } from 'tamagui';

import { useResponsive } from '../utils';

import { FONT_FAMILIES,Text } from './Typography';

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  const { spacing, radius, borderWidths } = useResponsive();
  const progress = (currentStep / totalSteps) * 100;

  return (
    <YStack gap={spacing.sm}>
      <Text.Caption fontFamily={FONT_FAMILIES.medium}>
        {currentStep} of {totalSteps}
      </Text.Caption>
      <View
        width="100%"
        backgroundColor="$neutralLight"
        borderRadius={radius.full}
        overflow="hidden"
        height={borderWidths.extraHeavy}
      >
        <View
          height="100%"
          backgroundColor="$primary"
          borderRadius={radius.full}
          style={{ width: `${progress}%` }}
        />
      </View>
    </YStack>
  );
}
