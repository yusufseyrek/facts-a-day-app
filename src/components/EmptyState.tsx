import React from 'react';
import { styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { Lightbulb } from '@tamagui/lucide-icons';
import { tokens } from '../theme/tokens';
import { H1, BodyText } from './Typography';
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
  padding: tokens.space.xl,
  gap: tokens.space.lg,
});

const IconContainer = styled(YStack, {
  width: 120,
  height: 120,
  borderRadius: tokens.radius.full,
  backgroundColor: '$primaryLight',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: tokens.space.md,
});

const TextContainer = styled(YStack, {
  alignItems: 'center',
  gap: tokens.space.md,
  maxWidth: 300,
});

export function EmptyState({ title, description }: EmptyStateProps) {
  const { theme } = useTheme();
  const { typography: typo } = useResponsive();

  return (
    <Container>
      <IconContainer>
        <Lightbulb
          size={56}
          color={theme === 'dark' ? '#0066FF' : tokens.color.light.primary}
        />
      </IconContainer>
      <TextContainer>
        <H1 textAlign="center">{title}</H1>
        <BodyText
          textAlign="center"
          color="$textSecondary"
          fontSize={typo.fontSize.subtitle}
          lineHeight={typo.lineHeight.subtitle}
        >
          {description}
        </BodyText>
      </TextContainer>
    </Container>
  );
}
