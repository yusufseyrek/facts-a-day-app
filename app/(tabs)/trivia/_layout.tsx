import { Stack } from 'expo-router';

import { useGlassHeaderOptions } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';

// The queue control on pushed screens is the GLOBAL floating pill
// (PersistentMiniPlayer), which detects the back chevron structurally and
// floats top-right by itself — no headerRight wiring here. (It used to ride in
// headerRight on each pushed screen, which iOS 26 wrapped in its own Liquid
// Glass capsule — a pill inside a box — and which drifted out of sync with the
// pill's per-screen suppression list whenever a screen was added.)
export default function TriviaTabLayout() {
  const headerOptions = useGlassHeaderOptions();
  const { t } = useTranslation();

  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: t('trivia') }} />
      <Stack.Screen name="performance" options={{ title: t('triviaPerformance') }} />
      <Stack.Screen name="leaderboard" options={{ title: t('leaderboard') }} />
      <Stack.Screen name="categories" options={{ title: t('accuracyByCategory') }} />
      <Stack.Screen name="history" options={{ title: t('testHistory') }} />
      <Stack.Screen
        name="profile"
        // Generic title on purpose: the hero card owns the player's name, and
        // a large-title header repeating it read as a double username.
        options={{ title: t('playerProfile') }}
      />
    </Stack>
  );
}
