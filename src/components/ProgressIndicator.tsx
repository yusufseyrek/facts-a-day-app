import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { XStack } from 'tamagui';

import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils';

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

/** One step pill: a muted track whose fill animates in/out as steps change. */
function ProgressPill({ filled }: { filled: boolean }) {
  const { theme } = useTheme();
  const { radius, borderWidths } = useResponsive();
  const fill = useRef(new Animated.Value(filled ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: filled ? 1 : 0,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animates width
    }).start();
  }, [filled, fill]);

  return (
    <View
      style={{
        flex: 1,
        height: borderWidths.extraHeavy,
        borderRadius: radius.full,
        backgroundColor: hexColors[theme].neutralLight,
        opacity: filled ? 1 : 0.6,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={{
          height: '100%',
          borderRadius: radius.full,
          backgroundColor: hexColors[theme].primary,
          width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

export function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  const { spacing } = useResponsive();

  return (
    <XStack
      gap={spacing.xs}
      alignItems="center"
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
    >
      {Array.from({ length: totalSteps }).map((_, index) => (
        <ProgressPill key={index} filled={index < currentStep} />
      ))}
    </XStack>
  );
}
