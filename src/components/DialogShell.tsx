import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

import { LAYOUT } from '../config/app';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { CloseButton } from './CloseButton';
import { InlineOverlay } from './InlineOverlay';
import { ModalBackdrop } from './ModalBackdrop';
import { XStack, YStack } from './Stacks';
import { FONT_FAMILIES, Text } from './Typography';

/**
 * DialogShell — the shared shell for centered dialogs.
 *
 * Composes InlineOverlay + ModalBackdrop + the standard animated card
 * (TriviaIntroModal grammar: full-width card inside a padded centered layer,
 * maxWidth-clamped, radius.xl, standard drop shadow) and OWNS the open/close
 * choreography. Callers only manage a `visible` boolean:
 *
 *   <DialogShell
 *     visible={open}
 *     onClose={() => setOpen(false)}
 *     title={t('x')}
 *     showClose
 *     footer={<DialogButton label={t('ok')} onPress={confirm} />}
 *   >
 *     ...body (caller controls its own padding)...
 *   </DialogShell>
 *
 * Close choreography (generalized from ThemePickerModal): on Android the
 * dialog lives in a real RN <Modal> (see InlineOverlay), where a reanimated
 * `exiting` animation would be cut off at unmount. The shell therefore keeps
 * internal `showContent` state — closing first unmounts the card (playing
 * FadeOutDown), then calls `onClose` after the exit duration, while
 * InlineOverlay's exit grace keeps the overlay mounted. External closes
 * (parent flips `visible` false, e.g. after a confirm action) take the same
 * exit-grace path, so the exit animation plays either way.
 *
 * Slots: `headerIcon` (tinted circle, TriviaExitModal pattern) + `title`
 * render the standardized centered header with a divider; `footer` renders
 * the standard padded button row. Anything bespoke goes in `children`.
 *
 * `keyboardAware` is for dialogs hosting text inputs: it disables the
 * edge-to-edge Android dialog window (which loses adjustResize keyboard
 * handling) and adds an iOS KeyboardAvoidingView.
 */

const ENTER_MS = 180;
const EXIT_MS = 150;

/** The standard dialog card drop shadow (also used by toast-style cards). */
export function dialogCardShadow(isDark: boolean): ViewStyle {
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0.5 : 0.25,
    shadowRadius: 24,
    elevation: 24,
  };
}

interface DialogCardProps {
  children: ReactNode;
  /** Extra style for the shadow wrapper (e.g. explicit width). */
  style?: StyleProp<ViewStyle>;
}

/**
 * DialogCard — the standard dialog card WITHOUT overlay/animation, for
 * surfaces that supply their own presentation layer (FactModal premium gate,
 * toasts). DialogShell composes this internally.
 */
export function DialogCard({ children, style }: DialogCardProps) {
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const { radius } = useResponsive();

  return (
    <View
      style={[
        { width: '100%', maxWidth: LAYOUT.MAX_CONTENT_WIDTH },
        dialogCardShadow(theme === 'dark'),
        style,
      ]}
    >
      <YStack
        width="100%"
        borderRadius={radius.xl}
        overflow="hidden"
        backgroundColor={colors.cardBackground}
      >
        {children}
      </YStack>
    </View>
  );
}

