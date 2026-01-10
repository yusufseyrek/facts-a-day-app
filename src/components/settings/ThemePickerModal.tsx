import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Moon, Smartphone, Sun, X } from '@tamagui/lucide-icons';

import { useTranslation } from '../../i18n';
import { trackThemeChange, updateThemeProperty } from '../../services/analytics';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { Text } from '../Typography';

import type { TranslationKeys } from '../../i18n';
import type { ThemeMode } from '../../theme/ThemeProvider';

const ANIMATION_DURATION = 200;

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
  const { spacing, radius, iconSizes, maxModalWidth } = useResponsive();

  // Internal state to keep modal mounted during exit animation
  const [showContent, setShowContent] = useState(false);
  const closingRef = useRef(false);

  // Sync with external visible prop
  useEffect(() => {
    if (visible) {
      setShowContent(true);
      closingRef.current = false;
    } else if (!closingRef.current) {
      // External close (e.g., Android back button handled by parent)
      setShowContent(false);
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setShowContent(false);
    // Wait for animation to complete, then notify parent
    setTimeout(() => {
      onClose();
      closingRef.current = false;
    }, ANIMATION_DURATION);
  }, [onClose]);

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
    // Start closing animation
    handleClose();

    // Apply theme change after animation starts
    setTimeout(() => {
      if (mode !== themeMode) {
        trackThemeChange({ from: themeMode, to: mode });
        updateThemeProperty(mode);
      }
      setThemeMode(mode);
    }, 50);
  };

  const dynamicStyles = useMemo(
    () => ({
      modalContainer: {
        maxHeight: Dimensions.get('window').height * 0.7,
        borderRadius: radius.lg,
        overflow: 'hidden' as const,
      },
      header: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        borderBottomWidth: 1,
      },
      closeButton: {
        padding: spacing.xs,
      },
      optionsContainer: {
        padding: spacing.lg,
        gap: spacing.md,
      },
      optionCard: {
        borderRadius: radius.lg,
        borderWidth: 2,
        padding: spacing.lg,
      },
      optionHeader: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: spacing.md,
      },
      iconContainer: {
        width: 48,
        height: 48,
        borderRadius: radius.md,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      },
    }),
    [spacing, radius]
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.container}>
        {showContent && (
          <Animated.View
            entering={FadeIn.duration(ANIMATION_DURATION)}
            exiting={FadeOut.duration(ANIMATION_DURATION)}
            style={styles.overlay}
          />
        )}
        <Pressable style={styles.overlayPressable} onPress={handleClose}>
          {showContent && (
            <Animated.View
              entering={ZoomIn.duration(ANIMATION_DURATION)}
              exiting={ZoomOut.duration(ANIMATION_DURATION)}
              style={styles.animatedContainer}
            >
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View
                  style={[
                    dynamicStyles.modalContainer,
                    { backgroundColor: colors.background, width: maxModalWidth },
                  ]}
                >
                  <View style={[dynamicStyles.header, { borderBottomColor: colors.border }]}>
                    <Text.Title color={colors.text}>{t('settingsThemeTitle')}</Text.Title>
                    <Pressable onPress={handleClose} style={dynamicStyles.closeButton}>
                      <X size={iconSizes.lg} color={colors.text} />
                    </Pressable>
                  </View>

                  <ScrollView style={styles.scrollView}>
                    <View style={dynamicStyles.optionsContainer}>
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
                                  dynamicStyles.optionCard,
                                  {
                                    backgroundColor: isSelected ? colors.primary : colors.surface,
                                    borderColor: isSelected ? colors.primary : colors.border,
                                    opacity: pressed ? 0.7 : 1,
                                  },
                                ]}
                              >
                                <View style={dynamicStyles.optionHeader}>
                                  <View
                                    style={[
                                      dynamicStyles.iconContainer,
                                      {
                                        backgroundColor: isSelected
                                          ? 'rgba(255, 255, 255, 0.2)'
                                          : 'rgba(0, 0, 0, 0.05)',
                                      },
                                    ]}
                                  >
                                    {option.icon(isSelected ? '#FFFFFF' : colors.text)}
                                  </View>
                                  <View style={styles.optionTextContainer}>
                                    <Text.Label color={isSelected ? '#FFFFFF' : colors.text}>
                                      {t(option.titleKey)}
                                    </Text.Label>
                                    <Text.Caption
                                      color={
                                        isSelected
                                          ? 'rgba(255, 255, 255, 0.9)'
                                          : colors.textSecondary
                                      }
                                    >
                                      {t(option.descriptionKey)}
                                    </Text.Caption>
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
              </Pressable>
            </Animated.View>
          )}
        </Pressable>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlayPressable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatedContainer: {
    alignItems: 'center',
  },
  scrollView: {
    maxHeight: 500,
  },
  optionTextContainer: {
    flex: 1,
    gap: 4,
  },
});
