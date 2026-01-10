import React, { useState, useMemo } from 'react';
import {
  Modal,
  TextInput,
  Keyboard,
  Platform,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  ScrollView,
  View,
} from 'react-native';
import { X } from '@tamagui/lucide-icons';
import { YStack, XStack } from 'tamagui';

import { Button } from './Button';
import { Text } from './Typography';
import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

interface ReportFactModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (feedback: string) => Promise<void>;
  isSubmitting: boolean;
}

export function ReportFactModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
}: ReportFactModalProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { spacing, radius, typography, iconSizes } = useResponsive();
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [inputWidth, setInputWidth] = useState<number | undefined>(undefined);

  const handleClose = () => {
    setFeedback('');
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    const trimmedFeedback = feedback.trim();

    // Validation
    if (trimmedFeedback === '') {
      setError(t('provideFeedback'));
      return;
    }

    if (trimmedFeedback.length < 10) {
      setError(t('feedbackMinLength'));
      return;
    }

    if (trimmedFeedback.length > 1000) {
      setError(t('feedbackMaxLength'));
      return;
    }

    setError('');
    await onSubmit(trimmedFeedback);
    handleClose();
  };

  const modalContainerStyle = useMemo(
    () => ({
      backgroundColor: '$background',
      borderRadius: radius.lg,
      width: '100%' as const,
      maxWidth: 500,
      padding: spacing.lg,
      gap: spacing.md,
      flexShrink: 0,
      alignSelf: 'center' as const,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
        },
        android: {
          elevation: 5,
        },
      }),
    }),
    [spacing, radius]
  );

  const textInputStyle = useMemo(
    () => ({
      backgroundColor: hexColors[theme].surface,
      borderRadius: radius.md,
      padding: spacing.md,
      minHeight: 120,
      maxHeight: 200,
      textAlignVertical: 'top' as const,
      borderWidth: 1,
      borderColor: hexColors[theme].border,
      alignSelf: 'stretch' as const,
      fontSize: typography.fontSize.body,
      color: hexColors[theme].text,
      width: inputWidth ?? ('100%' as const),
    }),
    [spacing, radius, typography, theme, inputWidth]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <YStack
            flex={1}
            backgroundColor="rgba(0, 0, 0, 0.5)"
            justifyContent="center"
            alignItems="center"
            padding={spacing.lg}
          >
            <TouchableWithoutFeedback>
              <ScrollView
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingVertical: spacing.lg,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <YStack {...modalContainerStyle}>
                  <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    marginBottom={spacing.sm}
                  >
                    <Text.Title>{t('reportFact')}</Text.Title>
                    <TouchableWithoutFeedback onPress={handleClose}>
                      <YStack
                        width={32}
                        height={32}
                        borderRadius={radius.full}
                        backgroundColor="$surface"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <X size={iconSizes.md} color={hexColors[theme].text} />
                      </YStack>
                    </TouchableWithoutFeedback>
                  </XStack>

                  <Text.Body color="$text" fontSize={typography.fontSize.caption}>
                    {t('whatIsWrong')}
                  </Text.Body>

                  <View
                    style={{ width: '100%', flexShrink: 0 }}
                    onLayout={(e) => {
                      const { width } = e.nativeEvent.layout;
                      if (width > 0) {
                        setInputWidth(width);
                      }
                    }}
                  >
                    <TextInput
                      value={feedback}
                      onChangeText={(text) => {
                        setFeedback(text);
                        setError('');
                      }}
                      placeholder={t('reportPlaceholder') || 'Enter your feedback...'}
                      placeholderTextColor={hexColors[theme].textMuted}
                      multiline
                      maxLength={1000}
                      editable={!isSubmitting}
                      autoFocus
                      style={textInputStyle}
                    />
                  </View>

                  <XStack justifyContent="space-between" alignItems="center">
                    {error ? (
                      <Text.Label color="#EF4444" fontSize={typography.fontSize.caption}>
                        {error}
                      </Text.Label>
                    ) : (
                      <Text.Label color="$text" fontSize={typography.fontSize.caption}>
                        {feedback.length}/1000
                      </Text.Label>
                    )}
                  </XStack>

                  <XStack gap={spacing.md} marginTop={spacing.sm}>
                    <YStack flex={1}>
                      <Button variant="secondary" onPress={handleClose} disabled={isSubmitting}>
                        {t('cancel')}
                      </Button>
                    </YStack>
                    <YStack flex={1}>
                      <Button
                        variant="primary"
                        onPress={handleSubmit}
                        disabled={isSubmitting || feedback.trim().length === 0}
                      >
                        {isSubmitting ? t('submitting') || 'Submitting...' : t('submit')}
                      </Button>
                    </YStack>
                  </XStack>
                </YStack>
              </ScrollView>
            </TouchableWithoutFeedback>
          </YStack>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}
