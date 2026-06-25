import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type EntryExitAnimationFunction,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { dialogCardShadow } from './DialogShell';
import { CheckCircle } from './icons';
import { InlineOverlay } from './InlineOverlay';
import { Text } from './Typography';

const ENTER_MS = 200;
const EXIT_MS = 200;

// Fade + subtle scale pop (ports the legacy Animated.parallel choreography:
// 200ms fade with a sprung 0.8 -> 1 scale, reversed on exit).
const toastEnter: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.8 }] },
    animations: {
      opacity: withTiming(1, { duration: ENTER_MS }),
      transform: [{ scale: withSpring(1, { duration: 350, dampingRatio: 0.8 }) }],
    },
  };
};

const toastExit: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: EXIT_MS }),
      transform: [{ scale: withTiming(0.8, { duration: EXIT_MS }) }],
    },
  };
};

interface SuccessToastProps {
  visible: boolean;
  message: string;
  /** Duration in milliseconds before auto-hide (default: 1500) */
  duration?: number;
  onHide?: () => void;
  /** Custom icon to replace the default CheckCircle */
  icon?: React.ReactNode;
}

export const SuccessToast: React.FC<SuccessToastProps> = ({
  visible,
  message,
  duration = 1500,
  onHide,
  icon,
}) => {
  const { theme } = useTheme();
  const { spacing, radius, iconSizes } = useResponsive();

  // Two-phase visibility: the card unmounts first (playing its exit animation
  // inside InlineOverlay's grace window), then the parent is notified.
  const [showContent, setShowContent] = useState(false);
  const onHideRef = useRef(onHide);

  // Keep onHide ref updated to avoid stale closure issues
  useEffect(() => {
    onHideRef.current = onHide;
  }, [onHide]);

  // Theme-aware colors
  const colors = hexColors[theme];
  const isDark = theme === 'dark';
  const successColor = colors.success;
  const backgroundColor = colors.cardBackground;
  const textColor = colors.text;

  useEffect(() => {
    if (!visible) {
      setShowContent(false);
      return;
    }

    setShowContent(true);

    let notifyTimer: ReturnType<typeof setTimeout> | undefined;
    const autoHideTimer = setTimeout(() => {
      setShowContent(false);
      // Notify the parent only after the exit animation has finished.
      notifyTimer = setTimeout(() => {
        onHideRef.current?.();
      }, EXIT_MS + 50);
    }, duration);

    return () => {
      clearTimeout(autoHideTimer);
      if (notifyTimer) clearTimeout(notifyTimer);
    };
  }, [visible, duration]);

  const containerStyle = useMemo(
    () => ({
      alignItems: 'center' as const,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.xxl,
      borderRadius: radius.xl,
      // Solid opaque card (no native glass): the fill is part of the JS view tree
      // so it fades in together with the icon and text under the same entering
      // animation. A native GlassView paints its material a frame (or, mounted
      // mid-transition, up to ~450ms) late and masks anything behind it while
      // empty, which made the icon/text briefly float over nothing — exactly the
      // bug this avoids. A 1.5s toast doesn't need live refraction.
      backgroundColor,
      minWidth: 200,
      ...dialogCardShadow(isDark),
    }),
    [spacing, radius, backgroundColor, isDark]
  );

  const iconContainerStyle = useMemo(
    () => ({
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginBottom: spacing.md,
    }),
    [spacing]
  );

  if (!visible && !showContent) return null;

  // Rendered inline (not in a <Modal>) so the toast floats over the live screen.
  // No scrim: a toast floats over the app without dimming it. A toast is not
  // back-dismissible, so hardware back is a no-op.
  return (
    <InlineOverlay
      visible={showContent}
      onRequestClose={noop}
      exitGraceMs={EXIT_MS + 40}
      passthrough
    >
      <View style={styles.overlay} pointerEvents="box-none">
        {showContent && (
          <Animated.View entering={toastEnter} exiting={toastExit} style={containerStyle}>
            <View style={[iconContainerStyle, { backgroundColor: `${successColor}20` }]}>
              {icon || <CheckCircle size={iconSizes.xl} color={successColor} />}
            </View>
            <Text.Label textAlign="center" color={textColor}>
              {message}
            </Text.Label>
          </Animated.View>
        )}
      </View>
    </InlineOverlay>
  );
};

const noop = () => {};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
