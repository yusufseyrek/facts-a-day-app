import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { XStack, YStack } from 'tamagui';

import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { DEFAULT_MAX_FONT_SIZE_MULTIPLIER } from '../utils/responsive';
import { useResponsive } from '../utils/useResponsive';

import { CloseButton } from './CloseButton';
import { DialogButton, DialogShell } from './DialogShell';
import { Text } from './Typography';

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
  const { spacing, radius, typography } = useResponsive();
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
    // keyboardAware: hosts an autoFocus TextInput — keeps the Android dialog
    // window out of edge-to-edge mode (adjustResize) and adds an iOS KAV.
    <DialogShell
      visible={visible}
      onClose={handleClose}
      keyboardAware
      maxWidth={500}
      footer={
        <>
          <DialogButton
            variant="outline"
            label={t('cancel')}
            onPress={handleClose}
            disabled={isSubmitting}
          />
          <DialogButton
            label={isSubmitting ? t('submitting') || 'Submitting...' : t('submit')}
            onPress={handleSubmit}
            disabled={isSubmitting || feedback.trim().length === 0}
          />
        </>
      }
    >
      <YStack
        paddingHorizontal={spacing.lg}
        paddingTop={spacing.lg}
        paddingBottom={spacing.md}
        gap={spacing.md}
      >
        <XStack justifyContent="space-between" alignItems="center" marginBottom={spacing.sm}>
          <Text.Title>{t('reportFact')}</Text.Title>
          <CloseButton onPress={handleClose} label={t('cancel')} />
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
            maxFontSizeMultiplier={DEFAULT_MAX_FONT_SIZE_MULTIPLIER}
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
            <Text.Label color={hexColors[theme].error} fontSize={typography.fontSize.caption}>
              {error}
            </Text.Label>
          ) : (
            <Text.Label color="$textSecondary" fontSize={typography.fontSize.caption}>
              {feedback.length}/1000
            </Text.Label>
          )}
        </XStack>
      </YStack>
    </DialogShell>
  );
}
