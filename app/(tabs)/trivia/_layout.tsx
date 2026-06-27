import { Stack } from 'expo-router';

import { HeaderQueueButton } from '../../../src/components/player/HeaderQueueButton';
import { useAudioQueue } from '../../../src/contexts';
import { useGlassHeaderOptions } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';

// Pushed trivia screens carry a back chevron in the header top-left, so the
// floating queue pill is suppressed on them (see PersistentMiniPlayer) and the
// queue control rides in the header-right here instead. The trivia INDEX is a
// tab root (no back button) and keeps the floating pill — plus it already owns
// headerRight (the leaderboard trophy), so it is deliberately left out.
//
// IMPORTANT: a `headerRight` function that returns null still materializes an
// empty right-bar subview — native-stack calls the fn once and keys off the
// returned element, not what the inner component renders. So we cannot rely on
// HeaderQueueButton self-hiding on an empty queue; that would leave a blank
// "ghost button". Instead we gate the whole option to `undefined` when there's
// nothing to control, dropping the slot entirely.
const renderQueueHeaderRight = () => <HeaderQueueButton />;

export default function TriviaTabLayout() {
  const headerOptions = useGlassHeaderOptions();
  const { t } = useTranslation();
  const { queue } = useAudioQueue();
  const queueHeaderRight = queue.length > 0 ? renderQueueHeaderRight : undefined;

  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: t('trivia') }} />
      <Stack.Screen
        name="performance"
        options={{ title: t('triviaPerformance'), headerRight: queueHeaderRight }}
      />
      <Stack.Screen
        name="leaderboard"
        options={{ title: t('leaderboard'), headerRight: queueHeaderRight }}
      />
      <Stack.Screen
        name="categories"
        options={{ title: t('accuracyByCategory'), headerRight: queueHeaderRight }}
      />
      <Stack.Screen
        name="history"
        options={{ title: t('testHistory'), headerRight: queueHeaderRight }}
      />
    </Stack>
  );
}
