import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { X, Sun, Moon, Smartphone } from '@tamagui/lucide-icons';
import { useTheme } from '../../theme';
import { tokens } from '../../theme/tokens';
import { useTranslation, type TranslationKeys } from '../../i18n';
import type { ThemeMode } from '../../theme/ThemeProvider';
import { Text } from '../Typography';
import { trackThemeChange, updateThemeProperty } from '../../services/analytics';

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

export const ThemePickerModal: React.FC<ThemePickerModalProps> = ({
  visible,
  onClose,
}) => {
  const { theme, themeMode, setThemeMode } = useTheme();
  const colors = tokens.color[theme];
  const { t } = useTranslation();

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
      icon: (color) => <Sun size={24} color={color} />,
    },
    {
      value: 'dark',
      titleKey: 'settingsThemeDark',
      descriptionKey: 'settingsThemeDarkDescription',
      icon: (color) => <Moon size={24} color={color} />,
    },
    {
      value: 'system',
      titleKey: 'settingsThemeSystem',
      descriptionKey: 'settingsThemeSystemDescription',
      icon: (color) => <Smartphone size={24} color={color} />,
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

  const screenWidth = Dimensions.get('window').width;
  const modalWidth = screenWidth * 0.85;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
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
                    styles.modalContainer,
                    { backgroundColor: colors.background, width: modalWidth },
                  ]}
                >
                <View
                  style={[
                    styles.header,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Text.Title color={colors.text}>
                    {t('settingsThemeTitle')}
                  </Text.Title>
                  <Pressable onPress={handleClose} style={styles.closeButton}>
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
                                  {option.icon(isSelected ? '#FFFFFF' : colors.text)}
                                </View>
                                <View style={styles.optionTextContainer}>
                                  <Text.Label
                                    color={isSelected ? '#FFFFFF' : colors.text}
                                  >
                                    {t(option.titleKey)}
                                  </Text.Label>
                                  <Text.Caption
                                    color={isSelected ? 'rgba(255, 255, 255, 0.9)' : colors.textSecondary}
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
  modalContainer: {
    maxHeight: Dimensions.get('window').height * 0.7,
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
});
