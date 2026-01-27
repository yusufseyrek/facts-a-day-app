/* global requestAnimationFrame */
import React, { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';

import { styled } from '@tamagui/core';
import {
  ChevronRight,
  Heart,
  MoreHorizontal,
  Share as ShareIcon,
} from '@tamagui/lucide-icons';
import * as Haptics from 'expo-haptics';
import { View, XStack, YStack } from 'tamagui';

import { useTranslation } from '../i18n';
import {
  trackFactFavoriteAdd,
  trackFactFavoriteRemove,
  trackFactReport,
} from '../services/analytics';
import * as api from '../services/api';
import * as database from '../services/database';
import { shareService } from '../services/share';
import { hexColors, useTheme } from '../theme';
import { openInAppBrowser } from '../utils/browser';
import { useResponsive } from '../utils/useResponsive';

import { ReportFactModal } from './ReportFactModal';
import { ShareCard } from './share';
import { Text } from './Typography';

import type { Category } from '../services/database';

interface FactActionsProps {
  factId: number;
  factSlug?: string;
  factTitle?: string;
  factContent: string;
  imageUrl?: string;
  category?: string | Category;
  onNext?: () => void;
  hasNext?: boolean;
  sourceUrl?: string;
  positionText?: string;
}

const Container = styled(YStack, {
  borderTopWidth: 1,
  borderTopColor: '$border',
  backgroundColor: '$background',
});

const ActionsRow = styled(XStack, {
  justifyContent: 'space-around',
  alignItems: 'center',
});

// Particle burst component for the favorite animation
const PARTICLE_COUNT = 6;
const ParticleBurst = ({ color, isActive }: { color: string; isActive: boolean }) => {
  const { spacing } = useResponsive();
  const particleSize = spacing.xs + 2; // 6 on phone, 8 on tablet
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * 2 * Math.PI;
    const scale = useSharedValue(0);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const opacity = useSharedValue(0);

    useEffect(() => {
      if (isActive) {
        const distance = 28 + Math.random() * 12;
        const targetX = Math.cos(angle) * distance;
        const targetY = Math.sin(angle) * distance;

        scale.value = withSequence(
          withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 250, easing: Easing.in(Easing.cubic) })
        );
        opacity.value = withSequence(
          withTiming(1, { duration: 100 }),
          withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) })
        );
        translateX.value = withTiming(targetX, { duration: 400, easing: Easing.out(Easing.cubic) });
        translateY.value = withTiming(targetY, { duration: 400, easing: Easing.out(Easing.cubic) });
      } else {
        scale.value = 0;
        opacity.value = 0;
        translateX.value = 0;
        translateY.value = 0;
      }
    }, [isActive]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      opacity: opacity.value,
    }));

    return (
      <Animated.View key={i} style={[{ position: 'absolute' as const, width: particleSize, height: particleSize, borderRadius: particleSize / 2, backgroundColor: color }, animatedStyle]} />
    );
  });

  return <>{particles}</>;
};

