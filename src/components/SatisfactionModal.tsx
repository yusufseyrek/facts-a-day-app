import React from 'react';
import { Modal, Platform, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Heart, MessageCircle, X } from '@tamagui/lucide-icons';
import { BlurView } from 'expo-blur';
import { XStack, YStack } from 'tamagui';

import { LAYOUT } from '../config/app';
import { hexColors } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { FONT_FAMILIES, Text } from './Typography';

interface SatisfactionModalProps {
  visible: boolean;
  onLoveIt: () => void;
  onNotReally: () => void;
  onDismiss: () => void;
  isDark: boolean;
  title: string;
  subtitle: string;
  loveItText: string;
  notReallyText: string;
}

export function SatisfactionModal({
  visible,
  onLoveIt,
  onNotReally,
  onDismiss,
  isDark,
  title,
  subtitle,
  loveItText,
  notReallyText,
}: SatisfactionModalProps) {
  const { maxModalWidth, typography, spacing, radius, iconSizes } = useResponsive();

  const bgColor = isDark ? hexColors.dark.cardBackground : hexColors.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const borderColor = isDark ? hexColors.dark.border : hexColors.light.border;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;

  const heartColor = isDark ? '#FF6B8A' : '#E8476C';
  const heartBgColor = isDark ? 'rgba(255, 107, 138, 0.15)' : 'rgba(232, 71, 108, 0.1)';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <YStack flex={1} justifyContent="center" alignItems="center" padding={spacing.md}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={35}
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

        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={onDismiss}
        />

        <Animated.View
          entering={FadeInUp.duration(150)}
          style={{
            width: maxModalWidth - spacing.md * 2,
            maxWidth: LAYOUT.MAX_CONTENT_WIDTH,
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
              onPress={onDismiss}
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
              <YStack
                width={iconSizes.heroLg}
                height={iconSizes.heroLg}
                borderRadius={iconSizes.heroLg / 2}
                backgroundColor={heartBgColor}
                justifyContent="center"
                alignItems="center"
              >
                <Heart size={iconSizes.xl} color={heartColor} strokeWidth={2} fill={heartColor} />
              </YStack>

              <Text.Title color={textColor} textAlign="center">
                {title}
              </Text.Title>
            </YStack>

            {/* Divider */}
            <YStack height={1} backgroundColor={borderColor} marginHorizontal={spacing.lg} />

            {/* Subtitle */}
            <YStack paddingHorizontal={spacing.lg} paddingVertical={spacing.lg} alignItems="center">
              <Text.Body color={secondaryTextColor} textAlign="center">
                {subtitle}
              </Text.Body>
            </YStack>

            {/* Buttons */}
            <XStack paddingHorizontal={spacing.lg} paddingBottom={spacing.lg} gap={spacing.md}>
              {/* Not Really — Outlined */}
              <Pressable
                onPress={onNotReally}
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
                  gap={spacing.xs}
                >
                  <MessageCircle size={iconSizes.sm} color={textColor} />
                  <Text.Label
                    fontSize={typography.fontSize.body}
                    fontFamily={FONT_FAMILIES.semibold}
                    color={textColor}
                  >
                    {notReallyText}
                  </Text.Label>
                </XStack>
              </Pressable>

              {/* Love It — Solid Primary */}
              <Pressable
                onPress={onLoveIt}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <XStack
                  backgroundColor={primaryColor}
                  paddingVertical={spacing.md}
                  borderRadius={radius.md}
                  alignItems="center"
                  justifyContent="center"
                  gap={spacing.xs}
                >
                  <Heart size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Label
                    fontSize={typography.fontSize.body}
                    fontFamily={FONT_FAMILIES.semibold}
                    color="#FFFFFF"
                  >
                    {loveItText}
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
