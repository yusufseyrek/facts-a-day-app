import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput } from 'react-native';

import { useTranslation } from '../i18n';
import * as api from '../services/api';
import * as userService from '../services/user';
import { hexColors, useTheme } from '../theme';
import { DEFAULT_MAX_FONT_SIZE_MULTIPLIER } from '../utils/responsive';
import { generateScreenName } from '../utils/screenNameGenerator';
import { useResponsive } from '../utils/useResponsive';

import { DialogButton, DialogShell } from './DialogShell';
import { Shuffle } from './icons';
import { XStack, YStack } from './Stacks';
import { Text } from './Typography';

interface ScreenNameModalProps {
  visible: boolean;
  onClose: () => void;
  /** Fires with the saved name after a successful claim/rename. */
  onSaved: (screenName: string) => void;
  /** Current name when renaming; null when claiming for the first time. */
  currentName: string | null;
}

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const NAME_MIN = 3;
const NAME_MAX = 20;

/**
 * Claim or change the unique screen name. Availability is checked live
 * (debounced) against the backend; the actual claim still handles the 409
 * race of two users grabbing the same name between check and submit.
 */
export function ScreenNameModal({ visible, onClose, onSaved, currentName }: ScreenNameModalProps) {
  const { t, locale } = useTranslation();
  const { theme } = useTheme();
  const { spacing, radius, typography, maxModalWidth, iconSizes, borderWidths } =
    useResponsive();

  const [name, setName] = useState(currentName ?? '');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed the input each time the dialog opens (it stays mounted between).
  useEffect(() => {
    if (visible) {
      setName(currentName ?? '');
      setAvailability('idle');
      setError('');
    }
  }, [visible, currentName]);

  const trimmed = name.trim();
  const unchanged = currentName !== null && trimmed === currentName;

  // Debounced live availability. Local-format failures short-circuit without
  // a request; the network check is best-effort (errors fall back to idle so
  // submission stays possible).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setError('');
    if (!visible || trimmed.length === 0 || unchanged) {
      setAvailability('idle');
      return;
    }
    if (!userService.SCREEN_NAME_RE.test(trimmed)) {
      setAvailability('invalid');
      return;
    }
    setAvailability('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.checkScreenName(trimmed);
        setAvailability(!res.valid ? 'invalid' : res.available ? 'available' : 'taken');
      } catch {
        setAvailability('idle');
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmed, visible, unchanged]);

  const handleClose = () => {
    setName(currentName ?? '');
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!userService.SCREEN_NAME_RE.test(trimmed)) {
      setError(t('screenNameInvalid'));
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const identity = await userService.claimScreenName(trimmed, locale);
      onSaved(identity.screenName);
      onClose();
    } catch (err) {
      if (err instanceof userService.ScreenNameTakenError) {
        setAvailability('taken');
        setError(t('screenNameTaken'));
      } else {
        setError(t('screenNameSaveFailed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusLine = useMemo(() => {
    switch (availability) {
      case 'checking':
        return { text: t('screenNameChecking'), color: hexColors[theme].textSecondary };
      case 'available':
        return { text: t('screenNameAvailable'), color: hexColors[theme].success };
      case 'taken':
        return { text: t('screenNameTaken'), color: hexColors[theme].error };
      case 'invalid':
        return { text: t('screenNameInvalid'), color: hexColors[theme].error };
      default:
        return null;
    }
  }, [availability, t, theme]);

  const canSubmit =
    !isSubmitting &&
    !unchanged &&
    trimmed.length >= NAME_MIN &&
    availability !== 'taken' &&
    availability !== 'invalid';

  return (
    <DialogShell
      visible={visible}
      onClose={handleClose}
      keyboardAware
      title={currentName ? t('screenNameChangeTitle') : t('screenNameTitle')}
      showClose
      maxWidth={maxModalWidth}
      footer={
        <>
          <DialogButton
            variant="outline"
            label={t('cancel')}
            onPress={handleClose}
            disabled={isSubmitting}
          />
          <DialogButton
            label={isSubmitting ? t('loading') : t('save')}
            onPress={handleSubmit}
            disabled={!canSubmit}
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
        <Text.Caption color="$textSecondary">{t('screenNameHint')}</Text.Caption>

        <XStack gap={spacing.sm} alignItems="stretch" style={{ flexShrink: 0 }}>
          <TextInput
            maxFontSizeMultiplier={DEFAULT_MAX_FONT_SIZE_MULTIPLIER}
            value={name}
            onChangeText={setName}
            placeholder={t('screenNamePlaceholder')}
            placeholderTextColor={hexColors[theme].textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={NAME_MAX}
            editable={!isSubmitting}
            autoFocus
            style={{
              flex: 1,
              backgroundColor: hexColors[theme].surface,
              borderRadius: radius.md,
              padding: spacing.md,
              borderWidth: borderWidths.hairline,
              borderColor: hexColors[theme].border,
              fontSize: typography.fontSize.body,
              color: hexColors[theme].text,
            }}
          />
          {/* Dice roll: fills the input; the debounced availability check
              fires through onChange state like any typed value. */}
          <Pressable
            onPress={() => setName(generateScreenName())}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={t('screenNameRandomize')}
            accessibilityState={{ disabled: isSubmitting }}
            style={({ pressed }) => ({
              opacity: isSubmitting ? 0.4 : pressed ? 0.7 : 1,
              transform: [{ scale: pressed && !isSubmitting ? 0.95 : 1 }],
              justifyContent: 'center',
              alignItems: 'center',
              aspectRatio: 1,
              backgroundColor: hexColors[theme].surface,
              borderRadius: radius.md,
              borderWidth: borderWidths.hairline,
              borderColor: hexColors[theme].border,
            })}
          >
            <Shuffle size={iconSizes.sm} color={hexColors[theme].primary} />
          </Pressable>
        </XStack>

        <XStack
          justifyContent="space-between"
          alignItems="center"
          minHeight={typography.lineHeight.caption}
        >
          {error ? (
            <Text.Label
              color={hexColors[theme].error}
              fontSize={typography.fontSize.caption}
              numberOfLines={1}
            >
              {error}
            </Text.Label>
          ) : statusLine ? (
            <Text.Label
              color={statusLine.color}
              fontSize={typography.fontSize.caption}
              numberOfLines={1}
            >
              {statusLine.text}
            </Text.Label>
          ) : (
            <Text.Label color="$textSecondary" fontSize={typography.fontSize.caption}>
              {trimmed.length}/{NAME_MAX}
            </Text.Label>
          )}
        </XStack>
      </YStack>
    </DialogShell>
  );
}
