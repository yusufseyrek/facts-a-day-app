import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ViewShotRef } from 'react-native-view-shot';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';

import { type QueueTrack } from '../contexts';
import { useTranslation } from '../i18n';
import { trackFactShare } from '../services/analytics';
import * as database from '../services/database';
import { performFavoriteToggle } from '../services/favorites';
import { shareService } from '../services/share';
import { hexColors, useTheme } from '../theme';
import { absoluteFillObject } from '../utils/styles';
import { useResponsive } from '../utils/useResponsive';

import { FactAudioButton } from './FactAudioButton';
import { animateHeartToggle, ParticleBurst } from './favoriteHeartAnimation';
import { GlassSurface } from './GlassSurface';
import { ChevronLeft, ChevronRight, Flag, Heart, Share as ShareIcon } from './icons';
import { ShareCard } from './share';
import { styled, View, XStack, YStack } from './Stacks';
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
  /** Fact narration URL — enables the play / add-to-queue button when present. */
  audioUrl?: string | null;
  /** Locale the narration was generated in (queue source resolution key). */
  audioLanguage?: string;
  /** Opens the report dialog. Hosted by the SCREEN (not this bar): the bar
   * can be absolutely-positioned bottom chrome, and DialogShell's inline
   * overlay fills its parent — mounted here the dialog would be squeezed
   * into the bar's box instead of covering the screen. */
  onReportPress: () => void;
}

const Container = styled(YStack, {
  borderTopWidth: 1,
  borderTopColor: '$border',
  backgroundColor: '$background',
});

