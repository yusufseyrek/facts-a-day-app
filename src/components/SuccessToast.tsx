import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, Text, Modal } from 'react-native';
import { CheckCircle } from '@tamagui/lucide-icons';
import { useTheme } from '../theme';
import { tokens } from '../theme/tokens';

interface SuccessToastProps {
  visible: boolean;
  message: string;
  /** Duration in milliseconds before auto-hide (default: 1500) */
  duration?: number;
  onHide?: () => void;
}

export const SuccessToast: React.FC<SuccessToastProps> = ({
  visible,
  message,
  duration = 1500,
  onHide,
}) => {
  const { theme } = useTheme();
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
  const colors = tokens.color[theme];
  const successColor = colors.success;
  const backgroundColor = colors.cardBackground;
  const textColor = colors.text;

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

  if (!visible && !modalVisible) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              backgroundColor,
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={[styles.iconContainer, { backgroundColor: `${successColor}20` }]}>
            <CheckCircle size={32} color={successColor} />
          </View>
          <Text style={[styles.message, { color: textColor }]}>{message}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    alignItems: 'center',
    paddingVertical: tokens.space.xl,
    paddingHorizontal: tokens.space.xxl,
    borderRadius: tokens.radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    minWidth: 200,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: tokens.space.md,
  },
  message: {
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.semibold,
    fontFamily: 'Montserrat_600SemiBold',
    textAlign: 'center',
  },
});




