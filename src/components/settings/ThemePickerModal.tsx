import React from 'react';
import { Pressable, ScrollView } from 'react-native';

import { useTranslation } from '../../i18n';
import { trackThemeChange, updateThemeProperty } from '../../services/analytics';
import { hexColors, useTheme } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { useResponsive } from '../../utils/useResponsive';
import { DialogShell } from '../DialogShell';
import { Moon, Smartphone, Sun } from '../icons';
import { XStack, YStack } from '../Stacks';
import { Text } from '../Typography';

import type { TranslationKeys } from '../../i18n';
import type { ThemeMode } from '../../theme/ThemeProvider';

interface ThemePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

interface ThemeOption {
  value: ThemeMode;
  titleKey: TranslationKeys;
  descriptionKey: TranslationKeys;
  icon: (color: string) => React.ReactNode;
}

export const ThemePickerModal: React.FC<ThemePickerModalProps> = ({ visible, onClose }) => {
  const { theme, themeMode, setThemeMode } = useTheme();
  const colors = hexColors[theme];
  const { t } = useTranslation();
  const { spacing, radius, iconSizes, maxModalWidth, screenHeight } = useResponsive();

  const themeOptions: ThemeOption[] = [
    {
      value: 'light',
      titleKey: 'settingsThemeLight',
      descriptionKey: 'settingsThemeLightDescription',
      icon: (color) => <Sun size={iconSizes.lg} color={color} />,
    },
    {
      value: 'dark',
      titleKey: 'settingsThemeDark',
      descriptionKey: 'settingsThemeDarkDescription',
      icon: (color) => <Moon size={iconSizes.lg} color={color} />,
    },
    {
      value: 'system',
      titleKey: 'settingsThemeSystem',
      descriptionKey: 'settingsThemeSystemDescription',
      icon: (color) => <Smartphone size={iconSizes.lg} color={color} />,
    },
  ];

  const handleSelectTheme = (mode: ThemeMode) => {
    // Start closing first (shell unmounts the card immediately, so the theme
    // re-render below never repaints the exiting dialog), then apply the theme
    // shortly after the exit begins to avoid a mid-animation flash.
    onClose();

    setTimeout(() => {
      if (mode !== themeMode) {
        trackThemeChange({ from: themeMode, to: mode });
        updateThemeProperty(mode);
      }
      setThemeMode(mode);
    }, 50);
  };

  return (
    <DialogShell
      visible={visible}
      onClose={onClose}
      title={t('settingsThemeTitle')}
      showClose
      maxWidth={maxModalWidth}
    >
      <ScrollView style={{ maxHeight: screenHeight * 0.6 }} overScrollMode="never">
        <YStack padding={spacing.lg} gap={spacing.md}>
          {themeOptions.map((option) => {
            const isSelected = themeMode === option.value;
            return (
              <Pressable key={option.value} onPress={() => handleSelectTheme(option.value)}>
                {({ pressed }) => (
                  <XStack
                    borderRadius={radius.lg}
                    borderWidth={2}
                    padding={spacing.lg}
                    backgroundColor={isSelected ? hexToRgba(colors.primary, 0.12) : colors.surface}
                    borderColor={isSelected ? colors.primary : colors.border}
                    opacity={pressed ? 0.7 : 1}
                    alignItems="center"
                    gap={spacing.md}
                  >
                    <YStack
                      width={iconSizes.hero}
                      height={iconSizes.hero}
                      borderRadius={radius.md}
                      backgroundColor={
                        isSelected ? hexToRgba(colors.primary, 0.15) : 'rgba(0, 0, 0, 0.05)'
                      }
                      alignItems="center"
                      justifyContent="center"
                    >
                      {option.icon(isSelected ? colors.primary : colors.text)}
                    </YStack>
                    <YStack flex={1} gap={spacing.xs}>
                      <Text.Label color={colors.text}>{t(option.titleKey)}</Text.Label>
                      <Text.Caption color={colors.textSecondary}>
                        {t(option.descriptionKey)}
                      </Text.Caption>
                    </YStack>
                  </XStack>
                )}
              </Pressable>
            );
          })}
        </YStack>
      </ScrollView>
    </DialogShell>
  );
};
