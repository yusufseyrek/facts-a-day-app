import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { IMAGE_PLACEHOLDER, IMAGE_RETRY } from '../config/images';
import { useFactImage } from '../utils/useFactImage';
import { useResponsive } from '../utils/useResponsive';

import { CategoryBadge } from './CategoryBadge';
import { Text } from './Typography';

import type { ImageSource } from 'expo-image';
import type { Category } from '../services/database';

interface ImageFactCardProps {
  title: string;
  imageUrl: string;
  /** Fact ID used for image caching with App Check authentication */
  factId: number;
  category?: string | Category;
  categorySlug?: string;
  onPress: () => void;
  isTablet?: boolean;
  /** Optional testID for automated testing with Maestro */
  testID?: string;
  /** Called once when the image has successfully loaded and rendered */
  onImageReady?: () => void;
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
}: ImageFactCardProps) => {
  const { screenWidth, isTablet: isTabletHook, spacing, radius, config } = useResponsive();
  const isTablet = isTabletProp || isTabletHook;

  // Use a ref for the scale animation - this persists across renders
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Shimmer animation for loading state
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Use authenticated image with App Check - REQUIRED since remote URLs need App Check headers
  const {
    imageUri: authenticatedImageUri,
    isLoading: isImageLoading,
    retry: retryImage,
  } = useFactImage(imageUrl, factId);

  // Track if image has loaded successfully
  const [imageLoaded, setImageLoaded] = useState(false);

  // Show loading shimmer when image is loading or hasn't loaded yet
  const showLoadingState = isImageLoading || !imageLoaded;

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

  // Keep track of the last valid image URI to prevent flickering
  const lastValidUriRef = useRef<string | null>(null);

  // Update last valid URI when we get a new one
  if (authenticatedImageUri && authenticatedImageUri !== lastValidUriRef.current) {
    lastValidUriRef.current = authenticatedImageUri;
  }

  // Use the last valid URI if current is null (prevents flicker during re-render)
  const displayUri = authenticatedImageUri || lastValidUriRef.current;

  // Retry state: first try re-rendering, then try re-downloading
  // renderRetryCount: triggers re-render without downloading (for Android timing issues)
  // downloadRetryCount: triggers actual re-download (for corrupted files)
  const [renderRetryCount, setRenderRetryCount] = useState(0);
  const [downloadRetryCount, setDownloadRetryCount] = useState(0);

  // Track if we're currently waiting for a retry (prevent duplicate error handling)
  const retryPendingRef = useRef(false);

  // Calculate card height based on aspect ratio
  // Use a smaller aspect ratio for tablets so cards aren't too tall
  const cardHeight = screenWidth * config.cardAspectRatio;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, [scaleAnim]);

  // Handle image render error with smart retry logic
  // On Android, expo-image often fails to render local files due to timing issues
  // Strategy: First try re-rendering (cheap), then try re-downloading (expensive)
  const handleImageError = useCallback(() => {
    // Don't treat loading/null state as an error - wait for actual image to load
    if (isImageLoading || !displayUri) {
      return;
    }

    // Prevent duplicate error handling while retry is pending
    if (retryPendingRef.current) {
      return;
    }

    // Phase 1: Try re-rendering without downloading (fixes Android timing issues)
    if (renderRetryCount < IMAGE_RETRY.MAX_RENDER_ATTEMPTS) {
      retryPendingRef.current = true;

      if (__DEV__) {
        console.log(
          `🔄 Image render failed for fact ${factId}, re-rendering in ${IMAGE_RETRY.RENDER_DELAY}ms (attempt ${renderRetryCount + 1}/${IMAGE_RETRY.MAX_RENDER_ATTEMPTS})`
        );
      }

      setTimeout(() => {
        retryPendingRef.current = false;
        setRenderRetryCount((prev) => prev + 1);
        // Just increment state to trigger re-render, no download
      }, IMAGE_RETRY.RENDER_DELAY);
      return;
    }

    // Phase 2: Re-rendering didn't help, try re-downloading
    if (downloadRetryCount < IMAGE_RETRY.MAX_DOWNLOAD_ATTEMPTS) {
      retryPendingRef.current = true;

      setTimeout(() => {
        retryPendingRef.current = false;
        setDownloadRetryCount((prev) => prev + 1);
        setRenderRetryCount(0); // Reset render retries for the new download
        retryImage(); // Actually re-download with App Check
      }, IMAGE_RETRY.DOWNLOAD_DELAY);
      return;
    }
  }, [renderRetryCount, downloadRetryCount, factId, retryImage, isImageLoading, displayUri]);

  // Reset retry state and loaded state when imageUrl changes
  React.useEffect(() => {
    setRenderRetryCount(0);
    setDownloadRetryCount(0);
    retryPendingRef.current = false;
    setImageLoaded(false);
  }, [imageUrl]);

  // Handle image load success
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    onImageReady?.();
  }, [onImageReady]);

  // Generate image source - memoized to prevent unnecessary re-renders
  const imageSource: ImageSource | null = useMemo(
    () => (displayUri ? { uri: displayUri } : null),
    [displayUri]
  );

  // Style objects
  const marginStyle = { marginBottom: spacing.md };
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
  const recyclingKey = `fact-image-${factId}-${mountTimestamp}-${renderRetryCount}-${downloadRetryCount}`;

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
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
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
        <View style={[cardWrapperStyle, marginStyle]}>
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
  imageContainer: {
    overflow: 'hidden',
    backgroundColor: '#1a1a2e', // Dark base that matches the shimmer
  },
  shimmerOverlay: {
    backgroundColor: '#2d2d44', // Subtle shimmer color
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
    prevProps.isTablet === nextProps.isTablet
  );
});
