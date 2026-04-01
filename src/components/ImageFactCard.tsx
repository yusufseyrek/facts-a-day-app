import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { RefreshCw } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { IMAGE_PLACEHOLDER, IMAGE_RETRY } from '../config/images';
import { useResolvedImageUri } from '../hooks/useResolvedImageUri';
import { getIsConnected } from '../services/network';
import { useResponsive } from '../utils/useResponsive';

import { CategoryBadge } from './CategoryBadge';
import { FavoriteButton } from './FavoriteButton';
import { Text } from './Typography';

import type { ImageSource } from 'expo-image';
import type { Category } from '../services/database';

interface ImageFactCardProps {
  title: string;
  imageUrl: string;
  factId: number;
  category?: string | Category;
  categorySlug?: string;
  onPress: () => void;
  isTablet?: boolean;
  /** Optional testID for automated testing with Maestro */
  testID?: string;
  /** Called once when the image has successfully loaded and rendered */
  onImageReady?: () => void;
  /** Optional aspect ratio override (e.g., 1 for square). Defaults to config.cardAspectRatio */
  aspectRatio?: number;
  /** Optional explicit card width for height calculation (e.g., in carousels where card is narrower than screen) */
  cardWidth?: number;
  /** Optional text component for the title. Receives the same props as Text.Title. Defaults to Text.Title. */
  TitleComponent?: React.ComponentType<any>;
  /** Optional style override for the content overlay (title area at the bottom) */
  contentOverlayStyle?: ViewStyle;
  favoritePositionStyle?: ViewStyle;
}

