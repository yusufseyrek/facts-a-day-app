import { useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { X } from '@tamagui/lucide-icons';
import { XStack, YStack } from 'tamagui';

import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { DEFAULT_MAX_FONT_SIZE_MULTIPLIER } from '../utils/responsive';
import { useResponsive } from '../utils/useResponsive';

import { Button } from './Button';
import { InlineOverlay } from './InlineOverlay';
import { ModalBackdrop } from './ModalBackdrop';
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
      backgroundColor: '$cardBackground',
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: '$border',
      width: '100%' as const,
      maxWidth: 500,
      padding: spacing.lg,
      gap: spacing.md,
      flexShrink: 0,
      alignSelf: 'center' as const,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: theme === 'dark' ? 0.5 : 0.25,
          shadowRadius: 24,
        },
        android: {
          elevation: 12,
        },
      }),
    }),
    [spacing, radius, theme]
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
    // coverNavigationBar={false}: this dialog hosts a TEXT INPUT (autoFocus).
    // An edge-to-edge Android dialog window loses the framework's adjustResize
    // keyboard handling — the card ended up bottom-clipped behind the
    // keyboard. Fitting system windows restores the resize, and KAV is then
    // only needed on iOS.
    <InlineOverlay visible={visible} onRequestClose={handleClose} coverNavigationBar={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Glass/blur scrim behind the (opaque) report card */}
        <ModalBackdrop
          isDark={theme === 'dark'}
          blurIntensity={50}
          androidScrim="rgba(0,0,0,0.5)"
        />
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <YStack
            flex={1}
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
                overScrollMode="never"
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
                    <Pressable
                      onPress={handleClose}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                      role="button"
                      aria-label={t('cancel')}
                    >
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
                    </Pressable>
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
                      <Text.Label
                        color={hexColors[theme].error}
                        fontSize={typography.fontSize.caption}
                      >
                        {error}
                      </Text.Label>
                    ) : (
                      <Text.Label color="$textSecondary" fontSize={typography.fontSize.caption}>
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
    </InlineOverlay>
  );
}
