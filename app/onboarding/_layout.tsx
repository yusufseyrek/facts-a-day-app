import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';

import { hexColors } from '../../src/theme';

export default function OnboardingLayout() {
  const colorScheme = useColorScheme();

  // Use system color scheme for initial background
  const backgroundColor =
    colorScheme === 'dark' ? hexColors.dark.background : hexColors.light.background;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor },
      }}
    >
      {/* Language selection removed - now handled via device settings */}
      {/* Redirect /onboarding to /onboarding/categories */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="categories" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
