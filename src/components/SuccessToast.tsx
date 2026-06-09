import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { CheckCircle } from '@tamagui/lucide-icons';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { hexColors, useTheme } from '../theme';
import { absoluteFillObject } from '../utils/styles';
import { useResponsive } from '../utils/useResponsive';

import { GlassSurface } from './GlassSurface';
import { InlineOverlay } from './InlineOverlay';
import { Text } from './Typography';

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
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  // Internal state to properly manage Modal visibility
  const [modalVisible, setModalVisible] = useState(false);
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

  // iOS 26: float the toast card on Liquid Glass; keep the opaque card elsewhere.
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const glassTint = isDark ? 'rgba(20,34,56,0.6)' : 'rgba(255,255,255,0.65)';

  useEffect(() => {
    if (visible) {
      // Show modal first
      setModalVisible(true);

      // Reset animation values first
      opacity.setValue(0);
      scale.setValue(0.8);

      // Fade in and scale up
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-hide after duration
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.8,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Close the modal first, then notify parent after a small delay
          // to ensure the modal has properly closed
          setModalVisible(false);
          setTimeout(() => {
            onHideRef.current?.();
          }, 50);
        });
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, opacity, scale]);

  const containerStyle = useMemo(
    () => ({
      alignItems: 'center' as const,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.xxl,
      borderRadius: radius.lg,
      // Glass paints the fill; clip it to the rounded card and drop the opaque bg.
      overflow: useGlass ? ('hidden' as const) : ('visible' as const),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 5,
      minWidth: 200,
    }),
    [spacing, radius, useGlass]
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

  if (!visible && !modalVisible) return null;

  // Rendered inline (not in a <Modal>) so the glass card refracts the live screen
  // behind it. The toast manages its own fade-out lifecycle via `modalVisible`,
  // so InlineOverlay's own grace window is disabled. A toast is not
  // back-dismissible, so hardware back is a no-op.
  return (
    <InlineOverlay visible={modalVisible} onRequestClose={noop} exitGraceMs={0}>
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View
          style={[
            containerStyle,
            {
              backgroundColor: useGlass ? 'transparent' : backgroundColor,
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          {useGlass ? (
            <GlassSurface
              variant="glass"
              isDark={isDark}
              tint={backgroundColor}
              glassTint={glassTint}
              style={absoluteFillObject}
            />
          ) : null}
          <View style={[iconContainerStyle, { backgroundColor: `${successColor}20` }]}>
            {icon || <CheckCircle size={iconSizes.xl} color={successColor} />}
          </View>
          <Text.Label textAlign="center" color={textColor}>
            {message}
          </Text.Label>
        </Animated.View>
      </View>
    </InlineOverlay>
  );
};

const noop = () => {};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
