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
import { X, Check } from '@tamagui/lucide-icons';
import { useTheme } from '../../theme';
import { tokens } from '../../theme/tokens';
import { useTranslation } from '../../i18n/useTranslation';
import { SupportedLocale } from '../../i18n/translations';
import * as preferencesService from '../../services/preferences';

interface LanguagePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'de', name: 'Deutsch', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
];

export const LanguagePickerModal: React.FC<LanguagePickerModalProps> = ({
  visible,
  onClose,
}) => {
  const { theme } = useTheme();
  const colors = tokens.color[theme];
  const { locale, setLocale, t } = useTranslation();
  const [isChanging, setIsChanging] = useState(false);

  const handleSelectLanguage = async (languageCode: SupportedLocale) => {
    if (languageCode === locale) {
      onClose();
      return;
    }

    setIsChanging(true);
    try {
      // Immediately update UI language
      setLocale(languageCode);

      // Trigger background data refresh with translation updates
      const result = await preferencesService.handleLanguageChange(
        languageCode,
        (progress) => {
          console.log(`${progress.stage}: ${progress.percentage}% - ${progress.message}`);
        }
      );

      if (result.success) {
        console.log(`Successfully refreshed with ${result.factsCount} facts`);
        onClose();
      } else {
        Alert.alert(t('error'), result.error || t('failedToUpdateLanguageData'));
        // Revert locale on failure
        setLocale(locale);
      }
    } catch (error) {
      console.error('Error changing language:', error);
      Alert.alert(t('error'), t('failedToChangeLanguage'));
      // Revert locale on failure
      setLocale(locale);
    } finally {
      setIsChanging(false);
    }
  };

  // Split languages into rows of 2
  const languageRows: typeof LANGUAGES[] = [];
  for (let i = 0; i < LANGUAGES.length; i += 2) {
    languageRows.push(LANGUAGES.slice(i, i + 2));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isChanging ? undefined : onClose}
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
              {t('settingsLanguage')}
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              disabled={isChanging}
            >
              <X size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollView}>
            <View style={styles.gridContainer}>
              {languageRows.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={styles.gridRow}>
                  {row.map((language) => (
                    <Pressable
                      key={language.code}
                      onPress={() => handleSelectLanguage(language.code as SupportedLocale)}
                      disabled={isChanging}
                      style={({ pressed }) => [
                        styles.languageCard,
                        {
                          backgroundColor: locale === language.code
                            ? colors.primary
                            : colors.surface,
                          borderColor: locale === language.code
                            ? colors.primary
                            : colors.border,
                          opacity: pressed || isChanging ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.flagIcon}>{language.flag}</Text>
                      <View style={styles.languageInfo}>
                        <Text
                          style={[
                            styles.languageName,
                            {
                              color: locale === language.code
                                ? '#FFFFFF'
                                : colors.text,
                            },
                          ]}
                        >
                          {language.nativeName}
                        </Text>
                        {language.code !== language.nativeName.toLowerCase() && (
                          <Text
                            style={[
                              styles.languageSubtext,
                              {
                                color: locale === language.code
                                  ? 'rgba(255, 255, 255, 0.9)'
                                  : colors.textSecondary,
                              },
                            ]}
                          >
                            {language.name}
                          </Text>
                        )}
                      </View>
                      {locale === language.code && (
                        <Check size={20} color="#FFFFFF" style={styles.checkIcon} />
                      )}
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          {isChanging && (
            <View style={styles.loadingOverlay}>
              <View style={[styles.loadingBox, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.text }]}>
                  {t('updatingLanguage')}
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
  gridContainer: {
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  gridRow: {
    flexDirection: 'row',
    gap: tokens.space.md,
  },
  languageCard: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.space.lg,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    minHeight: 100,
    position: 'relative',
  },
  flagIcon: {
    fontSize: 32,
    marginBottom: tokens.space.sm,
  },
  languageInfo: {
    alignItems: 'center',
  },
  checkIcon: {
    position: 'absolute',
    top: tokens.space.sm,
    right: tokens.space.sm,
  },
  languageName: {
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.semibold,
    marginBottom: 2,
    textAlign: 'center',
  },
  languageSubtext: {
    fontSize: tokens.fontSize.small,
    fontWeight: tokens.fontWeight.regular,
    textAlign: 'center',
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