// ParticleBurst + animateHeartToggle now live in ./favoriteHeartAnimation so
// the fact cards and the story view share the exact same like animation.

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
  audioUrl,
  audioLanguage,
  onReportPress,
}: FactActionsProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { iconSizes, typography, spacing, radius } = useResponsive();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';
  // iOS 26: frost the bottom action bar with Liquid Glass; opaque elsewhere.
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const glassTint = isDark ? 'rgba(10,22,40,0.6)' : 'rgba(240,245,252,0.65)';

  // Neon colors for actions
  const heartColor = theme === 'dark' ? hexColors.dark.neonRed : hexColors.light.neonRed;
  const shareColor = theme === 'dark' ? hexColors.dark.neonGreen : hexColors.light.neonGreen;
  const flagColor = theme === 'dark' ? hexColors.dark.textSecondary : hexColors.light.textSecondary;
  const navColor = theme === 'dark' ? hexColors.dark.primary : hexColors.light.primary;

  // This fact's queue payload — built once and handed to the queue-driven audio
  // button (which decides between play-now and add-to-queue from queue state).
  const categoryLabel = typeof category === 'string' ? category : (category?.name ?? undefined);
  const audioTrack: QueueTrack | null = audioUrl
    ? {
        factId,
        title: factTitle || factContent.substring(0, 60),
        audioUrl,
        language: audioLanguage || 'en',
        category: categoryLabel,
        imageUrl,
      }
    : null;

  const [isFavorited, setIsFavorited] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  const hasNavigation = !!(onNext || onPrevious);
  const showPosition = !!(totalCount && totalCount > 1 && currentIndex !== undefined);

  // ViewShot ref for capturing share card image
  const viewShotRef = useRef<ViewShotRef>(null);

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
    animateHeartToggle(heartScale, heartRotation, isFavoriting);
    if (isFavoriting) {
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 500);
    }
  };

  const handleLike = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const categorySlug = typeof category === 'string' ? category : category?.slug || 'unknown';
      const newFavoriteStatus = await performFavoriteToggle(factId, categorySlug, imageUrl);
      triggerFavoriteAnimation(newFavoriteStatus);
      setIsFavorited(newFavoriteStatus);
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

    trackFactShare({
      factId,
      category: typeof category === 'string' ? category : category?.slug || 'unknown',
    });

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
    onReportPress();
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

  // Action buttons cluster — identical in the glass and opaque layouts.
  const actionButtons = (
    <>
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

      {/* Audio button — queue-driven: Play (start now) when nothing's playing,
          then "add to queue" on later facts; Play/Pause when this fact is live. */}
      {audioTrack && <FactAudioButton track={audioTrack} />}

      {/* Report Button */}
      <Pressable
        onPress={handleReport}
        role="button"
        aria-label={t('a11y_reportButton')}
        style={({ pressed }) => ({
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
          paddingVertical: spacing.xs,
        })}
      >
        <Animated.View style={reportAnimatedStyle}>
          <Flag size={iconSizes.lg} color={flagColor} />
        </Animated.View>
      </Pressable>
    </>
  );

  const navChevronStyle = ({ pressed }: { pressed: boolean }, enabled: boolean) => ({
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: spacing.xs,
    opacity: !enabled ? 0.25 : pressed ? 0.8 : 1,
  });

  return (
    <>
      <Container
        backgroundColor={useGlass ? 'transparent' : '$background'}
        borderTopWidth={useGlass ? 0 : 1}
        overflow={useGlass ? undefined : 'hidden'}
        style={{
          paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.xs,
          paddingTop: spacing.xs,
          paddingHorizontal: useGlass ? spacing.lg : 0,
        }}
      >
        {useGlass ? (
          /* iOS 26: two floating interactive-glass capsules inset from the
             screen edges — actions on the left, a compact prev/next pill on
             the right (Safari-style split toolbar). Content scrolls past in
             the gutters. */
          <XStack gap={spacing.sm} alignItems="stretch">
            <View
              style={{
                flex: 1,
                borderRadius: radius.full,
                overflow: 'hidden',
                paddingVertical: spacing.sm,
                justifyContent: 'center',
              }}
            >
              <GlassSurface
                variant="glass"
                isDark={isDark}
                tint={hexColors[theme].background}
                glassTint={glassTint}
                isInteractive
                borderRadius={radius.full}
                style={absoluteFillObject}
              />
              <XStack alignItems="center" justifyContent="space-evenly">
                {actionButtons}
              </XStack>
            </View>

            {hasNavigation && (
              <View
                style={{
                  borderRadius: radius.full,
                  overflow: 'hidden',
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.xs,
                  justifyContent: 'center',
                }}
              >
                <GlassSurface
                  variant="glass"
                  isDark={isDark}
                  tint={hexColors[theme].background}
                  glassTint={glassTint}
                  isInteractive
                  borderRadius={radius.full}
                  style={absoluteFillObject}
                />
                <XStack alignItems="center">
                  <Pressable
                    onPress={handlePrevious}
                    disabled={!hasPrevious}
                    role="button"
                    aria-label={t('a11y_previousButton')}
                    hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: 0 }}
                    style={(state) => navChevronStyle(state, !!hasPrevious)}
                  >
                    <ChevronLeft size={iconSizes.xl} color={navColor} />
                  </Pressable>
                  {showPosition && (
                    <Text.Caption
                      color="$textSecondary"
                      fontSize={typography.fontSize.caption}
                      textAlign="center"
                      style={{ minWidth: typography.fontSize.caption * 3 }}
                    >
                      {`${currentIndex! + 1}/${totalCount}`}
                    </Text.Caption>
                  )}
                  <Pressable
                    onPress={handleNext}
                    disabled={!hasNext}
                    role="button"
                    aria-label={t('a11y_nextButton')}
                    hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: 0, right: spacing.sm }}
                    style={(state) => navChevronStyle(state, !!hasNext)}
                  >
                    <ChevronRight size={iconSizes.xl} color={navColor} />
                  </Pressable>
                </XStack>
              </View>
            )}
          </XStack>
        ) : (
          /* Opaque full-width bar: [ {} {} {} | < 1/N > ] or [ {} {} {} ] */
          <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={spacing.sm}>
            <XStack gap={spacing.lg} alignItems="center" justifyContent="space-around" flex={1}>
              {actionButtons}
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
                    marginHorizontal: spacing.sm,
                  }}
                />
                <XStack alignItems="center">
                  <Pressable
                    onPress={handlePrevious}
                    disabled={!hasPrevious}
                    role="button"
                    aria-label={t('a11y_previousButton')}
                    hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: 0 }}
                    style={(state) => navChevronStyle(state, !!hasPrevious)}
                  >
                    <ChevronLeft size={iconSizes.xl} color={navColor} />
                  </Pressable>
                  {showPosition && (
                    <Text.Caption
                      color="$textSecondary"
                      fontSize={typography.fontSize.caption}
                      textAlign="center"
                      style={{ minWidth: typography.fontSize.caption * 3 }}
                    >
                      {`${currentIndex! + 1}/${totalCount}`}
                    </Text.Caption>
                  )}
                  <Pressable
                    onPress={handleNext}
                    disabled={!hasNext}
                    role="button"
                    aria-label={t('a11y_nextButton')}
                    hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: 0, right: spacing.sm }}
                    style={(state) => navChevronStyle(state, !!hasNext)}
                  >
                    <ChevronRight size={iconSizes.xl} color={navColor} />
                  </Pressable>
                </XStack>
              </>
            )}
          </XStack>
        )}
      </Container>

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
