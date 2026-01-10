import React from 'react';
import { Modal, Pressable, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { AlertTriangle, X, DoorOpen } from '@tamagui/lucide-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { YStack, XStack } from 'tamagui';

import { Text, FONT_FAMILIES } from '../Typography';
import { hexColors } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';

interface TriviaExitModalProps {
  visible: boolean;
  onCancel: () => void;
  onExit: () => void;
  isDark: boolean;
  title: string;
  message: string;
  cancelText: string;
  exitText: string;
}

export function TriviaExitModal({
  visible,
  onCancel,
  onExit,
  isDark,
  title,
  message,
  cancelText,
  exitText,
}: TriviaExitModalProps) {
  // Get responsive values for device type
  const { screenWidth, typography, spacing, radius, iconSizes, media, maxModalWidth } =
    useResponsive();

  // Colors matching the app's design system
  const bgColor = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const errorColor = isDark ? hexColors.dark.error : hexColors.light.error;
  const surfaceColor = isDark ? hexColors.dark.surface : hexColors.light.surface;

  // Warning colors - amber/orange tones
  const warningColor = isDark ? '#FBBF24' : '#F59E0B';
  const warningBgColor = isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(245, 158, 11, 0.1)';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <YStack flex={1} justifyContent="center" alignItems="center" padding={spacing.md}>
        {/* Blur/Overlay Background */}
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={isDark ? 50 : 70}
            tint={isDark ? 'dark' : 'light'}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
        ) : (
          <YStack
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            backgroundColor={isDark ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.7)'}
          />
        )}

        {/* Backdrop tap to cancel */}
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={onCancel}
        />

        {/* Modal Content */}
        <Animated.View
          entering={FadeInUp.duration(300).springify()}
          style={{
            width: screenWidth - spacing.md * 2,
            maxWidth: maxModalWidth,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: isDark ? 0.5 : 0.25,
            shadowRadius: 24,
            elevation: 24,
          }}
        >
          <YStack width="100%" borderRadius={radius.xl} overflow="hidden" backgroundColor={bgColor}>
            {/* Close button */}
            <Pressable
              onPress={onCancel}
              testID="trivia-exit-cancel-x"
              style={{
                position: 'absolute',
                top: spacing.md,
                right: spacing.md,
                zIndex: 10,
                padding: spacing.xs,
              }}
            >
              <X size={iconSizes.md} color={secondaryTextColor} />
            </Pressable>

            {/* Header with Icon */}
            <YStack
              paddingTop={spacing.xl}
              paddingHorizontal={spacing.lg}
              paddingBottom={spacing.md}
              alignItems="center"
              gap={spacing.md}
            >
              {/* Warning Icon */}
              <YStack
                width={iconSizes.heroLg}
                height={iconSizes.heroLg}
                borderRadius={iconSizes.heroLg / 2}
                backgroundColor={warningBgColor}
                justifyContent="center"
                alignItems="center"
              >
                <AlertTriangle size={iconSizes.xl} color={warningColor} strokeWidth={2} />
              </YStack>

              {/* Title */}
              <Text.Title color={textColor} textAlign="center">
                {title}
              </Text.Title>
            </YStack>

            {/* Divider */}
            <YStack height={1} backgroundColor={borderColor} marginHorizontal={spacing.lg} />

            {/* Message Box */}
            <YStack paddingHorizontal={spacing.lg} paddingVertical={spacing.lg}>
              <XStack
                backgroundColor={surfaceColor}
                borderRadius={radius.md}
                padding={spacing.md}
                alignItems="center"
                gap={spacing.sm}
              >
                <DoorOpen size={iconSizes.lg} margin={spacing.xs} color={errorColor} />
                <Text.Body flex={1} color={secondaryTextColor}>
                  {message}
                </Text.Body>
              </XStack>
            </YStack>

            {/* Buttons */}
            <XStack paddingHorizontal={spacing.lg} paddingBottom={spacing.lg} gap={spacing.md}>
              {/* Cancel Button - Outlined */}
              <Pressable
                onPress={onCancel}
                testID="trivia-exit-cancel"
                accessibilityLabel={cancelText}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <XStack
                  backgroundColor="transparent"
                  borderWidth={1.5}
                  borderColor={borderColor}
                  paddingVertical={spacing.md}
                  borderRadius={radius.md}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text.Label
                    fontSize={typography.fontSize.body}
                    fontFamily={FONT_FAMILIES.semibold}
                    color={textColor}
                  >
                    {cancelText}
                  </Text.Label>
                </XStack>
              </Pressable>

              {/* Exit Button - Solid Destructive */}
              <Pressable
                onPress={onExit}
                testID="trivia-exit-confirm"
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={exitText}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <XStack
                  backgroundColor={errorColor}
                  paddingVertical={spacing.md}
                  borderRadius={radius.md}
                  alignItems="center"
                  justifyContent="center"
                  gap={spacing.xs}
                >
                  <DoorOpen size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Label
                    fontSize={typography.fontSize.body}
                    fontFamily={FONT_FAMILIES.semibold}
                    color="#FFFFFF"
                  >
                    {exitText}
                  </Text.Label>
                </XStack>
              </Pressable>
            </XStack>
          </YStack>
        </Animated.View>
      </YStack>
    </Modal>
  );
}