const ImageFactCardComponent = ({
  title,
  imageUrl,
  factId,
  category,
  onPress,
  isTablet: _isTabletProp = false,
  testID,
  onImageReady,
  aspectRatio,
  cardWidth: cardWidthProp,
  TitleComponent,
  contentOverlayStyle,
  favoritePositionStyle,
}: ImageFactCardProps) => {
  const { screenWidth, spacing, radius, config } = useResponsive();

  // Scale animation using Reanimated (runs on UI thread)
  const scaleAnim = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  // Ref to track press delay timeout - prevents animation during scroll
  const pressDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shimmer animation using Reanimated (runs on UI thread)
  const shimmerOpacity = useSharedValue(0.3);

  // Track if image has loaded successfully
  const [imageLoaded, setImageLoaded] = useState(false);

  // Resolved image URI: local cache or remote URL
  const resolvedUri = useResolvedImageUri(factId, imageUrl);

  // Retry state for re-rendering (handles Android timing issues with expo-image)
  const [renderRetryCount, setRenderRetryCount] = useState(0);

  // All retries exhausted and still no image — show error overlay
  const isPermanentlyFailed = !imageLoaded && renderRetryCount >= IMAGE_RETRY.MAX_RENDER_ATTEMPTS;

  // When offline and image failed, hide the image area entirely (text-only card)
  const isOfflineImageFailed = isPermanentlyFailed && !getIsConnected();

  // Show loading shimmer when image hasn't loaded yet, but NOT when permanently failed
  const showLoadingState = !imageLoaded && !isPermanentlyFailed;

  // Watchdog: after a render retry, if expo-image doesn't call onError/onLoad again
  // within a few seconds, force-advance the retry state to prevent getting stuck
  const renderWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (renderRetryCount === 0 || imageLoaded || isPermanentlyFailed) {
      return;
    }

    if (renderWatchdogRef.current) clearTimeout(renderWatchdogRef.current);

    renderWatchdogRef.current = setTimeout(() => {
      if (retryPendingRef.current) return;

      if (renderRetryCount < IMAGE_RETRY.MAX_RENDER_ATTEMPTS) {
        setRenderRetryCount((prev) => prev + 1);
      }
    }, 3000);

    return () => {
      if (renderWatchdogRef.current) clearTimeout(renderWatchdogRef.current);
    };
  }, [renderRetryCount, imageLoaded, isPermanentlyFailed]);

  // Shimmer animated style
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmerOpacity.value,
  }));

  // Run shimmer animation when loading (Reanimated - UI thread)
  useEffect(() => {
    if (showLoadingState) {
      shimmerOpacity.value = withRepeat(
        withSequence(withTiming(0.6, { duration: 1500 }), withTiming(0.3, { duration: 1500 })),
        -1,
        false
      );
    } else {
      cancelAnimation(shimmerOpacity);
      shimmerOpacity.value = 0;
    }
  }, [showLoadingState]);

  // Track if we're currently waiting for a retry (prevent duplicate error handling)
  const retryPendingRef = useRef(false);

  const Title = TitleComponent || Text.Title;

  // Calculate card height based on aspect ratio
  // Use a smaller aspect ratio for tablets so cards aren't too tall
  // When aspectRatio is provided, use the base width / aspectRatio for the height
  // cardWidthProp allows carousels to pass the actual card width for correct sizing
  const baseWidth = cardWidthProp || screenWidth;
  const cardHeight = aspectRatio ? baseWidth / aspectRatio : baseWidth * config.cardAspectRatio;

  // Delay press animation to avoid triggering during scroll
  const handlePressIn = useCallback(() => {
    if (pressDelayRef.current) {
      clearTimeout(pressDelayRef.current);
    }
    pressDelayRef.current = setTimeout(() => {
      scaleAnim.value = withSpring(0.96, { damping: 8, stiffness: 100 });
    }, 100);
  }, []);

  const handlePressOut = useCallback(() => {
    if (pressDelayRef.current) {
      clearTimeout(pressDelayRef.current);
      pressDelayRef.current = null;
    }
    scaleAnim.value = withSpring(1, { damping: 8, stiffness: 40 });
  }, []);

  // Handle image render error — retry by re-rendering (fixes Android timing issues)
  const handleImageError = useCallback(() => {
    if (retryPendingRef.current) return;

    if (renderRetryCount < IMAGE_RETRY.MAX_RENDER_ATTEMPTS) {
      retryPendingRef.current = true;
      setTimeout(() => {
        retryPendingRef.current = false;
        setRenderRetryCount((prev) => prev + 1);
      }, IMAGE_RETRY.RENDER_DELAY);
    }
  }, [renderRetryCount]);

  // Reset retry state and loaded state when imageUrl changes
  React.useEffect(() => {
    setRenderRetryCount(0);
    retryPendingRef.current = false;
    setImageLoaded(false);
  }, [imageUrl]);

  // Handle image load success
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    onImageReady?.();
  }, [onImageReady]);

  // Reset everything and retry from scratch when user taps error overlay
  const handleRetryFromError = useCallback(() => {
    setRenderRetryCount(0);
    setImageLoaded(false);
    retryPendingRef.current = false;
  }, []);

  // Generate image source - uses local cache if available, otherwise remote URL
  const imageSource: ImageSource | null = useMemo(
    () => (resolvedUri ? { uri: resolvedUri } : null),
    [resolvedUri]
  );

  // Style objects
  const imageContainerStyle = { height: cardHeight };
  // Simple image style - fill the container completely
  const imageStyle = {
    width: '100%' as const,
    height: '100%' as const,
  };
  const badgePositionStyle = {
    top: spacing.md,
    left: spacing.md,
  };
  const defaultFavoritePositionStyle = {
    top: spacing.md,
    right: spacing.md,
  };
  const defaultContentOverlayStyle = {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xl * 1.5,
  };

  const _favoritePositionStyle = favoritePositionStyle || defaultFavoritePositionStyle;
  const _contentOverlayStyle = contentOverlayStyle || defaultContentOverlayStyle;

  // Recycling key that includes retry count to force expo-image to re-attempt loading
  // This is important for Android where timing issues cause initial render failures
  // Also includes a mount timestamp to prevent stale layout from recycled views
  const mountTimestamp = useRef(Date.now()).current;
  const recyclingKey = `fact-image-${factId}-${mountTimestamp}-${renderRetryCount}`;

  const pressableStyle = useMemo(
    () => ({
      overflow: 'hidden' as const,
      borderRadius: radius.lg,
    }),
    [radius]
  );

  const cardWrapperStyle = useMemo(
    () => ({
      borderRadius: radius.lg,
      overflow: 'hidden' as const,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
    }),
    [radius]
  );

  // Offline text-only card: no image, just text on dark background
  if (isOfflineImageFailed) {
    return (
      <Animated.View
        style={[
          styles.shadowWrapper,
          { borderRadius: radius.lg, marginBottom: spacing.md },
          scaleStyle,
        ]}
        shouldRasterizeIOS={true}
        renderToHardwareTextureAndroid={true}
      >
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          android_ripple={androidRipple}
          style={pressableStyle}
          testID={testID || `fact-card-${factId}`}
          aria-label={title}
          role="button"
        >
          <View style={[cardWrapperStyle, styles.imageContainer, styles.offlineCard]}>
            {category && (
              <View style={{ marginBottom: spacing.sm }}>
                <CategoryBadge category={category} />
              </View>
            )}
            <Title color="#FFFFFF" numberOfLines={config.maxLines} style={styles.titleShadow}>
              {title}
            </Title>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.shadowWrapper,
        { borderRadius: radius.lg, marginBottom: spacing.md },
        scaleStyle,
      ]}
      shouldRasterizeIOS={true}
      renderToHardwareTextureAndroid={true}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={androidRipple}
        style={pressableStyle}
        testID={testID || `fact-card-${factId}`}
        aria-label={title}
        role="button"
      >
        <View style={cardWrapperStyle}>
          {/* Image Container */}
          <View style={[styles.imageContainer, imageContainerStyle]}>
            {/* Image */}
            <Image
              source={imageSource}
              aria-hidden={true}
              style={imageStyle}
              contentFit="cover"
              cachePolicy={Platform.OS === 'android' ? 'disk' : 'memory-disk'}
              transition={0}
              placeholder={placeholder}
              onError={handleImageError}
              onLoad={handleImageLoad}
              recyclingKey={recyclingKey}
              priority="high"
            />

            {/* Loading shimmer overlay */}
            {showLoadingState && (
              <Animated.View
                style={[StyleSheet.absoluteFill, styles.shimmerOverlay, shimmerStyle]}
                pointerEvents="none"
              />
            )}

            {/* Error overlay with retry — shown when all retries exhausted */}
            {isPermanentlyFailed && (
              <TouchableOpacity
                style={[StyleSheet.absoluteFill, styles.errorOverlay]}
                onPress={handleRetryFromError}
                activeOpacity={0.7}
              >
                <RefreshCw size={32} color="rgba(255, 255, 255, 0.6)" />
              </TouchableOpacity>
            )}

            {/* Dark gradient overlay for text legibility */}
            <LinearGradient
              colors={gradientColors}
              locations={gradientLocations}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Category badge */}
            {category && (
              <View style={[styles.badgeContainer, badgePositionStyle]}>
                <CategoryBadge category={category} />
              </View>
            )}

            {/* Favorite button */}
            <View style={[styles.badgeContainer, _favoritePositionStyle]}>
              <FavoriteButton
                factId={factId}
                imageUrl={imageUrl}
                categorySlug={typeof category === 'string' ? category : category?.slug}
              />
            </View>

            {/* Content overlay */}
            <View style={[styles.contentOverlay, _contentOverlayStyle]}>
              {/* Title */}
              <Title color="#FFFFFF" numberOfLines={config.maxLines} style={styles.titleShadow}>
                {title}
              </Title>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
};

