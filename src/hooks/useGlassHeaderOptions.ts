import { Platform } from 'react-native';

import { Stack } from 'expo-router';

import { FONT_FAMILIES } from '../components/Typography';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

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
  const { isTablet } = useResponsive();

  // Native bars have fixed heights (44pt iOS bar, ~52pt large-title area,
  // 56dp Android toolbar), so tablet sizes are bumped but capped below the
  // app's usual 1.5x to avoid vertical clipping. No fontWeight here: on
  // Android pairing it with a custom fontFamily falls back to Roboto.
  const titleFontSize = Platform.OS === 'ios' ? (isTablet ? 20 : 17) : isTablet ? 26 : 22;

  return {
    headerShown: true,
    headerTintColor: colors.primary,
    headerTitleStyle: {
      color: colors.text,
      fontFamily: FONT_FAMILIES.extrabold,
      fontSize: titleFontSize,
    },
    ...(Platform.OS === 'ios'
      ? {
          headerLargeTitle: true,
          headerLargeTitleStyle: {
            color: colors.text,
            fontFamily: FONT_FAMILIES.extrabold,
            fontSize: isTablet ? 36 : 32,
          },
          headerShadowVisible: false,
        }
      : {
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
        }),
  };
}
