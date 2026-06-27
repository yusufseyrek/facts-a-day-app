import { Stack } from 'expo-router';

import { HeaderQueueButton } from '../../../src/components/player/HeaderQueueButton';
import { useGlassHeaderOptions } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';

// The offline library is a pushed screen with a "back to settings" chevron in
// the header top-left, so the floating queue pill is suppressed there (see
// PersistentMiniPlayer) and the queue control rides in the header-right instead.
// HeaderQueueButton self-hides on an empty queue. The settings ROOT keeps the
// floating pill (no back button), so it is deliberately left out.
const queueHeaderRight = () => <HeaderQueueButton />;

export default function SettingsStackLayout() {
  const headerOptions = useGlassHeaderOptions();
  const { t } = useTranslation();

  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="settings" options={{ title: t('settings') }} />
      <Stack.Screen
        name="library"
        options={{ title: t('offlineLibrary'), headerRight: queueHeaderRight }}
      />
    </Stack>
  );
}
