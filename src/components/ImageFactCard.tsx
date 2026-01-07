import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Pressable, Animated, StyleSheet, View, Text, Platform, useWindowDimensions } from "react-native";
import { Image, ImageSource } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { tokens } from "../theme/tokens";
import { FONT_FAMILIES } from "./Typography";
import { useFactImage } from "../utils/useFactImage";
import { typography, spacing, componentSizes, isTabletDevice } from "../utils/responsive";
import type { Category } from "../services/database";

// Dark blurhash that matches the card's dark theme for cohesive loading
const DEFAULT_BLURHASH = "L03[%0IU00~q00xu00Rj00%M00M{";

// Aspect ratio for immersive cards (16:9)
const ASPECT_RATIO = 9 / 16;

// Maximum retry attempts for re-rendering (without re-downloading)
const MAX_RENDER_RETRY_ATTEMPTS = 2;

// Maximum retry attempts for re-downloading (after render retries fail)
const MAX_DOWNLOAD_RETRY_ATTEMPTS = 2;

// Retry delay in milliseconds
const RENDER_RETRY_DELAY = 300;
const DOWNLOAD_RETRY_DELAY = 1000;

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
}

const ImageFactCardComponent = ({
  title,
  imageUrl,
  factId,
  category,
  categorySlug,
  onPress,
  isTablet: isTabletProp = false,
  testID,
}: ImageFactCardProps) => {
  const { width: screenWidth } = useWindowDimensions();
  const isTablet = isTabletProp || screenWidth >= 768;
  
  // Use a ref for the scale animation - this persists across renders
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  // Shimmer animation for loading state
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  
  // Use authenticated image with App Check - REQUIRED since remote URLs need App Check headers
  const { imageUri: authenticatedImageUri, isLoading: isImageLoading, retry: retryImage } = useFactImage(imageUrl, factId);
  
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
  const cardHeight = screenWidth * ASPECT_RATIO;

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
    if (renderRetryCount < MAX_RENDER_RETRY_ATTEMPTS) {
      retryPendingRef.current = true;
      
      if (__DEV__) {
        console.log(`🔄 Image render failed for fact ${factId}, re-rendering in ${RENDER_RETRY_DELAY}ms (attempt ${renderRetryCount + 1}/${MAX_RENDER_RETRY_ATTEMPTS})`);
      }
      
      setTimeout(() => {
        retryPendingRef.current = false;
        setRenderRetryCount((prev) => prev + 1);
        // Just increment state to trigger re-render, no download
      }, RENDER_RETRY_DELAY);
      return;
    }
    
    // Phase 2: Re-rendering didn't help, try re-downloading
    if (downloadRetryCount < MAX_DOWNLOAD_RETRY_ATTEMPTS) {
      retryPendingRef.current = true;
      
      setTimeout(() => {
        retryPendingRef.current = false;
        setDownloadRetryCount((prev) => prev + 1);
        setRenderRetryCount(0); // Reset render retries for the new download
        retryImage(); // Actually re-download with App Check
      }, DOWNLOAD_RETRY_DELAY);
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
  }, []);

  // Determine category info for badge
  const categoryInfo = useMemo(() => {
    if (typeof category === "object" && category !== null) {
      return {
        name: category.name,
        color: category.color_hex || "#0066FF",
      };
    }
    const slug = (category as string) || categorySlug || "";
    const name = slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return { name, color: "#0066FF" };
  }, [category, categorySlug]);

  // Generate image source - memoized to prevent unnecessary re-renders
  const imageSource: ImageSource | null = useMemo(
    () => displayUri ? { uri: displayUri } : null,
    [displayUri]
  );

  // Get responsive values based on isTablet
  const typo = isTablet ? typography.tablet : typography.phone;
  const space = isTablet ? spacing.tablet : spacing.phone;
  const sizes = isTablet ? componentSizes.tablet : componentSizes.phone;
  
  // Style objects
  const marginStyle = { marginBottom: space.itemGap };
  const imageContainerStyle = { height: cardHeight };
  // Simple image style - fill the container completely
  const imageStyle = {
    width: "100%" as const,
    height: "100%" as const,
  };
  const badgePositionStyle = {
    top: space.itemGap,
    right: space.itemGap,
  };
  const contentOverlayStyle = {
    paddingHorizontal: space.screenPadding,
    paddingBottom: space.screenPadding,
    paddingTop: space.sectionGap * 1.5,
  };
  
  const baseFontSize = isTablet ? typo.fontSize.h1 : Math.round(typo.fontSize.h1 * 0.85);
  const titleStyle = {
    fontSize: baseFontSize,
    lineHeight: typo.lineHeight.h1,
  };
  const badgeTextStyle = { fontSize: sizes.badgeFontSize };

  // Recycling key that includes retry count to force expo-image to re-attempt loading
  // This is important for Android where timing issues cause initial render failures
  // Also includes a mount timestamp to prevent stale layout from recycled views
  const mountTimestamp = useRef(Date.now()).current;
  const recyclingKey = `fact-image-${factId}-${mountTimestamp}-${renderRetryCount}-${downloadRetryCount}`;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={androidRipple}
        style={styles.pressable}
        testID={testID || `fact-card-${factId}`}
        accessibilityLabel={title}
      >
        <View style={[styles.cardWrapper, marginStyle]}>
          {/* Image Container */}
          <View style={[styles.imageContainer, imageContainerStyle]}>
            {/* Image */}
            <Image
              source={imageSource}
              style={imageStyle}
              contentFit="cover"
              cachePolicy={Platform.OS === "android" ? "disk" : "memory-disk"}
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
            {categoryInfo.name && (
              <View style={[styles.badgeContainer, badgePositionStyle]}>
                <View style={[styles.badge, { backgroundColor: categoryInfo.color }]}>
                  <Text style={[styles.badgeText, badgeTextStyle]}>
                    {categoryInfo.name}
                  </Text>
                </View>
              </View>
            )}

            {/* Content overlay */}
            <View style={[styles.contentOverlay, contentOverlayStyle]}>
              {/* Title */}
              <Text
                style={[styles.title, titleStyle]}
                numberOfLines={sizes.maxLines}
              >
                {title}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
};

