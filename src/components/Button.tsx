import React from 'react';
import { styled, View } from '@tamagui/core';
import { tokens } from '../theme/tokens';
import { LabelText } from './Typography';

interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
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

export function Button({ children, onPress, variant = 'primary', disabled = false }: ButtonProps) {
  return (
    <ButtonContainer
      variant={variant}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      pressStyle={disabled ? {} : { opacity: 0.8 }}
    >
      <LabelText color="#FFFFFF" fontWeight={tokens.fontWeight.semibold} fontSize={16}>
        {children}
      </LabelText>
    </ButtonContainer>
  );
}
