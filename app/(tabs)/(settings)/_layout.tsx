import { Stack } from 'expo-router';

import { useGlassHeaderOptions } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';

// The library's queue control is the GLOBAL floating pill
// (PersistentMiniPlayer), which detects the pushed screen's back chevron
// structurally and floats top-right by itself — no headerRight wiring here.
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
