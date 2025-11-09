import React from 'react';
import { ActivityIndicator } from 'react-native';
import { styled, View } from '@tamagui/core';
import { XStack } from 'tamagui';
import { tokens } from '../theme/tokens';
import { LabelText } from './Typography';

interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
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

export function Button({ children, onPress, variant = 'primary', disabled = false, loading = false }: ButtonProps) {
  return (
    <ButtonContainer
      variant={variant}
      disabled={disabled || loading}
      onPress={disabled || loading ? undefined : onPress}
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
  );
}
