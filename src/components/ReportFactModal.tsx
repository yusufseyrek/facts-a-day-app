import React, { useState } from 'react';
import { Modal, TextInput, Keyboard, Platform, TouchableWithoutFeedback, KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { styled } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import { tokens, useTheme } from '../theme';
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
  alignSelf: 'stretch',
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
  const { theme } = useTheme();
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
                  paddingVertical: tokens.space.lg,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <ModalContainer>
                  <Header>
                    <H2>{t('reportFact')}</H2>
                    <TouchableWithoutFeedback onPress={handleClose}>
                      <CloseButton>
                        <X size={20} color={tokens.color[theme].text} />
                      </CloseButton>
                    </TouchableWithoutFeedback>
                  </Header>

                  <BodyText color="$text" fontSize={14}>
                    {t('whatIsWrong')}
                  </BodyText>

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
                      placeholderTextColor={tokens.color[theme].textMuted}
                      multiline
                      maxLength={1000}
                      editable={!isSubmitting}
                      autoFocus
                      style={{ 
                        fontSize: 16, 
                        color: tokens.color[theme].text,
                        width: inputWidth || '100%',
                      }}
                    />
                  </View>

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
              </ScrollView>
            </TouchableWithoutFeedback>
          </Overlay>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}
