import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput } from 'react-native';

import { AVATAR_ICONS, AVATAR_TOKENS } from '../config/avatars';
import { useTranslation } from '../i18n';
import * as api from '../services/api';
import * as userService from '../services/user';
import { hexColors, useTheme } from '../theme';
import { avatarColor } from '../utils/colors';
import { DEFAULT_MAX_FONT_SIZE_MULTIPLIER } from '../utils/responsive';
import { generateScreenName } from '../utils/screenNameGenerator';
import { useResponsive } from '../utils/useResponsive';

import { AvatarDisc } from './AvatarDisc';
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
  /** Current avatar emoji when renaming; null/omitted = none chosen yet. */
  currentAvatar?: string | null;
  /** Where this modal was opened from, for analytics attribution. */
  source?: 'comments' | 'leaderboard' | 'settings';
  /**
   * Present in a window-level Modal on iOS (see DialogShell). Set this when the
   * modal is mounted deep in the tree (e.g. the comments section inside a
   * scrolling fact detail) so the iOS overlay covers the whole screen instead
   * of being clamped to its parent's frame.
   */
  presentInWindow?: boolean;
}

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const NAME_MIN = 3;
const NAME_MAX = 20;

/**
 * Claim or change the unique screen name. Availability is checked live
 * (debounced) against the backend; the actual claim still handles the 409
 * race of two users grabbing the same name between check and submit.
 */
export function ScreenNameModal({
  visible,
  onClose,
  onSaved,
  currentName,
  currentAvatar = null,
  source = 'settings',
  presentInWindow = false,
}: ScreenNameModalProps) {
  const { t, locale } = useTranslation();
  const { theme } = useTheme();
  const { spacing, radius, typography, maxModalWidth, iconSizes, borderWidths } =
    useResponsive();

  const [name, setName] = useState(currentName ?? '');
  const [avatar, setAvatar] = useState<string | null>(currentAvatar);
  const [availability, setAvailability] = useState<Availability>('idle');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed the inputs each time the dialog opens (it stays mounted between).
  useEffect(() => {
    if (visible) {
      setName(currentName ?? '');
      setAvatar(currentAvatar);
      setAvailability('idle');
      setError('');
    }
  }, [visible, currentName, currentAvatar]);

  const trimmed = name.trim();
  const unchanged = currentName !== null && trimmed === currentName;
  const avatarChanged = avatar !== currentAvatar;

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
      const identity = await userService.claimScreenName(trimmed, locale, source, avatar);
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

  // An avatar-only change is a valid submit (rename PATCHes both fields); the
  // name rules still gate it so we never submit an invalid handle.
  const canSubmit =
    !isSubmitting &&
    (!unchanged || avatarChanged) &&
    trimmed.length >= NAME_MIN &&
    availability !== 'taken' &&
    availability !== 'invalid';

  return (
    <DialogShell
      visible={visible}
      onClose={handleClose}
      keyboardAware
      presentInWindow={presentInWindow}
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

        {/* Avatar picker: preview disc + curated emoji grid. Tapping the
            selected emoji again clears back to the initial disc. */}
        <XStack gap={spacing.md} alignItems="center">
          <AvatarDisc
            name={trimmed || '?'}
            avatar={avatar}
            color={avatarColor(trimmed || '?', hexColors[theme])}
            size={iconSizes.xl + spacing.md}
          />
          <YStack flex={1} gap={2}>
            <Text.Label color="$text">{t('avatarPickerTitle')}</Text.Label>
            <Text.Tiny color="$textSecondary">{t('avatarPickerHint')}</Text.Tiny>
          </YStack>
        </XStack>
        <XStack flexWrap="wrap" gap={spacing.xs} justifyContent="center">
          {AVATAR_TOKENS.map((token) => {
            const selected = avatar === token;
            const AvatarIcon = AVATAR_ICONS[token];
            return (
              <Pressable
                key={token}
                onPress={() => setAvatar(selected ? null : token)}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel={token}
                accessibilityState={{ selected }}
                style={({ pressed }) => ({
                  width: iconSizes.xl,
                  height: iconSizes.xl,
                  borderRadius: iconSizes.xl / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected
                    ? hexColors[theme].primaryLight
                    : hexColors[theme].surface,
                  borderWidth: selected ? 2 : borderWidths.hairline,
                  borderColor: selected ? hexColors[theme].primary : hexColors[theme].border,
                  opacity: pressed ? 0.7 : 1,
                  transform: [{ scale: pressed ? 0.92 : 1 }],
                })}
              >
                <AvatarIcon
                  size={iconSizes.xl * 0.52}
                  color={selected ? hexColors[theme].primary : hexColors[theme].textSecondary}
                />
              </Pressable>
            );
          })}
        </XStack>

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
            // No autoFocus: the keyboard would cover the avatar grid the
            // moment the dialog opens; picking an avatar comes first now.
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
