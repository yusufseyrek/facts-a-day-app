import React from 'react';
import { Pressable, View as RNView } from 'react-native';
import { styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { tokens, useTheme } from '../theme';

interface FloatingActionButtonProps {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
  position?: 'bottom-right' | 'bottom-left';
}

const FABContainer = styled(YStack, {
  width: 56,
  height: 56,
  borderRadius: tokens.radius.full,
  backgroundColor: '$primary',
  alignItems: 'center',
  justifyContent: 'center',
});

export function FloatingActionButton({
  icon: Icon,
  onPress,
  position = 'bottom-right',
}: FloatingActionButtonProps) {
  const { theme } = useTheme();

  const positionStyle =
    position === 'bottom-right'
      ? {
          position: 'absolute' as const,
          bottom: tokens.space.xl,
          right: tokens.space.xl,
          zIndex: 1000,
        }
      : {
          position: 'absolute' as const,
          bottom: tokens.space.xl,
          left: tokens.space.xl,
          zIndex: 1000,
        };

  return (
    <Pressable onPress={onPress} style={positionStyle}>
      <FABContainer>
        <Icon size={24} color="#FFFFFF" />
      </FABContainer>
    </Pressable>
  );
}
