import { Stack } from 'expo-router';

import { useGlassHeaderOptions } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';

export default function SettingsStackLayout() {
  const headerOptions = useGlassHeaderOptions();
  const { t } = useTranslation();

  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="settings" options={{ title: t('settings') }} />
      <Stack.Screen name="library" options={{ title: t('offlineLibrary') }} />
    </Stack>
  );
}
