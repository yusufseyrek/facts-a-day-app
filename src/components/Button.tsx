import React from 'react';
import { ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { View } from '@tamagui/core';
import { XStack } from 'tamagui';

import { Text, FONT_FAMILIES } from './Typography';
import { useResponsive } from '../utils';

interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const { media, spacing, radius } = useResponsive();

  const handlePress = () => {
    if (!disabled && !loading && onPress) {
      // Provide haptic feedback on button press
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  return (
    <View
      borderRadius={radius.full}
      alignItems="center"
      justifyContent="center"
      width="100%"
      paddingHorizontal={spacing.xl}
      height={media.buttonHeight}
      backgroundColor={variant === 'primary' ? '$primary' : '$neutral'}
      opacity={disabled || loading ? 0.4 : 1}
      onPress={handlePress}
      pressStyle={disabled || loading ? {} : { opacity: 0.8 }}
    >
      {loading ? (
        <XStack gap={spacing.sm} alignItems="center">
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text.Label color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
            {children}
          </Text.Label>
        </XStack>
      ) : (
        <Text.Body color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
          {children}
        </Text.Body>
      )}
    </View>
  );
}
