import React, { useState } from 'react';
import { Modal, TextInput, Keyboard, Platform, TouchableWithoutFeedback, KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { styled } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import { hexColors, spacing, radius, useTheme } from '../theme';
import { Text } from './Typography';
import { Button } from './Button';
import { useTranslation } from '../i18n';
import { useResponsive } from '../utils/useResponsive';

interface ReportFactModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (feedback: string) => Promise<void>;
  isSubmitting: boolean;
}

const Overlay = styled(YStack, {
  flex: 1,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  justifyContent: 'center',
  alignItems: 'center',
  padding: spacing.phone.lg,
});

const ModalContainer = styled(YStack, {
  backgroundColor: '$background',
  borderRadius: radius.phone.lg,
  width: '100%',
  maxWidth: 500,
  padding: spacing.phone.lg,
  gap: spacing.phone.md,
  flexShrink: 0,
  alignSelf: 'center',
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
});

const Header = styled(XStack, {
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing.phone.sm,
});

const CloseButton = styled(YStack, {
  width: 32,
  height: 32,
  borderRadius: radius.phone.full,
  backgroundColor: '$surface',
  alignItems: 'center',
  justifyContent: 'center',
});

const StyledTextInput = styled(TextInput, {
  backgroundColor: '$surface',
  borderRadius: radius.phone.md,
  padding: spacing.phone.md,
  minHeight: 120,
  maxHeight: 200,
  textAlignVertical: 'top',
  borderWidth: 1,
  borderColor: '$border',
  alignSelf: 'stretch',
});

const ButtonRow = styled(XStack, {
  gap: spacing.phone.md,
  marginTop: spacing.phone.sm,
});

export function ReportFactModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
}: ReportFactModalProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { typography, iconSizes } = useResponsive();
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
          <Overlay>
            <TouchableWithoutFeedback>
              <ScrollView
                contentContainerStyle={{ 
                  flexGrow: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingVertical: spacing.phone.lg,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <ModalContainer>
                  <Header>
                    <Text.Title>{t('reportFact')}</Text.Title>
                    <TouchableWithoutFeedback onPress={handleClose}>
                      <CloseButton>
                        <X size={iconSizes.md} color={hexColors[theme].text} />
                      </CloseButton>
                    </TouchableWithoutFeedback>
                  </Header>

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
                    <StyledTextInput
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
                      style={{ 
                        fontSize: typography.fontSize.body, 
                        color: hexColors[theme].text,
                        width: inputWidth || '100%',
                      }}
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

                  <ButtonRow>
                    <YStack flex={1}>
                      <Button
                        variant="secondary"
                        onPress={handleClose}
                        disabled={isSubmitting}
                      >
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
                  </ButtonRow>
                </ModalContainer>
              </ScrollView>
            </TouchableWithoutFeedback>
          </Overlay>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}