// Static values moved outside component to prevent recreation
const androidRipple = {
  color: "rgba(255, 255, 255, 0.15)",
  borderless: false,
};

const placeholder = { blurhash: DEFAULT_BLURHASH };
const gradientColors = ["transparent", "rgba(0, 0, 0, 0.3)", "rgba(0, 0, 0, 0.75)"] as const;
const gradientLocations = [0.3, 0.6, 1] as const;

const styles = StyleSheet.create({
  pressable: {
    overflow: "hidden",
    borderRadius: tokens.radius.lg,
  },
  cardWrapper: {
    borderRadius: tokens.radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  imageContainer: {
    overflow: "hidden",
    backgroundColor: "#1a1a2e", // Dark base that matches the shimmer
  },
  shimmerOverlay: {
    backgroundColor: "#2d2d44", // Subtle shimmer color
  },
  badgeContainer: {
    position: "absolute",
    zIndex: 10,
  },
  badge: {
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.full,
  },
  badgeText: {
    color: "#FFFFFF",
    fontFamily: FONT_FAMILIES.semibold,
    fontWeight: "600",
  },
  contentOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: FONT_FAMILIES.bold,
    fontWeight: "700",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});

// Memoize the component to prevent unnecessary re-renders
export const ImageFactCard = React.memo(
  ImageFactCardComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.title === nextProps.title &&
      prevProps.imageUrl === nextProps.imageUrl &&
      prevProps.factId === nextProps.factId &&
      prevProps.categorySlug === nextProps.categorySlug &&
      prevProps.isTablet === nextProps.isTablet
    );
  }
);
