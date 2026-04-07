import React from 'react';
import { ActivityIndicator } from 'react-native';

import { YStack } from 'tamagui';

import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { Text } from '../Typography';

import type { RefreshStatus } from '../../services/contentRefresh';

interface LocaleChangeOverlayProps {
  status: RefreshStatus;
}

export const LocaleChangeOverlay = React.memo(function LocaleChangeOverlay({
  status,
}: LocaleChangeOverlayProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing } = useResponsive();

  if (status !== 'locale-change') return null;

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      justifyContent="center"
      alignItems="center"
      backgroundColor="$background"
      zIndex={100}
      gap={spacing.lg}
    >
      <ActivityIndicator size="large" color={hexColors[theme].primary} />
      <Text.Body color="$textSecondary">{t('updatingLanguage')}</Text.Body>
    </YStack>
  );
});
