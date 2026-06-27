import { Stack } from 'expo-router';

import { HeaderQueueButton } from '../../../src/components/player/HeaderQueueButton';
import { useGlassHeaderOptions } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';

// Pushed trivia screens carry a back chevron in the header top-left, so the
// floating queue pill is suppressed on them (see PersistentMiniPlayer) and the
// queue control rides in the header-right here instead. HeaderQueueButton
// self-hides on an empty queue, so an idle header stays clean. The trivia INDEX
// is a tab root (no back button) and keeps the floating pill — plus it already
// owns headerRight (the leaderboard trophy), so it is deliberately left out.
const queueHeaderRight = () => <HeaderQueueButton />;

export default function TriviaTabLayout() {
  const headerOptions = useGlassHeaderOptions();
  const { t } = useTranslation();

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
