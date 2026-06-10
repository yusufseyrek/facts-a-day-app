import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { GlassSurface } from './GlassSurface';
import { InlineOverlay } from './InlineOverlay';
import { ModalBackdrop } from './ModalBackdrop';

/**
 * BottomSheetShell — the shared shell for bottom sheets (ShareSheet grammar).
 *
 * Composes InlineOverlay + the standardized ModalBackdrop scrim + a Liquid
 * Glass sheet backing with rounded TOP corners, drag handle, safe-area bottom
 * padding, and the translateY spring in/out + backdrop fade choreography.
 * Callers only manage a `visible` boolean and render their content as
 * children (the shell provides horizontal/bottom chrome only; children
 * control their own padding):
 *
 *   <BottomSheetShell visible={open} onClose={() => setOpen(false)}>
 *     ...sheet content...
 *   </BottomSheetShell>
 *
 * `dismissible={false}` disables BOTH backdrop tap-to-dismiss and Android
 * hardware back (for forced sheets like the offline paywall).
 *
 * `onClose` fires AFTER the slide-out completes and must drive `visible` to
 * false. External closes (parent flips `visible` directly) also play the
 * slide-out — InlineOverlay keeps the layer mounted through the exit grace.
 */

const SPRING_IN = { duration: 350, dampingRatio: 0.8 } as const;
const SPRING_OUT = { duration: 220, dampingRatio: 1, overshootClamping: true } as const;

const HANDLE_WIDTH = 40;
const HANDLE_HEIGHT = 4;

interface BottomSheetShellProps {
  visible: boolean;
  /** Fired AFTER the slide-out completes. Must drive `visible` to false. */
  onClose?: () => void;
  /** false disables backdrop tap-to-dismiss AND Android hardware back. */
  dismissible?: boolean;
  children: React.ReactNode;
}

export function BottomSheetShell({
  visible,
  onClose,
  dismissible = true,
  children,
}: BottomSheetShellProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const colors = hexColors[theme];
  const insets = useSafeAreaInsets();
  const { spacing, radius, screenHeight } = useResponsive();

  // 0 = hidden (sheet translated off-screen, backdrop transparent), 1 = shown.
  const progress = useSharedValue(0);
  // Measured on layout; until then the screen height keeps the sheet off-screen.
  const sheetHeight = useSharedValue(screenHeight);
  const closingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      progress.value = withSpring(1, SPRING_IN);
    } else if (!closingRef.current) {
      // External close: slide out during InlineOverlay's exit grace window.
      progress.value = withSpring(0, SPRING_OUT);
    }
  }, [visible, progress]);

  const handleClose = useCallback(() => {
    if (closingRef.current || !onClose) return;
    closingRef.current = true;
    progress.value = withSpring(0, SPRING_OUT, () => {
      runOnJS(onClose)();
    });
  }, [onClose, progress]);

  const handleRequestClose = useCallback(() => {
    if (dismissible) handleClose();
  }, [dismissible, handleClose]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * sheetHeight.value }],
  }));

  return (
    <InlineOverlay visible={visible} onRequestClose={handleRequestClose} exitGraceMs={300}>
      {/* Backdrop (fades with the sheet) */}
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <ModalBackdrop
          isDark={isDark}
          blurIntensity={isDark ? 50 : 70}
          androidScrim={isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.55)'}
          onPress={dismissible ? handleClose : undefined}
        />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        onLayout={(e) => {
          sheetHeight.value = e.nativeEvent.layout.height;
        }}
        style={[
          styles.sheet,
          sheetStyle,
          {
            paddingTop: spacing.xs,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
          },
        ]}
      >
        {/* iOS 26: Liquid Glass sheet backing (refracts the scrim/content).
            Stays mounted for the sheet's whole lifetime — remounting it on
            state churn would retrigger its 450ms self-heal remount. */}
        <GlassSurface
          variant="glass"
          isDark={isDark}
          tint={colors.surface}
          glassTint={isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}
          blurIntensity={12}
          // Shape the glass material to the sheet's rounded top corners — the
          // parent's clipping alone leaves the specular rim square there.
          style={[
            StyleSheet.absoluteFill,
            { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
          ]}
          pointerEvents="none"
        />

        {/* Drag handle */}
        <View style={[styles.handleContainer, { paddingVertical: spacing.sm }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {children}
      </Animated.View>
    </InlineOverlay>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
  },
  handle: {
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderRadius: HANDLE_HEIGHT / 2,
  },
});