interface DialogButtonProps {
  label: string;
  onPress: () => void;
  /** outline = cancel, solid = primary confirm, destructive = error confirm. */
  variant?: 'outline' | 'solid' | 'destructive';
  /** Optional leading icon (caller sizes/colors it; white for solid variants). */
  icon?: ReactNode;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * DialogButton — the standard dialog footer button (TriviaExitModal grammar):
 * outlined cancel / solid confirm / solid destructive. Flexes to share the
 * footer row equally with its siblings.
 */
export function DialogButton({
  label,
  onPress,
  variant = 'solid',
  icon,
  disabled = false,
  testID,
  accessibilityLabel,
}: DialogButtonProps) {
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const { typography, spacing, radius } = useResponsive();

  const isOutline = variant === 'outline';
  const backgroundColor = isOutline
    ? 'transparent'
    : variant === 'destructive'
      ? colors.error
      : colors.primary;
  const labelColor = isOutline ? colors.text : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({
        flex: 1,
        opacity: disabled ? 0.4 : pressed ? (isOutline ? 0.8 : 0.9) : 1,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}
    >
      <XStack
        backgroundColor={backgroundColor}
        borderWidth={isOutline ? 1.5 : 0}
        borderColor={isOutline ? colors.border : 'transparent'}
        paddingVertical={spacing.md}
        borderRadius={radius.md}
        alignItems="center"
        justifyContent="center"
        gap={spacing.xs}
      >
        {icon}
        <Text.Label
          fontSize={typography.fontSize.body}
          fontFamily={FONT_FAMILIES.semibold}
          color={labelColor}
        >
          {label}
        </Text.Label>
      </XStack>
    </Pressable>
  );
}

interface DialogShellProps {
  visible: boolean;
  /** Fired AFTER the exit animation completes. Must drive `visible` to false. */
  onClose: () => void;
  /** false disables backdrop tap-to-dismiss AND Android hardware back. */
  dismissible?: boolean;
  /** Override the Liquid Glass dim layer (see ModalBackdrop's `dim`). */
  dimOverride?: string;
  /** Icon element rendered in a tinted circle above the title. */
  headerIcon?: ReactNode;
  /** Background of the header icon circle (e.g. low-alpha accent). */
  headerIconTint?: string;
  title?: string;
  /** Absolute top-right X close affordance. */
  showClose?: boolean;
  closeTestID?: string;
  /** Standard footer row (gap-separated DialogButtons). */
  footer?: ReactNode;
  /**
   * For dialogs with TEXT INPUTS: keeps the Android dialog window out of
   * edge-to-edge mode (restores adjustResize) and adds an iOS
   * KeyboardAvoidingView.
   */
  keyboardAware?: boolean;
  /** Card max width; defaults to LAYOUT.MAX_CONTENT_WIDTH. */
  maxWidth?: number;
  children?: ReactNode;
}

export function DialogShell({
  visible,
  onClose,
  dismissible = true,
  dimOverride,
  headerIcon,
  headerIconTint,
  title,
  showClose = false,
  closeTestID,
  footer,
  keyboardAware = false,
  maxWidth = LAYOUT.MAX_CONTENT_WIDTH,
  children,
}: DialogShellProps) {
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const { spacing, iconSizes } = useResponsive();

  // Two-phase close (ThemePickerModal pattern): unmount the card first so its
  // exiting animation plays, notify the parent only after it finishes.
  const [showContent, setShowContent] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setShowContent(true);
      closingRef.current = false;
    } else if (!closingRef.current) {
      // External close (parent flipped `visible`, e.g. after a confirm).
      setShowContent(false);
    }
  }, [visible]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setShowContent(false);
    setTimeout(() => {
      onClose();
      closingRef.current = false;
    }, EXIT_MS);
  }, [onClose]);

  const handleRequestClose = useCallback(() => {
    if (dismissible) requestClose();
  }, [dismissible, requestClose]);

  const content = (
    <YStack flex={1} justifyContent="center" alignItems="center" padding={spacing.md}>
      {/* Backdrop stays mounted while the overlay is up (only the card toggles
          with showContent) — remounting GlassSurface on state churn would
          retrigger its 450ms self-heal remount. */}
      <ModalBackdrop
        isDark={isDark}
        blurIntensity={isDark ? 50 : 70}
        androidScrim={isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.55)'}
        dim={dimOverride}
        onPress={dismissible ? requestClose : undefined}
      />

      {showContent && (
        <Animated.View
          entering={FadeInUp.duration(ENTER_MS)}
          exiting={FadeOutDown.duration(EXIT_MS)}
          style={{ width: '100%', maxWidth }}
        >
          <DialogCard>
            {showClose && (
              <CloseButton
                onPress={requestClose}
                testID={closeTestID}
                style={{ position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 10 }}
              />
            )}

            {(headerIcon || title) && (
              <>
                <YStack
                  paddingTop={spacing.xl}
                  paddingHorizontal={spacing.lg}
                  paddingBottom={spacing.md}
                  alignItems="center"
                  gap={spacing.md}
                >
                  {headerIcon && (
                    <YStack
                      width={iconSizes.heroLg}
                      height={iconSizes.heroLg}
                      borderRadius={iconSizes.heroLg / 2}
                      backgroundColor={headerIconTint ?? colors.surface}
                      justifyContent="center"
                      alignItems="center"
                    >
                      {headerIcon}
                    </YStack>
                  )}
                  {title && (
                    <Text.Title color={colors.text} textAlign="center">
                      {title}
                    </Text.Title>
                  )}
                </YStack>
                <YStack height={1} backgroundColor={colors.border} marginHorizontal={spacing.lg} />
              </>
            )}

            {children}

            {footer && (
              <XStack paddingHorizontal={spacing.lg} paddingBottom={spacing.lg} gap={spacing.md}>
                {footer}
              </XStack>
            )}
          </DialogCard>
        </Animated.View>
      )}
    </YStack>
  );

  return (
    <InlineOverlay
      visible={visible}
      onRequestClose={handleRequestClose}
      exitGraceMs={EXIT_MS + 40}
      coverNavigationBar={!keyboardAware}
    >
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </InlineOverlay>
  );
}
