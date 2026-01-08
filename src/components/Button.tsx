import React from 'react';
import { ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { styled, View } from '@tamagui/core';
import { XStack } from 'tamagui';
import { hexColors, spacing, radius, componentSizes, useTheme } from '../theme';
import { Text, FONT_FAMILIES } from './Typography';

interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}

const ButtonContainer = styled(View, {
  height: componentSizes.phone.buttonHeight,
  borderRadius: radius.phone.full,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: spacing.phone.xl,
  width: '100%',

  variants: {
    variant: {
      primary: {
        backgroundColor: '$primary',
      },
      secondary: {
        backgroundColor: '$neutral',
      },
    },
    disabled: {
      true: {
        opacity: 0.4,
      },
      false: {
        opacity: 1,
      },
    },
  } as const,

  defaultVariants: {
    variant: 'primary',
    disabled: false,
  },
});

export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const { theme } = useTheme();

  const handlePress = () => {
    if (!disabled && !loading && onPress) {
      // Provide haptic feedback on button press
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  return (
    <ButtonContainer
        variant={variant}
        disabled={disabled || loading}
        onPress={handlePress}
        pressStyle={disabled || loading ? {} : { opacity: 0.8 }}
      >
        {loading ? (
          <XStack gap={spacing.phone.sm} alignItems="center">
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text.Label color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
              {children}
            </Text.Label>
          </XStack>
        ) : (
          <Text.Label color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
            {children}
          </Text.Label>
        )}
      </ButtonContainer>
  );
}
