import { Platform } from 'react-native';

import { Stack } from 'expo-router';

import { hexColors, useTheme } from '../theme';

type StackScreenOptions = NonNullable<React.ComponentProps<typeof Stack>['screenOptions']>;

/**
 * Shared native-stack header options for the iOS 26 era.
 *
 * iOS: native UINavigationBar with a large title. We deliberately set NO
 * background/transparency overrides so the system appearance applies — on
 * iOS 26 that is Liquid Glass with the scroll-edge effect (transparent at top,
 * glass once content scrolls under); older iOS gets the standard system bar.
 *
 * Android: Material toolbar on the theme surface color.
 */
export function useGlassHeaderOptions(): StackScreenOptions {
  const { theme } = useTheme();
  const colors = hexColors[theme];

  return {
    headerShown: true,
    headerTintColor: colors.primary,
    headerTitleStyle: { color: colors.text },
    ...(Platform.OS === 'ios'
      ? {
          headerLargeTitle: true,
          headerLargeTitleStyle: { color: colors.text },
          headerShadowVisible: false,
        }
      : {
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
        }),
  };
}
