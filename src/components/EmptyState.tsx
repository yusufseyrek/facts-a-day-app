import React from 'react';
import { styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { Lightbulb } from '@tamagui/lucide-icons';
import { hexColors, spacing, radius, sizes } from '../theme';
import { Text } from './Typography';
import { useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

interface EmptyStateProps {
  title: string;
  description: string;
}

const Container = styled(YStack, {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  padding: spacing.phone.xl,
  gap: spacing.phone.lg,
});

const IconContainer = styled(YStack, {
  width: 120,
  height: 120,
  borderRadius: radius.phone.full,
  backgroundColor: '$primaryLight',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: spacing.phone.md,
});

const TextContainer = styled(YStack, {
  alignItems: 'center',
  gap: spacing.phone.md,
  maxWidth: 300,
});

export function EmptyState({ title, description }: EmptyStateProps) {
  const { theme } = useTheme();
  const { iconSizes } = useResponsive();

  return (
    <Container>
      <IconContainer>
        <Lightbulb
          size={iconSizes.hero}
          color={theme === 'dark' ? '#0066FF' : hexColors.light.primary}
        />
      </IconContainer>
      <TextContainer>
        <Text.Headline textAlign="center">{title}</Text.Headline>
        <Text.Body
          textAlign="center"
          color="$textSecondary"
        >
          {description}
        </Text.Body>
      </TextContainer>
    </Container>
  );
}
