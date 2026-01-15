/**
 * ShareSheet Component
 * Bottom sheet modal for selecting share destination
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';

import { Facebook, Instagram, MessageCircle, Share2, Twitter, X } from '@tamagui/lucide-icons';
import * as Haptics from 'expo-haptics';
import { XStack, YStack } from 'tamagui';

import { useTranslation } from '../../i18n';
import { shareService } from '../../services/share';
import { PLATFORM_CONFIG } from '../../services/share/platforms';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { Text } from '../Typography';

import { ShareCard } from './ShareCard';

import type { ShareableFact,SharePlatform, ShareResult } from '../../services/share/types';

interface ShareSheetProps {
  visible: boolean;
  fact: ShareableFact;
  onClose: () => void;
  onShareComplete?: (result: ShareResult) => void;
}

/**
 * Get the icon component for a platform
 */
function getPlatformIcon(platform: SharePlatform, color: string, size: number) {
  switch (platform) {
    case 'instagram_stories':
      return <Instagram size={size} color={color} />;
    case 'whatsapp':
      return <MessageCircle size={size} color={color} />;
    case 'twitter':
      return <Twitter size={size} color={color} />;
    case 'facebook':
      return <Facebook size={size} color={color} />;
    case 'general':
    default:
      return <Share2 size={size} color={color} />;
  }
}

export function ShareSheet({ visible, fact, onClose, onShareComplete }: ShareSheetProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { spacing, radius, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  const [availablePlatforms, setAvailablePlatforms] = useState<SharePlatform[]>([
    'instagram_stories',
    'whatsapp',
    'twitter',
    'facebook',
    'general',
  ]);
  const [isSharing, setIsSharing] = useState(false);
  const [sharingPlatform, setSharingPlatform] = useState<SharePlatform | null>(null);

  const viewShotRef = useRef<ViewShot>(null);

  // Animation values
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);

  // Set ViewShot ref when component mounts
  useEffect(() => {
    if (visible && viewShotRef.current) {
      shareService.setViewShotRef(viewShotRef);
    }
    return () => {
      shareService.clearViewShotRef();
    };
  }, [visible]);

  // Load available platforms
  useEffect(() => {
    if (visible) {
      loadAvailablePlatforms();
    }
  }, [visible]);

  // Animate sheet
  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 300 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(400, { duration: 200 });
      backdropOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible]);

  const loadAvailablePlatforms = async () => {
    try {
      const platforms = await shareService.getAvailablePlatforms();
      setAvailablePlatforms(platforms);
    } catch {
      // Keep default platforms on error
    }
  };

  const handleClose = useCallback(() => {
    translateY.value = withTiming(400, { duration: 200 }, () => {
      runOnJS(onClose)();
    });
    backdropOpacity.value = withTiming(0, { duration: 150 });
  }, [onClose]);

  const handleShare = async (platform: SharePlatform) => {
    if (isSharing) return;

    setIsSharing(true);
    setSharingPlatform(platform);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await shareService.share(fact, {
        platform,
        includeImage: true,
        includeDeepLink: true,
      });

      onShareComplete?.(result);

      // Only close if share was successful (not cancelled)
      if (result.success || result.error !== 'cancelled') {
        handleClose();
      }
    } finally {
      setIsSharing(false);
      setSharingPlatform(null);
    }
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          sheetStyle,
          {
            backgroundColor: colors.surface,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
          },
        ]}
      >
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Header */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingHorizontal={spacing.lg}
          paddingBottom={spacing.md}
        >
          <Text.Title>{t('a11y_shareButton')}</Text.Title>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: colors.background,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <X size={iconSizes.md} color={colors.text} />
          </Pressable>
        </XStack>

        {/* Platform buttons */}
        <XStack
          flexWrap="wrap"
          justifyContent="center"
          paddingHorizontal={spacing.md}
          paddingTop={spacing.md}
          gap={spacing.lg}
        >
          {availablePlatforms.map((platform) => {
            const config = PLATFORM_CONFIG[platform];
            const isCurrentSharing = sharingPlatform === platform;

            return (
              <Pressable
                key={platform}
                onPress={() => handleShare(platform)}
                disabled={isSharing}
                style={({ pressed }) => [
                  styles.platformButton,
                  {
                    opacity: pressed || (isSharing && !isCurrentSharing) ? 0.5 : 1,
                  },
                ]}
              >
                <YStack alignItems="center" gap={spacing.sm}>
                  <View style={[styles.platformIcon, { backgroundColor: config.color }]}>
                    {isCurrentSharing ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      getPlatformIcon(platform, '#FFFFFF', iconSizes.lg)
                    )}
                  </View>
                  <Text.Caption color="$text" numberOfLines={1} textAlign="center">
                    {config.label}
                  </Text.Caption>
                </YStack>
              </Pressable>
            );
          })}
        </XStack>
      </Animated.View>

      {/* Off-screen ShareCard for image capture */}
      <ShareCard ref={viewShotRef} fact={fact} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformButton: {
    width: 80,
    alignItems: 'center',
  },
  platformIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
