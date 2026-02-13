import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

import { RefreshCw } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { IMAGE_PLACEHOLDER, IMAGE_RETRY } from '../config/images';
import { useResponsive } from '../utils/useResponsive';

import { CategoryBadge } from './CategoryBadge';
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
}

const ImageFactCardComponent = ({
  title,
  imageUrl,
  factId,
  category,
  onPress,
  isTablet: isTabletProp = false,
  testID,
  onImageReady,
  aspectRatio,
  cardWidth: cardWidthProp,
}: ImageFactCardProps) => {
  const { screenWidth, isTablet: isTabletHook, spacing, radius, config } = useResponsive();
  const isTablet = isTabletProp || isTabletHook;

  // Use a ref for the scale animation - this persists across renders
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Ref to track press delay timeout - prevents animation during scroll
  const pressDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shimmer animation for loading state
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Track if image has loaded successfully
  const [imageLoaded, setImageLoaded] = useState(false);

  // Retry state for re-rendering (handles Android timing issues with expo-image)
  const [renderRetryCount, setRenderRetryCount] = useState(0);

  // All retries exhausted and still no image — show error overlay
  const isPermanentlyFailed =
    !imageLoaded && renderRetryCount >= IMAGE_RETRY.MAX_RENDER_ATTEMPTS;

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

  // Run shimmer animation when loading
  useEffect(() => {
    if (showLoadingState) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      shimmerAnim.setValue(0);
    }
  }, [showLoadingState, shimmerAnim]);

  // Track if we're currently waiting for a retry (prevent duplicate error handling)
  const retryPendingRef = useRef(false);

  // Calculate card height based on aspect ratio
  // Use a smaller aspect ratio for tablets so cards aren't too tall
  // When aspectRatio is provided, use the base width / aspectRatio for the height
  // cardWidthProp allows carousels to pass the actual card width for correct sizing
  const baseWidth = cardWidthProp || screenWidth;
  const cardHeight = aspectRatio ? baseWidth / aspectRatio : baseWidth * config.cardAspectRatio;

  // Delay press animation to avoid triggering during scroll
  const handlePressIn = useCallback(() => {
    // Clear any existing timeout
    if (pressDelayRef.current) {
      clearTimeout(pressDelayRef.current);
    }
    // Delay the animation - if user starts scrolling, pressOut will cancel it
    pressDelayRef.current = setTimeout(() => {
      Animated.spring(scaleAnim, {
        toValue: 0.96,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }).start();
    }, 100);
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    // Cancel pending animation if user was scrolling
    if (pressDelayRef.current) {
      clearTimeout(pressDelayRef.current);
      pressDelayRef.current = null;
    }
    // Always reset scale to 1
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, [scaleAnim]);

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

  // Generate image source - memoized to prevent unnecessary re-renders
  const imageSource: ImageSource | null = useMemo(
    () => (imageUrl ? { uri: imageUrl } : null),
    [imageUrl]
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
    right: spacing.md,
  };
  const contentOverlayStyle = {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xl * 1.5,
  };

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

  return (
    <Animated.View style={[styles.shadowWrapper, { borderRadius: radius.lg, marginBottom: spacing.md, transform: [{ scale: scaleAnim }] }]}>
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
                style={[
                  StyleSheet.absoluteFill,
                  styles.shimmerOverlay,
                  {
                    opacity: shimmerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 0.6],
                    }),
                  },
                ]}
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
                <CategoryBadge category={category} factId={factId} />
              </View>
            )}

            {/* Content overlay */}
            <View style={[styles.contentOverlay, contentOverlayStyle]}>
              {/* Title */}
              <Text.Title
                color="#FFFFFF"
                numberOfLines={config.maxLines}
                style={styles.titleShadow}
              >
                {title}
              </Text.Title>
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
    shadowRadius: 8,
    // Android shadow
    elevation: 8,
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
    prevProps.cardWidth === nextProps.cardWidth
  );
});
