import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

import { LAYOUT } from '../config/app';
import { registerModalPresent } from '../services/modalPresence';
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
 * handling) and, on iOS, lifts the card above the keyboard by reserving its
 * height as bottom padding on the centred layer (see the keyboard effect).
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
   * edge-to-edge mode (restores adjustResize) and, on iOS, lifts the card
   * above the keyboard (reserves keyboard height as bottom padding).
   */
  keyboardAware?: boolean;
  /** Card max width; defaults to LAYOUT.MAX_CONTENT_WIDTH. */
  maxWidth?: number;
  /**
   * Present in a real window-level Modal on iOS too (see InlineOverlay's
   * `forceWindow`). Required when the dialog is mounted deep in the tree (e.g.
   * inside a scrolling section) rather than at the screen root, otherwise the
   * iOS inline overlay is clamped to its parent's frame. Costs Liquid Glass
   * refraction (flat blur instead). Default off for screen-root dialogs.
   */
  presentInWindow?: boolean;
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
  presentInWindow = false,
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

  // While the dialog is up, suppress the persistent tab-bar banner. On iOS the
  // banner is an in-window sibling painted ABOVE this overlay (see
  // modalPresence), so it would otherwise float over the backdrop and cover a
  // tall dialog's footer — the notification time picker's Save button being the
  // reported case. The release is deferred by the overlay's exit grace (the
  // backdrop stays mounted that long — see InlineOverlay's exitGraceMs below) so
  // the banner doesn't flash back over the still-fading scrim; a reopen within
  // that window re-registers and keeps it hidden (ref-counted, idempotent
  // release, so firing late or after unmount is harmless).
  useEffect(() => {
    if (!visible) return;
    const release = registerModalPresent();
    return () => {
      setTimeout(release, EXIT_MS + 40);
    };
  }, [visible]);

  // iOS keyboard avoidance — done manually, NOT via KeyboardAvoidingView. The
  // inline overlay bleeds past the parent's safe area (negative insets), so a
  // KAV's frame coordinates don't line up with the keyboard's screen frame and
  // its `padding` overlap is mis-computed — the card ends up off-centre. Instead
  // we reserve the keyboard's height as bottom padding on the full-screen
  // centred layer, which keeps the card centred in the visible area above the
  // keyboard. (Android relies on the dialog window's adjustResize — see
  // InlineOverlay's `coverNavigationBar`.)
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (!keyboardAware || Platform.OS !== 'ios') return;
    const animate = (duration: number) =>
      LayoutAnimation.configureNext({
        duration: duration || 250,
        update: { type: LayoutAnimation.Types.keyboard },
      });
    const onShow = (e: { duration: number; endCoordinates: { height: number } }) => {
      animate(e.duration);
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    };
    const onHide = (e: { duration: number }) => {
      animate(e?.duration);
      setKeyboardHeight(0);
    };
    const showSub = Keyboard.addListener('keyboardWillShow', onShow);
    const hideSub = Keyboard.addListener('keyboardWillHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardAware]);

  // The centered card layer. `box-none` lets taps on empty space fall through
  // to the backdrop's dismiss Pressable beneath — only the card takes touches.
  const cardLayer = (
    <YStack
      flex={1}
      justifyContent="center"
      alignItems="center"
      padding={spacing.md}
      paddingBottom={spacing.md + keyboardHeight}
      pointerEvents="box-none"
    >
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
      forceWindow={presentInWindow}
    >
      {/* Backdrop fills the WHOLE overlay and sits OUTSIDE the keyboard-avoiding
          layer: an open keyboard (autoFocus inputs) must never shrink the scrim
          — that would leave the area behind the keyboard unblurred and push the
          card off-centre. Only the card lifts above the keyboard. Stays mounted
          while the overlay is up (only the card toggles with showContent) so the
          GlassSurface doesn't retrigger its 450ms self-heal remount. */}
      <ModalBackdrop
        isDark={isDark}
        blurIntensity={isDark ? 50 : 70}
        androidScrim={isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.55)'}
        dim={dimOverride}
        onPress={dismissible ? requestClose : undefined}
      />
      {cardLayer}
    </InlineOverlay>
  );
}
