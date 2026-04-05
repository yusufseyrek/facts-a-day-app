import React from 'react';

import { View } from '@tamagui/core';
import { XStack, YStack } from 'tamagui';

import { useResponsive } from '../utils';

import { FONT_FAMILIES, Text } from './Typography';

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  rightElement?: React.ReactNode;
}

export function ProgressIndicator({ currentStep, totalSteps, rightElement }: ProgressIndicatorProps) {
  const { spacing, radius, borderWidths } = useResponsive();
  const progress = (currentStep / totalSteps) * 100;

  return (
    <YStack gap={spacing.sm}>
      <XStack justifyContent="space-between" alignItems="center">
        <Text.Caption fontFamily={FONT_FAMILIES.medium}>
          {currentStep} of {totalSteps}
        </Text.Caption>
        {rightElement}
      </XStack>
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
