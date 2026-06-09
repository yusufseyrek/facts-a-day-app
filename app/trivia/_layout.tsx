import { useColorScheme } from 'react-native';

import { Stack } from 'expo-router';

import { useGlassHeaderOptions } from '../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../src/i18n';
import { hexColors } from '../../src/theme';

export default function TriviaLayout() {
  const headerOptions = useGlassHeaderOptions();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();

  // Use system color scheme for initial background (app theme will override via screen styles)
  const backgroundColor =
    colorScheme === 'dark' ? hexColors.dark.background : hexColors.light.background;

  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        gestureEnabled: false,
        contentStyle: { backgroundColor },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('trivia') }} />
      <Stack.Screen name="performance" options={{ title: t('triviaPerformance') }} />
      <Stack.Screen
        name="game"
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
          contentStyle: { backgroundColor },
        }}
      />
      <Stack.Screen name="history" options={{ title: t('testHistory') }} />
    </Stack>
  );
}
