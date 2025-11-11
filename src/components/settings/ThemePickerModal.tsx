import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { X, Sun, Moon, Smartphone } from '@tamagui/lucide-icons';
import { useTheme } from '../../theme';
import { tokens } from '../../theme/tokens';
import { useTranslation, type TranslationKeys } from '../../i18n';
import type { ThemeMode } from '../../theme/ThemeProvider';

interface ThemePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

interface ThemeOption {
  value: ThemeMode;
  titleKey: TranslationKeys;
  descriptionKey: TranslationKeys;
  icon: React.ReactNode;
}

export const ThemePickerModal: React.FC<ThemePickerModalProps> = ({
  visible,
  onClose,
}) => {
  const { theme, themeMode, setThemeMode } = useTheme();
  const colors = tokens.color[theme];
  const { t } = useTranslation();

  const themeOptions: ThemeOption[] = [
    {
      value: 'light',
      titleKey: 'settingsThemeLight',
      descriptionKey: 'settingsThemeLightDescription',
      icon: <Sun size={24} color={colors.text} />,
    },
    {
      value: 'dark',
      titleKey: 'settingsThemeDark',
      descriptionKey: 'settingsThemeDarkDescription',
      icon: <Moon size={24} color={colors.text} />,
    },
    {
      value: 'system',
      titleKey: 'settingsThemeSystem',
      descriptionKey: 'settingsThemeSystemDescription',
      icon: <Smartphone size={24} color={colors.text} />,
    },
  ];

  const handleSelectTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: colors.background },
          ]}
        >
          <View
            style={[
              styles.header,
              { borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.title, { color: colors.text }]}>
              {t('settingsThemeTitle')}
            </Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollView}>
            <View style={styles.optionsContainer}>
              {themeOptions.map((option) => {
                const isSelected = themeMode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleSelectTheme(option.value)}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.optionCard,
                          {
                            backgroundColor: isSelected
                              ? colors.primary
                              : colors.surface,
                            borderColor: isSelected
                              ? colors.primary
                              : colors.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <View style={styles.optionHeader}>
                          <View
                            style={[
                              styles.iconContainer,
                              {
                                backgroundColor: isSelected
                                  ? 'rgba(255, 255, 255, 0.2)'
                                  : 'rgba(0, 0, 0, 0.05)',
                              },
                            ]}
                          >
                            {React.cloneElement(option.icon as React.ReactElement, {
                              color: isSelected ? '#FFFFFF' : colors.text,
                            })}
                          </View>
                          <View style={styles.optionTextContainer}>
                            <Text
                              style={[
                                styles.optionTitle,
                                {
                                  color: isSelected
                                    ? '#FFFFFF'
                                    : colors.text,
                                },
                              ]}
                            >
                              {t(option.titleKey)}
                            </Text>
                            <Text
                              style={[
                                styles.optionDescription,
                                {
                                  color: isSelected
                                    ? 'rgba(255, 255, 255, 0.9)'
                                    : colors.textSecondary,
                                },
                              ]}
                            >
                              {t(option.descriptionKey)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    maxHeight: '70%',
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.lg,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: tokens.fontSize.h2,
    fontWeight: tokens.fontWeight.bold,
  },
  closeButton: {
    padding: tokens.space.xs,
  },
  scrollView: {
    maxHeight: 500,
  },
  optionsContainer: {
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  optionCard: {
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    padding: tokens.space.lg,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextContainer: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.semibold,
  },
  optionDescription: {
    fontSize: tokens.fontSize.small,
    fontWeight: tokens.fontWeight.regular,
  },
});
