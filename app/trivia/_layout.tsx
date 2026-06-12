import { useColorScheme } from 'react-native';

import { Stack } from 'expo-router';

import { hexColors } from '../../src/theme';

// Only the game lives outside the tabs: it presents as a fullScreenModal that
// must cover the tab bar. The trivia hub/performance/history screens live in
// app/(tabs)/trivia so they render under the tab bar.
export default function TriviaLayout() {
  const colorScheme = useColorScheme();

  // Use system color scheme for initial background (app theme will override via screen styles)
  const backgroundColor =
    colorScheme === 'dark' ? hexColors.dark.background : hexColors.light.background;

  return (
    <Stack
      screenOptions={{
        gestureEnabled: false,
        contentStyle: { backgroundColor },
      }}
    >
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
    </Stack>
  );
}
