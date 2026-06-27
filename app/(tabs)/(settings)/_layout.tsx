import { Stack } from 'expo-router';

import { HeaderQueueButton } from '../../../src/components/player/HeaderQueueButton';
import { useAudioQueue } from '../../../src/contexts';
import { useGlassHeaderOptions } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';

// The offline library is a pushed screen with a "back to settings" chevron in
// the header top-left, so the floating queue pill is suppressed there (see
// PersistentMiniPlayer) and the queue control rides in the header-right instead.
// The settings ROOT keeps the floating pill (no back button), so it is left out.
//
// IMPORTANT: a `headerRight` function that returns null still materializes an
// empty right-bar subview — native-stack calls the fn once and keys off the
// returned element, not what the inner component renders. So relying on
// HeaderQueueButton self-hiding on an empty queue would leave a blank "ghost
// button"; we gate the whole option to `undefined` when there's nothing to
// control, dropping the slot entirely.
const renderQueueHeaderRight = () => <HeaderQueueButton />;

export default function SettingsStackLayout() {
  const headerOptions = useGlassHeaderOptions();
  const { t } = useTranslation();
  const { queue } = useAudioQueue();
  const queueHeaderRight = queue.length > 0 ? renderQueueHeaderRight : undefined;

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
