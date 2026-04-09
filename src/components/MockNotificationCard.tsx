import { Image } from 'react-native';

import { View } from '@tamagui/core';
import { XStack, YStack } from 'tamagui';

import { useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { FONT_FAMILIES, Text } from './Typography';

interface MockNotificationCardProps {
  appName: string;
  timeLabel: string;
  factText: string;
}

/**
 * Realistic iOS-style notification mockup.
 * Layout: [time fixed top-right]
 *         [icon] [app name (bold)]
 *         [icon] [fact title]
 */
export function MockNotificationCard({ appName, timeLabel, factText }: MockNotificationCardProps) {
  const { spacing, radius, typography, iconSizes } = useResponsive();
  const { theme } = useTheme();

  const appIconSize = iconSizes.xxl;
  const bodyLineHeight = typography.lineHeight.label;

  return (
    <YStack
      backgroundColor="$surface"
      borderRadius={radius.lg}
      padding={spacing.md}
      shadowColor={theme === 'dark' ? '#111111' : '#999999'}
      shadowOffset={{ width: 0, height: 0 }}
      shadowOpacity={theme === 'dark' ? 0.05 : 0.12}
      shadowRadius={4}
      elevation={4}
    >
      {/* Time label — fixed top-right */}
      <View style={{ position: 'absolute', top: spacing.md, right: spacing.md }}>
        <Text.Tiny color="$text">{timeLabel}</Text.Tiny>
      </View>

      {/* Icon + text content */}
      <XStack gap={spacing.sm}>
        {/* App icon — vertically centered */}
        <View style={{ justifyContent: 'center' }}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../../assets/icon.png')}
            style={{
              width: appIconSize,
              height: appIconSize,
              borderRadius: appIconSize * 0.22,
            }}
          />
        </View>

        {/* App name + fact title — vertically centered */}
        <YStack flex={1} justifyContent="center">
          <Text.Label color="$text" fontFamily={FONT_FAMILIES.semibold} numberOfLines={1}>
            {appName}
          </Text.Label>

          <Text.Label
            color="$text"
            fontFamily={FONT_FAMILIES.regular}
            numberOfLines={2}
            lineHeight={bodyLineHeight}
          >
            {factText}
          </Text.Label>
        </YStack>
      </XStack>
    </YStack>
  );
}
