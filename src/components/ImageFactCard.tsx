import React, { useState, useCallback, useMemo, useRef } from "react";
import { Pressable, Animated, StyleSheet, View, Text, Platform } from "react-native";
import { Image, ImageSource } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { tokens } from "../theme/tokens";
import { useResponsive } from "../utils/useResponsive";
import { useFactImage } from "../utils/useFactImage";
import type { Category } from "../services/database";

// Default blurhash for smooth loading experience
const DEFAULT_BLURHASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

// Aspect ratio for immersive cards (16:9)
const ASPECT_RATIO = 9 / 16;

// Maximum retry attempts for image loading
const MAX_RETRY_ATTEMPTS = 3;

// Retry delay in milliseconds (exponential backoff)
const RETRY_DELAY_BASE = 1000;

interface ImageFactCardProps {
  title: string;
  imageUrl: string;
  /** Fact ID used for image caching with App Check authentication */
  factId: number;
  category?: string | Category;
  categorySlug?: string;
  onPress: () => void;
  isTablet?: boolean;
}

const ImageFactCardComponent = ({
  title,
  imageUrl,
  factId,
  category,
  categorySlug,
  onPress,
  isTablet: isTabletProp = false,
}: ImageFactCardProps) => {
  const { fontSizes, isTablet: isTabletDevice, screenWidth } = useResponsive();
  const isTablet = isTabletProp || isTabletDevice;
  
  // Use a ref for the scale animation - this persists across renders
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  // Use authenticated image with App Check - REQUIRED since remote URLs need App Check headers
  const { imageUri: authenticatedImageUri, isLoading: isImageLoading, retry: retryImage } = useFactImage(imageUrl, factId);
  
  // Keep track of the last valid image URI to prevent flickering
  const lastValidUriRef = useRef<string | null>(null);
  
  // Update last valid URI when we get a new one
  if (authenticatedImageUri && authenticatedImageUri !== lastValidUriRef.current) {
    lastValidUriRef.current = authenticatedImageUri;
  }
  
  // Use the last valid URI if current is null (prevents flicker during re-render)
  const displayUri = authenticatedImageUri || lastValidUriRef.current;
  
  // Image retry state for expo-image component errors (after successful download)
  const [retryCount, setRetryCount] = useState(0);

  // Calculate card height based on aspect ratio - memoize to prevent recalculation
  const cardHeight = useMemo(() => screenWidth * ASPECT_RATIO, [screenWidth]);

  // Parallax amount
  const parallaxAmount = 8;

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

  // Handle image render error with retry logic (for local file issues after download)
  const handleImageError = useCallback(() => {
    // Don't treat loading/null state as an error - wait for actual image to load
    if (isImageLoading || !displayUri) {
      return;
    }
    
    if (retryCount < MAX_RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount);
      console.log(`🔄 Image render failed, retrying download in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);
      
      setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        retryImage(); // Re-download with App Check
      }, delay);
    } else {
      console.log(`❌ Image failed after ${MAX_RETRY_ATTEMPTS} attempts for fact ${factId}`);
    }
  }, [retryCount, factId, retryImage, isImageLoading, displayUri]);

  // Reset retry state when imageUrl changes
  React.useEffect(() => {
    setRetryCount(0);
  }, [imageUrl]);

  // Determine category info for badge - memoized
  const categoryInfo = useMemo(() => {
    if (typeof category === "object" && category !== null) {
      return {
        name: category.name,
        color: category.color_hex || "#0066FF",
      };
    }
    const slug = (category as string) || categorySlug || "";
    // Simple category name from slug
    const name = slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return { name, color: "#0066FF" };
  }, [category, categorySlug]);

  // Generate image source - use displayUri which never goes null unnecessarily
  const imageSource = useMemo((): ImageSource | null => {
    if (!displayUri) {
      return null;
    }
    return { uri: displayUri };
  }, [displayUri]);

  // Memoize style objects to prevent recreation
  const marginStyle = useMemo(() => ({ 
    marginBottom: isTablet ? tokens.space.lg : tokens.space.md 
  }), [isTablet]);

  const imageContainerStyle = useMemo(() => ({ 
    height: cardHeight 
  }), [cardHeight]);

  const imageStyle = useMemo(() => ({
    width: "100%" as const,
    height: cardHeight + parallaxAmount * 2,
    marginTop: -parallaxAmount,
  }), [cardHeight]);

  const badgePositionStyle = useMemo(() => ({
    top: isTablet ? tokens.space.lg : tokens.space.md,
    right: isTablet ? tokens.space.lg : tokens.space.md,
  }), [isTablet]);

  const contentOverlayStyle = useMemo(() => ({
    paddingHorizontal: isTablet ? tokens.space.xl : tokens.space.lg,
    paddingBottom: isTablet ? tokens.space.xl : tokens.space.lg,
    paddingTop: isTablet ? tokens.space.xxl * 1.5 : tokens.space.xxl,
  }), [isTablet]);

  const titleStyle = useMemo(() => ({
    fontSize: isTablet
      ? tokens.fontSize.h1Tablet
      : Math.round(fontSizes.h1 * 0.85),
    lineHeight: isTablet
      ? tokens.fontSize.h1Tablet * 1.25
      : Math.round(fontSizes.h1 * 0.85 * 1.25),
  }), [isTablet, fontSizes.h1]);

  const badgeTextStyle = useMemo(() => ({ 
    fontSize: isTablet ? 14 : 12 
  }), [isTablet]);

  // Stable recycling key - only changes with factId, not with retryCount
  // This prevents the Image component from being recreated unnecessarily
  const recyclingKey = useMemo(() => `fact-image-${factId}`, [factId]);

  // Animated style - transform array for scale animation
  const animatedStyle = {
    transform: [{ scale: scaleAnim }],
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={androidRipple}
        style={styles.pressable}
      >
        <View style={[styles.cardWrapper, marginStyle]}>
          {/* Image Container */}
          <View style={[styles.imageContainer, imageContainerStyle]}>
            {/* Image */}
            <Image
              source={imageSource}
              style={imageStyle}
              contentFit="cover"
              contentPosition="top"
              // Use disk-only on Android to avoid memory cache issues
              cachePolicy={Platform.OS === "android" ? "disk" : "memory-disk"}
              // Disable transition on Android to prevent flicker
              transition={Platform.OS === "android" ? 0 : 300}
              // Show blurhash while image is loading/downloading with App Check
              placeholder={placeholder}
              onError={handleImageError}
              // Stable recyclingKey - doesn't change with retry
              recyclingKey={recyclingKey}
              // Priority hint for loading
              priority="normal"
            />

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
                numberOfLines={isTablet ? 4 : 3}
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
    // Ensures the ripple effect is contained
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
    fontFamily: "Montserrat_600SemiBold",
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
    fontFamily: "Montserrat_700Bold",
    fontWeight: "700",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});

// Memoize the component to prevent unnecessary re-renders
// Only compare stable props - onPress is intentionally excluded as it's usually recreated
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
