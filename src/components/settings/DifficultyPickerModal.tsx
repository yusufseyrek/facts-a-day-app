import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { X } from '@tamagui/lucide-icons';
import { useTheme } from '../../theme';
import { tokens } from '../../theme/tokens';
import { useTranslation, type TranslationKeys } from '../../i18n';
import * as onboardingService from '../../services/onboarding';
import * as preferencesService from '../../services/preferences';

interface DifficultyPickerModalProps {
  visible: boolean;
  onClose: () => void;
  currentDifficulty: string;
  onDifficultyChange: (difficulty: string) => void;
}

type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'all';

interface DifficultyOption {
  value: DifficultyLevel;
  titleKey: TranslationKeys;
  descriptionKey: TranslationKeys;
}

const difficultyOptions: DifficultyOption[] = [
  {
    value: 'beginner',
    titleKey: 'easyDifficulty',
    descriptionKey: 'easyDescription',
  },
  {
    value: 'intermediate',
    titleKey: 'mediumDifficulty',
    descriptionKey: 'mediumDescription',
  },
  {
    value: 'advanced',
    titleKey: 'hardDifficulty',
    descriptionKey: 'hardDescription',
  },
  {
    value: 'all',
    titleKey: 'allDifficulties',
    descriptionKey: 'allDescription',
  },
];

export const DifficultyPickerModal: React.FC<DifficultyPickerModalProps> = ({
  visible,
  onClose,
  currentDifficulty,
  onDifficultyChange,
}) => {
  const { theme } = useTheme();
  const colors = tokens.color[theme];
  const { t, locale } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSelectDifficulty = async (difficulty: DifficultyLevel) => {
    if (difficulty === currentDifficulty) {
      onClose();
      return;
    }

    setIsRefreshing(true);
    try {
      // Save preference
      await onboardingService.setDifficultyPreference(difficulty);

      // Trigger data refresh
      const result = await preferencesService.handleDifficultyChange(
        difficulty,
        locale,
        (progress) => {
          console.log(`${progress.stage}: ${progress.percentage}% - ${progress.message}`);
        }
      );

      if (result.success) {
        console.log(`Successfully refreshed with ${result.factsCount} facts`);
        onDifficultyChange(difficulty);
        onClose();
      } else {
        Alert.alert('Error', result.error || 'Failed to update difficulty');
      }
    } catch (error) {
      console.error('Error updating difficulty:', error);
      Alert.alert('Error', 'Failed to update difficulty. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isRefreshing ? undefined : onClose}
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
              {t('settingsDifficulty')}
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              disabled={isRefreshing}
            >
              <X size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollView}>
            <View style={styles.optionsContainer}>
              {difficultyOptions.map((option) => {
                const isSelected = currentDifficulty === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleSelectDifficulty(option.value)}
                    disabled={isRefreshing}
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
                            opacity: pressed || isRefreshing ? 0.7 : 1,
                          },
                        ]}
                      >
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
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {isRefreshing && (
            <View style={styles.loadingOverlay}>
              <View style={[styles.loadingBox, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.text }]}>
                  Updating difficulty...
                </Text>
              </View>
            </View>
          )}
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
    maxHeight: '80%',
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
  optionTextContainer: {
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    padding: tokens.space.xl,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    gap: tokens.space.md,
  },
  loadingText: {
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.medium,
  },
});
