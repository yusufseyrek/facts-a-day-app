import React from 'react';
import { Modal, Pressable, Platform, useWindowDimensions } from 'react-native';
import { styled } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { AlertTriangle, X, DoorOpen } from '@tamagui/lucide-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { tokens } from '../../theme/tokens';
import { H2, SmallText, LabelText, FONT_FAMILIES } from '../Typography';
import { isTabletDevice, typography, spacing, iconSizes, componentSizes } from '../../utils/responsive';

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
  
  // Get responsive values for device type
  const typo = isTablet ? typography.tablet : typography.phone;
  const space = isTablet ? spacing.tablet : spacing.phone;
  const icons = isTablet ? iconSizes.tablet : iconSizes.phone;
  const sizes = isTablet ? componentSizes.tablet : componentSizes.phone;
  
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
  const padding = space.screenPadding;
  const buttonPadding = space.itemGap;
  
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
              paddingTop={space.sectionGap} 
              paddingHorizontal={padding}
              paddingBottom={tokens.space.md}
              alignItems="center"
              gap={space.itemGap}
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
              <H2
                fontSize={titleFontSize}
                color={textColor}
                textAlign="center"
              >
                {title}
              </H2>
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
                padding={space.itemGap}
                alignItems="center"
                gap={tokens.space.sm}
              >
                <DoorOpen size={messageIconSize} color={errorColor} />
                <SmallText
                  flex={1}
                  fontSize={messageFontSize}
                  color={secondaryTextColor}
                  lineHeight={messageLineHeight}
                >
                  {message}
                </SmallText>
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
                  <LabelText
                    fontSize={buttonFontSize}
                    fontFamily={FONT_FAMILIES.semibold}
                    color={textColor}
                  >
                    {cancelText}
                  </LabelText>
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
                  borderRadius={tokens.radius.md}
                  alignItems="center"
                  justifyContent="center"
                  gap={tokens.space.xs}
                >
                  <DoorOpen size={buttonIconSize} color="#FFFFFF" />
                  <LabelText
                    fontSize={buttonFontSize}
                    fontFamily={FONT_FAMILIES.semibold}
                    color="#FFFFFF"
                  >
                    {exitText}
                  </LabelText>
                </XStack>
              </Pressable>
            </XStack>
          </ModalContent>
        </Animated.View>
      </ModalOverlay>
    </Modal>
  );
}
