import React, { useState } from 'react';
import { Modal, TextInput, Keyboard, Platform, TouchableWithoutFeedback } from 'react-native';
import { styled } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import { tokens } from '../theme/tokens';
import { H2, BodyText, LabelText } from './Typography';
import { Button } from './Button';
import { useTranslation } from '../i18n';

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
  padding: tokens.space.lg,
});

const ModalContainer = styled(YStack, {
  backgroundColor: '$background',
  borderRadius: tokens.radius.lg,
  width: '100%',
  maxWidth: 500,
  padding: tokens.space.lg,
  gap: tokens.space.md,
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
  marginBottom: tokens.space.sm,
});

const CloseButton = styled(YStack, {
  width: 32,
  height: 32,
  borderRadius: tokens.radius.full,
  backgroundColor: '$surface',
  alignItems: 'center',
  justifyContent: 'center',
});

const StyledTextInput = styled(TextInput, {
  backgroundColor: '$surface',
  borderRadius: tokens.radius.md,
  padding: tokens.space.md,
  minHeight: 120,
  maxHeight: 200,
  textAlignVertical: 'top',
  borderWidth: 1,
  borderColor: '$border',
});

const ButtonRow = styled(XStack, {
  gap: tokens.space.md,
  marginTop: tokens.space.sm,
});

export function ReportFactModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
}: ReportFactModalProps) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <Overlay>
          <TouchableWithoutFeedback>
            <ModalContainer>
              <Header>
                <H2>{t('reportFact')}</H2>
                <TouchableWithoutFeedback onPress={handleClose}>
                  <CloseButton>
                    <X size={20} color={tokens.color.dark.text} />
                  </CloseButton>
                </TouchableWithoutFeedback>
              </Header>

              <BodyText color="$text" fontSize={14}>
                {t('whatIsWrong')}
              </BodyText>

              <StyledTextInput
                value={feedback}
                onChangeText={(text) => {
                  setFeedback(text);
                  setError('');
                }}
                placeholder={t('reportPlaceholder') || 'Enter your feedback...'}
                placeholderTextColor={tokens.color.dark.text}
                multiline
                maxLength={1000}
                editable={!isSubmitting}
                autoFocus
                style={{ fontSize: 16, color: tokens.color.dark.text }}
              />

              <XStack justifyContent="space-between" alignItems="center">
                {error ? (
                  <LabelText color="#EF4444" fontSize={12}>
                    {error}
                  </LabelText>
                ) : (
                  <LabelText color="$text" fontSize={12}>
                    {feedback.length}/1000
                  </LabelText>
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
          </TouchableWithoutFeedback>
        </Overlay>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