// Static values moved outside component to prevent recreation
const androidRipple = {
  color: 'rgba(255, 255, 255, 0.15)',
  borderless: false,
};

const placeholder = { blurhash: IMAGE_PLACEHOLDER.DEFAULT_BLURHASH };
const gradientColors = ['transparent', 'rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.85)'] as const;
const gradientLocations = [0.25, 0.55, 1] as const;

const styles = StyleSheet.create({
  shadowWrapper: {
    // iOS shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    // Android: elevation causes thick border artifact inside animated opacity parents
    elevation: Platform.OS === 'android' ? 0 : 4,
  },
  imageContainer: {
    overflow: 'hidden',
    backgroundColor: '#1a1a2e', // Dark base that matches the shimmer
  },
  shimmerOverlay: {
    backgroundColor: '#2d2d44', // Subtle shimmer color
  },
  errorOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    zIndex: 10,
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  titleShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  offlineCard: {
    padding: 20,
    justifyContent: 'flex-end',
    minHeight: 120,
  },
});

// Memoize the component to prevent unnecessary re-renders
export const ImageFactCard = React.memo(ImageFactCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.title === nextProps.title &&
    prevProps.imageUrl === nextProps.imageUrl &&
    prevProps.factId === nextProps.factId &&
    prevProps.categorySlug === nextProps.categorySlug &&
    prevProps.isTablet === nextProps.isTablet &&
    prevProps.aspectRatio === nextProps.aspectRatio &&
    prevProps.cardWidth === nextProps.cardWidth &&
    prevProps.TitleComponent === nextProps.TitleComponent &&
    prevProps.contentOverlayStyle === nextProps.contentOverlayStyle &&
    prevProps.favoritePositionStyle === nextProps.favoritePositionStyle
  );
});
