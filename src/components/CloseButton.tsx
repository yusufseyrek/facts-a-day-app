import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { X } from '@tamagui/lucide-icons';

import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import type { StyleProp, ViewStyle } from 'react-native';

/**
 * The app's one and only X (close) button, styled after the onboarding
 * sample-fact detail's floating close: a themed translucent circle
 * (iconSizes.xl + spacing.md across) with a soft shadow and an
 * iconSizes.md X in the theme text color.
 *
 * Every dismissable surface (fact detail, story, dialogs, sheets, trivia,
 * paywall) renders this so close affordances are identical everywhere.
 * Callers own POSITIONING only (absolute top/right, header-row flow, etc.)
 * via `style` — the visual style and size are fixed here on purpose.
 */
export function CloseButton({
  onPress,
  style,
  testID,
  label,
}: {
  onPress: () => void;
  /** Positioning/stacking only (e.g. absolute top/right, zIndex). */
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Accessibility label; defaults to the localized "close". */
  label?: string;
}) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes } = useResponsive();
  const size = iconSizes.xl + spacing.md;

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      aria-label={label ?? t('a11y_closeButton')}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          backgroundColor: theme === 'dark' ? 'rgba(20,24,48,0.7)' : 'rgba(255,255,255,0.75)',
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <X size={iconSizes.md} color={hexColors[theme].text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
});
