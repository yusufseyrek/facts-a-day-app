import React from 'react';
import { Modal, Pressable, Platform, useWindowDimensions } from 'react-native';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { AlertTriangle, X, DoorOpen } from '@tamagui/lucide-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { tokens } from '../../theme/tokens';
import { FONT_FAMILIES } from '../Typography';
import { isTabletDevice } from '../../utils/responsive';

const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

const ModalOverlay = styled(YStack, {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  padding: tokens.space.md,
});

const ModalContent = styled(YStack, {
  width: '100%',
  borderRadius: tokens.radius.xl,
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
  const { width: screenWidth } = useWindowDimensions();
  const isTablet = isTabletDevice(screenWidth);
  
  // Responsive sizing
  const modalMaxWidth = isTablet ? 420 : 340;
  const iconSize = isTablet ? 72 : 64;
  const iconInnerSize = isTablet ? 36 : 32;
  const titleFontSize = isTablet ? 24 : 20;
  const messageFontSize = isTablet ? 16 : 14;
  const buttonFontSize = isTablet ? 17 : 15;
  const closeIconSize = isTablet ? 24 : 20;
  const messageIconSize = isTablet ? 24 : 20;
  const buttonIconSize = isTablet ? 20 : 18;
  const padding = isTablet ? tokens.space.xl : tokens.space.lg;
  const buttonPadding = isTablet ? tokens.space.lg : tokens.space.md;
  
  // Colors matching the app's design system
  const bgColor = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const borderColor = isDark ? tokens.color.dark.border : tokens.color.light.border;
  const errorColor = isDark ? tokens.color.dark.error : tokens.color.light.error;
  const surfaceColor = isDark ? tokens.color.dark.surface : tokens.color.light.surface;
  
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
            width: screenWidth - tokens.space.md * 2, 
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
                top: tokens.space.md,
                right: tokens.space.md,
                zIndex: 10,
                padding: tokens.space.xs,
              }}
            >
              <X size={closeIconSize} color={secondaryTextColor} />
            </Pressable>

            {/* Header with Icon */}
            <YStack 
              paddingTop={isTablet ? tokens.space.xxl : tokens.space.xl} 
              paddingHorizontal={padding}
              paddingBottom={tokens.space.md}
              alignItems="center"
              gap={isTablet ? tokens.space.lg : tokens.space.md}
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
              <Text
                fontSize={titleFontSize}
                fontFamily={FONT_FAMILIES.bold}
                color={textColor}
                textAlign="center"
              >
                {title}
              </Text>
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
                borderRadius={tokens.radius.md}
                padding={isTablet ? tokens.space.lg : tokens.space.md}
                alignItems="center"
                gap={tokens.space.sm}
              >
                <DoorOpen size={messageIconSize} color={errorColor} />
                <Text
                  flex={1}
                  fontSize={messageFontSize}
                  color={secondaryTextColor}
                  lineHeight={messageFontSize * 1.5}
                >
                  {message}
                </Text>
              </XStack>
            </YStack>

            {/* Buttons */}
            <XStack 
              paddingHorizontal={padding} 
              paddingBottom={padding}
              gap={tokens.space.md}
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
                  borderRadius={tokens.radius.md}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text
                    fontSize={buttonFontSize}
                    fontFamily={FONT_FAMILIES.semibold}
                    color={textColor}
                  >
                    {cancelText}
                  </Text>
                </XStack>
              </Pressable>

              {/* Exit Button - Solid Destructive */}
              <Pressable 
                onPress={onExit}
                testID="trivia-exit-confirm"
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
                  borderRadius={tokens.radius.md}
                  alignItems="center"
                  justifyContent="center"
                  gap={tokens.space.xs}
                >
                  <DoorOpen size={buttonIconSize} color="#FFFFFF" />
                  <Text
                    fontSize={buttonFontSize}
                    fontFamily={FONT_FAMILIES.semibold}
                    color="#FFFFFF"
                  >
                    {exitText}
                  </Text>
                </XStack>
              </Pressable>
            </XStack>
          </ModalContent>
        </Animated.View>
      </ModalOverlay>
    </Modal>
  );
}
