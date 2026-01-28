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
import { ChevronLeft, ChevronRight, Flag, Heart, Share as ShareIcon } from '@tamagui/lucide-icons';
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
import { Text } from './Typography';

import type { Category } from '../services/database';

interface FactActionsProps {
  factId: number;
  factSlug?: string;
  factTitle?: string;
  factContent: string;
  imageUrl?: string;
  category?: string | Category;
  sourceUrl?: string;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

const Container = styled(YStack, {
  borderTopWidth: 1,
  borderTopColor: '$border',
  backgroundColor: '$background',
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
      <Animated.View
        key={i}
        style={[
          {
            position: 'absolute' as const,
            width: particleSize,
            height: particleSize,
            borderRadius: particleSize / 2,
            backgroundColor: color,
          },
          animatedStyle,
        ]}
      />
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
  onPrevious,
  hasNext,
  hasPrevious,
  currentIndex,
  totalCount,
}: FactActionsProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { iconSizes, typography, spacing } = useResponsive();
  const insets = useSafeAreaInsets();

  // Neon colors for actions
  const heartColor = theme === 'dark' ? hexColors.dark.neonRed : hexColors.light.neonRed;
  const shareColor = theme === 'dark' ? hexColors.dark.neonGreen : hexColors.light.neonGreen;
  const flagColor = theme === 'dark' ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const navColor = theme === 'dark' ? hexColors.dark.primary : hexColors.light.primary;
  const [isFavorited, setIsFavorited] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  const hasNavigation = !!(onNext || onPrevious);
  const showPosition = !!(totalCount && totalCount > 1 && currentIndex !== undefined);

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
      heartScale.value = withSequence(
        withTiming(0.7, { duration: 80, easing: Easing.in(Easing.cubic) }),
        withSpring(1.3, { damping: 15, stiffness: 300, mass: 0.5 }),
        withSpring(1, { damping: 15, stiffness: 100 })
      );
      heartRotation.value = withSequence(
        withTiming(-12, { duration: 80 }),
        withTiming(12, { duration: 100 }),
        withTiming(-6, { duration: 80 }),
        withTiming(0, { duration: 100 })
      );
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 500);
    } else {
      heartScale.value = withSequence(
        withTiming(0.8, { duration: 100, easing: Easing.in(Easing.cubic) }),
        withSpring(1, { damping: 20, stiffness: 100 })
      );
    }
  };

  const handleLike = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newFavoriteStatus = await database.toggleFavorite(factId);
      triggerFavoriteAnimation(newFavoriteStatus);
      setIsFavorited(newFavoriteStatus);

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
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSharing(true);

    try {
      const preparedImageUri = await shareService.prepareShareCard(factId);
      requestAnimationFrame(() => {
        triggerShareAnimation();
      });

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
      shareService.cleanup();
    }
  };

  const handleReport = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    triggerReportAnimation();
    setShowReportModal(true);
  };

  const handleSubmitReport = async (feedbackText: string) => {
    setIsSubmittingReport(true);
    try {
      await api.reportFact(factId, feedbackText);
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

  const handleNext = () => {
    if (onNext) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onNext();
    }
  };

  const handlePrevious = () => {
    if (onPrevious) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPrevious();
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
        {/* Action row: [ {} {} {} | < 1/N > ] or [ {} {} {} ] */}
        <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={spacing.sm}>
          {/* Action buttons group */}
          <XStack gap={spacing.lg} alignItems="center" justifyContent="space-around" flex={1}>
            {/* Save Button */}
            <Pressable
              onPress={handleLike}
              role="button"
              aria-label={isFavorited ? t('a11y_likedButton') : t('a11y_likeButton')}
              style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
                paddingVertical: spacing.xs,
              })}
            >
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: iconSizes.lg,
                  height: iconSizes.lg,
                }}
              >
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
                paddingVertical: spacing.xs,
              })}
            >
              <Animated.View style={shareAnimatedStyle}>
                <ShareIcon size={iconSizes.lg} color={shareColor} />
              </Animated.View>
            </Pressable>

            {/* Report Button */}
            <Pressable
              onPress={handleReport}
              disabled={isSubmittingReport}
              role="button"
              aria-label={t('a11y_reportButton')}
              style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : isSubmittingReport ? 0.5 : 1,
                paddingVertical: spacing.xs,
              })}
            >
              <Animated.View style={reportAnimatedStyle}>
                <Flag size={iconSizes.lg} color={flagColor} />
              </Animated.View>
            </Pressable>
          </XStack>

          {/* Divider + Navigation */}
          {hasNavigation && (
            <>
              <View
                style={{
                  width: 1,
                  height: iconSizes.lg,
                  backgroundColor: flagColor,
                  opacity: 0.3,
                  marginLeft: spacing.md,
                  marginRight: spacing.lg,
                }}
              />
              <XStack alignItems="center">
                <Pressable
                  onPress={handlePrevious}
                  disabled={!hasPrevious}
                  role="button"
                  aria-label={t('a11y_previousButton')}
                  hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: 0 }}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: !hasPrevious ? 0.25 : pressed ? 0.8 : 1,
                  })}
                >
                  <ChevronLeft size={iconSizes.xl} color={navColor} padding={spacing.xl} />
                </Pressable>
                {showPosition && (
                  <Text.Caption
                    color="$textSecondary"
                    fontSize={typography.fontSize.caption}
                    textAlign="center"
                    style={{ width: typography.fontSize.caption * 5 }}
                  >
                    {`${currentIndex! + 1} / ${totalCount}`}
                  </Text.Caption>
                )}
                <Pressable
                  onPress={handleNext}
                  disabled={!hasNext}
                  role="button"
                  aria-label={t('a11y_nextButton')}
                  hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: 0, right: spacing.sm }}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: !hasNext ? 0.25 : pressed ? 0.8 : 1,
                  })}
                >
                  <ChevronRight size={iconSizes.xl} color={navColor} padding={spacing.xl} />
                </Pressable>
              </XStack>
            </>
          )}
        </XStack>
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
