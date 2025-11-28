import React from 'react';
import { ActivityIndicator, Platform, View as RNView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { styled, View } from '@tamagui/core';
import { XStack } from 'tamagui';
import { tokens, useTheme, createGlowStyle } from '../theme';
import { LabelText } from './Typography';

interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  /** Disable glow effect */
  noGlow?: boolean;
}

const ButtonContainer = styled(View, {
  height: tokens.size.buttonHeight,
  borderRadius: tokens.radius.full,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: tokens.space.xl,
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
  noGlow = false,
}: ButtonProps) {
  const { theme } = useTheme();

  const handlePress = () => {
    if (!disabled && !loading && onPress) {
      // Provide haptic feedback on button press
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  // Get glow style for primary button
  const showGlow = variant === 'primary' && !disabled && !loading && !noGlow;
  const glowStyle = showGlow
    ? createGlowStyle('cyan', 'medium', theme)
    : {};

  return (
    <RNView style={showGlow ? glowStyle : undefined}>
      <ButtonContainer
        variant={variant}
        disabled={disabled || loading}
        onPress={handlePress}
        pressStyle={disabled || loading ? {} : { opacity: 0.8 }}
      >
        {loading ? (
          <XStack gap="$sm" alignItems="center">
            <ActivityIndicator size="small" color="#FFFFFF" />
            <LabelText color="#FFFFFF" fontWeight={tokens.fontWeight.semibold} fontSize={16}>
              {children}
            </LabelText>
          </XStack>
        ) : (
          <LabelText color="#FFFFFF" fontWeight={tokens.fontWeight.semibold} fontSize={16}>
            {children}
          </LabelText>
        )}
      </ButtonContainer>
    </RNView>
  );
}
