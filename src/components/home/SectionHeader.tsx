import React from 'react';

import { XStack } from 'tamagui';

import { LAYOUT } from '../../config/app';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { Text } from '../Typography';

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  paddingTop?: number;
}

export const SectionHeader = React.memo(function SectionHeader({
  icon,
  title,
  paddingTop,
}: SectionHeaderProps) {
  const { spacing, typography } = useResponsive();

  return (
    <XStack
      width="100%"
      maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
      alignSelf="center"
      paddingHorizontal={spacing.lg}
      paddingTop={paddingTop}
      paddingBottom={spacing.sm}
      alignItems="center"
      gap={spacing.sm}
    >
      {icon}
      <Text.Title fontSize={typography.fontSize.body}>{title}</Text.Title>
    </XStack>
  );
});
