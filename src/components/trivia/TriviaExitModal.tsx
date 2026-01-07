import React from 'react';
import { Modal, Pressable, Platform } from 'react-native';
import { styled } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { AlertTriangle, X, DoorOpen } from '@tamagui/lucide-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { hexColors, spacing, radius, sizes } from '../../theme';
import { Text, FONT_FAMILIES } from '../Typography';
import { useResponsive } from '../../utils/useResponsive';

const ModalOverlay = styled(YStack, {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  padding: spacing.phone.md,
});

const ModalContent = styled(YStack, {
  width: '100%',
  borderRadius: radius.phone.xl,
  overflow: 'hidden',
});

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
  const { screenWidth, typography: typo, spacing: space, iconSizes: icons, componentSizes: sizes } = useResponsive();
  
  // Responsive sizing
  const modalMaxWidth = sizes.modalMaxWidth;
  const iconSize = icons.container;
  const iconInnerSize = icons.inner;
  const titleFontSize = typo.fontSize.title;
  const messageFontSize = typo.fontSize.caption;
  const messageLineHeight = typo.lineHeight.caption;
  const buttonFontSize = typo.fontSize.body;
  const closeIconSize = icons.action;
  const messageIconSize = icons.action;
  const buttonIconSize = icons.button;
  const padding = space.lg;
  const buttonPadding = space.md;
  
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
      <ModalOverlay>
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
            width: screenWidth - spacing.phone.md * 2, 
            maxWidth: modalMaxWidth,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: isDark ? 0.5 : 0.25,
            shadowRadius: 24,
            elevation: 24,
          }}
        >
          <ModalContent backgroundColor={bgColor}>
            {/* Close button */}
            <Pressable
              onPress={onCancel}
              testID="trivia-exit-cancel-x"
              style={{
                position: 'absolute',
                top: spacing.phone.md,
                right: spacing.phone.md,
                zIndex: 10,
                padding: spacing.phone.xs,
              }}
            >
              <X size={closeIconSize} color={secondaryTextColor} />
            </Pressable>

            {/* Header with Icon */}
            <YStack 
              paddingTop={space.xl} 
              paddingHorizontal={padding}
              paddingBottom={spacing.phone.md}
              alignItems="center"
              gap={space.md}
            >
              {/* Warning Icon */}
              <YStack
                width={iconSize}
                height={iconSize}
                borderRadius={iconSize / 2}
                backgroundColor={warningBgColor}
                justifyContent="center"
                alignItems="center"
              >
                <AlertTriangle size={iconInnerSize} color={warningColor} strokeWidth={2} />
              </YStack>

              {/* Title */}
              <Text.Title
                fontSize={titleFontSize}
                color={textColor}
                textAlign="center"
              >
                {title}
              </Text.Title>
            </YStack>

            {/* Divider */}
            <YStack height={1} backgroundColor={borderColor} marginHorizontal={padding} />

            {/* Message Box */}
            <YStack 
              paddingHorizontal={padding}
              paddingVertical={padding}
            >
              <XStack 
                backgroundColor={surfaceColor}
                borderRadius={radius.phone.md}
                padding={space.md}
                alignItems="center"
                gap={spacing.phone.sm}
              >
                <DoorOpen size={messageIconSize} color={errorColor} />
                <Text.Caption
                  flex={1}
                  fontSize={messageFontSize}
                  color={secondaryTextColor}
                  lineHeight={messageLineHeight}
                >
                  {message}
                </Text.Caption>
              </XStack>
            </YStack>

            {/* Buttons */}
            <XStack 
              paddingHorizontal={padding} 
              paddingBottom={padding}
              gap={spacing.phone.md}
            >
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
                  paddingVertical={buttonPadding}
                  borderRadius={radius.phone.md}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text.Label
                    fontSize={buttonFontSize}
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
                  paddingVertical={buttonPadding}
                  borderRadius={radius.phone.md}
                  alignItems="center"
                  justifyContent="center"
                  gap={spacing.phone.xs}
                >
                  <DoorOpen size={buttonIconSize} color="#FFFFFF" />
                  <Text.Label
                    fontSize={buttonFontSize}
                    fontFamily={FONT_FAMILIES.semibold}
                    color="#FFFFFF"
                  >
                    {exitText}
                  </Text.Label>
                </XStack>
              </Pressable>
            </XStack>
          </ModalContent>
        </Animated.View>
      </ModalOverlay>
    </Modal>
  );
}