export function FactActions({
  factId,
  factSlug,
  factTitle,
  factContent,
  imageUrl,
  category = 'unknown',
  onNext,
  hasNext,
  sourceUrl,
  positionText,
}: FactActionsProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { iconSizes, typography, spacing, media } = useResponsive();
  const insets = useSafeAreaInsets();

  // Neon colors for actions
  const heartColor = theme === 'dark' ? hexColors.dark.neonRed : hexColors.light.neonRed;
  const shareColor = theme === 'dark' ? hexColors.dark.neonGreen : hexColors.light.neonGreen;
  const nextColor = theme === 'dark' ? hexColors.dark.primary : hexColors.light.primary;
  const moreColor = theme === 'dark' ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

  const [isFavorited, setIsFavorited] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  // ViewShot ref for capturing share card image
  const viewShotRef = useRef<ViewShot>(null);

  // Set ViewShot ref on mount
  useEffect(() => {
    if (viewShotRef.current) {
      shareService.setViewShotRef(viewShotRef);
    }
    return () => {
      shareService.clearViewShotRef();
    };
  }, []);

  // Animation values for heart
  const heartScale = useSharedValue(1);
  const heartRotation = useSharedValue(0);

  // Animation values for share
  const shareScale = useSharedValue(1);
  const shareRotation = useSharedValue(0);
  const shareTranslateY = useSharedValue(0);

  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }, { rotate: `${heartRotation.value}deg` }],
  }));

  const shareAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: shareScale.value },
      { rotate: `${shareRotation.value}deg` },
      { translateY: shareTranslateY.value },
    ],
  }));

  // Check if fact is favorited on mount
  useEffect(() => {
    checkFavoriteStatus();
  }, [factId]);

  const checkFavoriteStatus = async () => {
    try {
      const favorited = await database.isFactFavorited(factId);
      setIsFavorited(favorited);
    } catch (error) {
      console.error('Error checking favorite status:', error);
    }
  };

  const triggerFavoriteAnimation = (isFavoriting: boolean) => {
    if (isFavoriting) {
      // Satisfying bounce animation when favoriting
      heartScale.value = withSequence(
        withTiming(0.7, { duration: 80, easing: Easing.in(Easing.cubic) }),
        withSpring(1.3, { damping: 15, stiffness: 300, mass: 0.5 }),
        withSpring(1, { damping: 15, stiffness: 100 })
      );
      // Subtle rotation wiggle
      heartRotation.value = withSequence(
        withTiming(-12, { duration: 80 }),
        withTiming(12, { duration: 100 }),
        withTiming(-6, { duration: 80 }),
        withTiming(0, { duration: 100 })
      );
      // Trigger particles
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 500);
    } else {
      // Subtle shrink when unfavoriting
      heartScale.value = withSequence(
        withTiming(0.8, { duration: 100, easing: Easing.in(Easing.cubic) }),
        withSpring(1, { damping: 20, stiffness: 100 })
      );
    }
  };

  const handleLike = async () => {
    try {
      // Provide immediate haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newFavoriteStatus = await database.toggleFavorite(factId);

      // Trigger animation
      triggerFavoriteAnimation(newFavoriteStatus);

      setIsFavorited(newFavoriteStatus);

      // Track favorite add/remove
      const categorySlug = typeof category === 'string' ? category : category?.slug || 'unknown';
      if (newFavoriteStatus) {
        trackFactFavoriteAdd({ factId, category: categorySlug });
      } else {
        trackFactFavoriteRemove({ factId, category: categorySlug });
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Error toggling favorite:', error);
      }
      Alert.alert(t('error'), t('failedToUpdateFavorite'));
    }
  };

  const triggerShareAnimation = () => {
    // "Send out" animation - tilt and lift up
    shareScale.value = withSequence(
      withTiming(0.85, { duration: 80, easing: Easing.in(Easing.cubic) }),
      withSpring(1.15, { damping: 15, stiffness: 300 }),
      withSpring(1, { damping: 20, stiffness: 150 })
    );
    shareRotation.value = withSequence(
      withTiming(-15, { duration: 100 }),
      withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) })
    );
    shareTranslateY.value = withSequence(
      withTiming(-4, { duration: 100, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) })
    );
  };

  const handleShare = async () => {
    if (isSharing) return;

    // Light haptic feedback for share action
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setIsSharing(true);

    try {
      // Prepare the share card image first
      const preparedImageUri = await shareService.prepareShareCard(factId);

      // Trigger animation in next frame for smooth execution
      requestAnimationFrame(() => {
        triggerShareAnimation();
      });

      // Show share modal with prepared image
      const result = await shareService.share(
        {
          id: factId,
          slug: factSlug,
          title: factTitle || '',
          content: factContent,
          category,
          imageUri: imageUrl,
        },
        {
          platform: 'general',
          includeImage: true,
          includeDeepLink: true,
        },
        preparedImageUri
      );

      if (!result.success && result.error && result.error !== 'cancelled') {
        console.error('[Share] Failed:', result.error);
      }
    } catch (error) {
      console.error('[Share] Error:', error);
    } finally {
      setIsSharing(false);
      // Clean up share card images after sharing
      shareService.cleanup();
    }
  };

  const handleReport = () => {
    // Light haptic feedback for opening report modal
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowReportModal(true);
  };

  const handleSubmitReport = async (feedbackText: string) => {
    setIsSubmittingReport(true);
    try {
      await api.reportFact(factId, feedbackText);

      // Track report submission
      trackFactReport(factId);

      Alert.alert(t('success'), t('reportSubmitted'));
    } catch (error) {
      console.error('Error submitting report:', error);
      const errorMessage = error instanceof Error ? error.message : t('failedToSubmitReport');
      Alert.alert(t('error'), errorMessage);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleMore = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const options: string[] = [];
    const actions: (() => void)[] = [];

    if (sourceUrl) {
      options.push(t('readSource'));
      actions.push(() => {
        openInAppBrowser(sourceUrl, { theme }).catch(() => {
          // Ignore URL open errors
        });
      });
    }

    options.push(t('reportFact'));
    actions.push(handleReport);

    options.push(t('cancel'));

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: sourceUrl ? 1 : 0,
        },
        (buttonIndex) => {
          if (buttonIndex < actions.length) {
            actions[buttonIndex]();
          }
        }
      );
    } else {
      // On Android, use Alert as a simple fallback
      Alert.alert(
        t('actionMore'),
        undefined,
        [
          ...actions.map((action, i) => ({
            text: options[i],
            onPress: action,
          })),
          { text: t('cancel'), style: 'cancel' as const },
        ]
      );
    }
  };

  const handleNext = () => {
    if (onNext) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onNext();
    }
  };

  return (
    <>
      <Container
        style={{
          paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.xs,
          paddingTop: spacing.xs,
        }}
      >
        {/* Position indicator */}
        {positionText && (
          <XStack justifyContent="center" paddingBottom={spacing.xs}>
            <Text.Caption color="$textSecondary">{positionText}</Text.Caption>
          </XStack>
        )}

        {/* Action row */}
        <ActionsRow>
          {/* Save Button */}
          <Pressable
            onPress={handleLike}
            role="button"
            aria-label={isFavorited ? t('a11y_likedButton') : t('a11y_likeButton')}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
              width: media.colorSwatchSize,
              paddingVertical: spacing.xs,
            })}
          >
            <View style={{ alignItems: 'center', justifyContent: 'center', width: iconSizes.sm, height: iconSizes.sm }}>
              <ParticleBurst color={heartColor} isActive={showParticles} />
              <Animated.View style={[styles.heartIcon, heartAnimatedStyle]}>
                <Heart
                  size={iconSizes.md}
                  color={heartColor}
                  fill={isFavorited ? heartColor : 'none'}
                />
              </Animated.View>
            </View>
            <Text.Caption
              color={heartColor}
              fontSize={typography.fontSize.caption}
              marginTop={spacing.xs / 2}
            >
              {isFavorited ? t('actionSaved') : t('actionSave')}
            </Text.Caption>
          </Pressable>

          {/* Share Button */}
          <Pressable
            onPress={handleShare}
            disabled={isSharing}
            role="button"
            aria-label={t('a11y_shareButton')}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
              width: media.colorSwatchSize,
              paddingVertical: spacing.xs,
            })}
          >
            <Animated.View style={shareAnimatedStyle}>
              <ShareIcon size={iconSizes.md} color={shareColor} />
            </Animated.View>
            <Text.Caption
              color={shareColor}
              fontSize={typography.fontSize.caption}
              marginTop={spacing.xs / 2}
            >
              {t('actionShare')}
            </Text.Caption>
          </Pressable>

          {/* Next Button - only shown when fact list is available */}
          {hasNext && onNext && (
            <Pressable
              onPress={handleNext}
              role="button"
              aria-label={t('a11y_nextButton')}
              style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
                width: media.colorSwatchSize,
                paddingVertical: spacing.xs,
              })}
            >
              <ChevronRight size={iconSizes.md} color={nextColor} />
              <Text.Caption
                color={nextColor}
                fontSize={typography.fontSize.caption}
                marginTop={spacing.xs / 2}
              >
                {t('actionNext')}
              </Text.Caption>
            </Pressable>
          )}

          {/* More button (overflow menu) */}
          <Pressable
            onPress={handleMore}
            role="button"
            aria-label={t('actionMore')}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
              width: media.colorSwatchSize,
              paddingVertical: spacing.xs,
            })}
          >
            <MoreHorizontal size={iconSizes.md} color={moreColor} />
            <Text.Caption
              color={moreColor}
              fontSize={typography.fontSize.caption}
              marginTop={spacing.xs / 2}
            >
              {t('actionMore')}
            </Text.Caption>
          </Pressable>
        </ActionsRow>
      </Container>

      <ReportFactModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleSubmitReport}
        isSubmitting={isSubmittingReport}
      />

      {/* Off-screen ShareCard for image capture */}
      <ShareCard
        ref={viewShotRef}
        fact={{
          id: factId,
          slug: factSlug,
          title: factTitle || '',
          content: factContent,
          category,
          imageUri: imageUrl,
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  heartIcon: {
    position: 'absolute',
  },
});
