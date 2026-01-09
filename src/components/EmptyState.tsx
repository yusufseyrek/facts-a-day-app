import React from 'react';
import { YStack } from 'tamagui';
import { Lightbulb } from '@tamagui/lucide-icons';
import { hexColors } from '../theme';
import { Text } from './Typography';
import { useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';
import { LAYOUT } from '../config';

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  const { theme } = useTheme();
  const { spacing, radius, iconSizes } = useResponsive();

  return (
    <YStack
      flex={1}
      justifyContent="center"
      alignItems="center"
      padding={spacing.xl}
      gap={spacing.lg}
    >
      <YStack
        width={120}
        height={120}
        borderRadius={radius.full}
        backgroundColor="$primaryLight"
        alignItems="center"
        justifyContent="center"
        marginBottom={spacing.md}
      >
        <Lightbulb
          size={iconSizes.hero}
          color={theme === 'dark' ? '#0066FF' : hexColors.light.primary}
        />
      </YStack>
      <YStack alignItems="center" gap={spacing.md} maxWidth={LAYOUT.MAX_CONTENT_WIDTH}>
        <Text.Headline textAlign="center">{title}</Text.Headline>
        <Text.Body textAlign="center" color="$textSecondary">
          {description}
        </Text.Body>
      </YStack>
    </YStack>
  );
}
