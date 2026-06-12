/**
 * ShareSheet Component
 * Bottom sheet modal for selecting share destination
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { type ViewShotRef } from 'react-native-view-shot';

import * as Haptics from 'expo-haptics';

import { useTranslation } from '../../i18n';
import { shareService } from '../../services/share';
import { PLATFORM_CONFIG } from '../../services/share/platforms';
import { useResponsive } from '../../utils/useResponsive';
import { BottomSheetShell } from '../BottomSheetShell';
import { CloseButton } from '../CloseButton';
import { Facebook, Instagram, MessageCircle, Share2, Twitter } from '../icons';
import { XStack, YStack } from '../Stacks';
import { Text } from '../Typography';

import { ShareCard } from './ShareCard';

import type { ShareableFact, SharePlatform, ShareResult } from '../../services/share/types';

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
  const { spacing, iconSizes } = useResponsive();

  const [availablePlatforms, setAvailablePlatforms] = useState<SharePlatform[]>([
    'instagram_stories',
    'whatsapp',
    'twitter',
    'facebook',
    'general',
  ]);
  const [isSharing, setIsSharing] = useState(false);
  const [sharingPlatform, setSharingPlatform] = useState<SharePlatform | null>(null);

  const viewShotRef = useRef<ViewShotRef>(null);

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

  const loadAvailablePlatforms = async () => {
    try {
      const platforms = await shareService.getAvailablePlatforms();
      setAvailablePlatforms(platforms);
    } catch {
      // Keep default platforms on error
    }
  };

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

      // Only close if share was successful (not cancelled). The shell plays
      // the slide-out during its exit grace once the parent flips `visible`.
      if (result.success || result.error !== 'cancelled') {
        onClose();
      }
    } finally {
      setIsSharing(false);
      setSharingPlatform(null);
    }
  };

  return (
    <>
      <BottomSheetShell visible={visible} onClose={onClose}>
        {/* Header */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingHorizontal={spacing.lg}
          paddingBottom={spacing.md}
        >
          <Text.Title>{t('a11y_shareButton')}</Text.Title>
          <CloseButton onPress={onClose} />
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
      </BottomSheetShell>

      {/* Off-screen ShareCard for image capture (outside the sheet so the
          translateY/overflow clipping never touches the capture target) */}
      {visible && <ShareCard ref={viewShotRef} fact={fact} />}
    </>
  );
}

const styles = StyleSheet.create({
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
