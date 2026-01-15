/* global requestAnimationFrame */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
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
import { Flag, Heart, Share as ShareIcon } from '@tamagui/lucide-icons';
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
import { useResponsive } from '../utils/useResponsive';

import { ReportFactModal } from './ReportFactModal';
import { ShareCard } from './share';

import type { Category } from '../services/database';

interface FactActionsProps {
  factId: number;
  factTitle?: string;
  factContent: string;
  imageUrl?: string;
  category?: string | Category;
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
      <Animated.View key={i} style={[styles.particle, { backgroundColor: color }, animatedStyle]} />
    );
  });

  return <>{particles}</>;
};

export function FactActions({
  factId,
  factTitle,
  factContent,
  imageUrl,
  category = 'unknown',
}: FactActionsProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { iconSizes, media } = useResponsive();
  const insets = useSafeAreaInsets();

  // Neon colors for actions
  const heartColor = theme === 'dark' ? hexColors.dark.neonRed : hexColors.light.neonRed;
  const shareColor = theme === 'dark' ? hexColors.dark.neonGreen : hexColors.light.neonGreen;
  const flagColor = theme === 'dark' ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

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

  // Animation values for report
  const reportScale = useSharedValue(1);
  const reportRotation = useSharedValue(0);

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

  const reportAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reportScale.value }, { rotate: `${reportRotation.value}deg` }],
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

  const triggerReportAnimation = () => {
    // Subtle shake animation
    reportScale.value = withSequence(
      withTiming(0.9, { duration: 60, easing: Easing.in(Easing.cubic) }),
      withSpring(1.1, { damping: 15, stiffness: 300 }),
      withSpring(1, { damping: 20, stiffness: 150 })
    );
    reportRotation.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 70 }),
      withTiming(-4, { duration: 50 }),
      withTiming(0, { duration: 70 })
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

    // Trigger animation
    triggerReportAnimation();

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

  return (
    <>
      <Container
        style={{
          height: media.tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 10,
        }}
      >
        <ActionsRow>
          {/* Like Button - Neon Red/Magenta with Animation */}
          <Pressable
            onPress={handleLike}
            role="button"
            aria-label={isFavorited ? t('a11y_likedButton') : t('a11y_likeButton')}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
              padding: 12,
            })}
          >
            <View style={styles.heartContainer}>
              <ParticleBurst color={heartColor} isActive={showParticles} />
              <Animated.View style={[styles.heartIcon, heartAnimatedStyle]}>
                <Heart
                  size={iconSizes.lg}
                  color={heartColor}
                  fill={isFavorited ? heartColor : 'none'}
                />
              </Animated.View>
            </View>
          </Pressable>

          {/* Share Button - Neon Green with Animation */}
          <Pressable
            onPress={handleShare}
            disabled={isSharing}
            role="button"
            aria-label={t('a11y_shareButton')}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
              padding: 12,
            })}
          >
            <Animated.View style={shareAnimatedStyle}>
              <ShareIcon size={iconSizes.lg} color={shareColor} />
            </Animated.View>
          </Pressable>

          {/* Report Button - Subtle with Animation */}
          <Pressable
            onPress={handleReport}
            disabled={isSubmittingReport}
            role="button"
            aria-label={t('a11y_reportButton')}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : isSubmittingReport ? 0.5 : 1,
              padding: 12,
            })}
          >
            <Animated.View style={reportAnimatedStyle}>
              <Flag size={iconSizes.lg} color={flagColor} />
            </Animated.View>
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
  heartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
  },
  heartIcon: {
    position: 'absolute',
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
