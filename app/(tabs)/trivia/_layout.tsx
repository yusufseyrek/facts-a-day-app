import { Stack } from 'expo-router';

import { useGlassHeaderOptions } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';

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
    </Stack>
  );
}
