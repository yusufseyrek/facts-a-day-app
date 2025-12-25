import React, { useState, useCallback } from "react";
import { Pressable, Animated, StyleSheet, View, Text } from "react-native";
import { Image, ImageLoadEventData } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { tokens } from "../theme/tokens";
import { useResponsive } from "../utils/useResponsive";
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
  category?: string | Category;
  categorySlug?: string;
  onPress: () => void;
  isTablet?: boolean;
  /** Animated scroll Y value for parallax effect */
  scrollY?: Animated.Value;
  /** Card's position in viewport for parallax calculation */
  cardIndex?: number;
}

const ImageFactCardComponent = ({
  title,
  imageUrl,
  category,
  categorySlug,
  onPress,
  isTablet: isTabletProp = false,
  scrollY,
  cardIndex = 0,
}: ImageFactCardProps) => {
  const { fontSizes, isTablet: isTabletDevice, screenWidth } = useResponsive();
  const isTablet = isTabletProp || isTabletDevice;
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  
  // Image retry state
  const [retryCount, setRetryCount] = useState(0);
  const [imageKey, setImageKey] = useState(0);
  const [hasError, setHasError] = useState(false);

  // Calculate card height based on aspect ratio
  const cardHeight = screenWidth * ASPECT_RATIO;

  // Parallax effect: subtle image movement based on scroll position
  const parallaxAmount = 8;
  const imageTranslateY = scrollY
    ? scrollY.interpolate({
        inputRange: [
          -cardHeight,
          0,
          cardHeight * (cardIndex + 1),
          cardHeight * (cardIndex + 2),
        ],
        outputRange: [parallaxAmount, 0, -parallaxAmount, -parallaxAmount * 2],
        extrapolate: "clamp",
      })
    : new Animated.Value(0);

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  // Handle image load error with retry logic
  const handleImageError = useCallback(() => {
    if (retryCount < MAX_RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount);
      console.log(`🔄 Image load failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);
      
      setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        setImageKey((prev) => prev + 1); // Force re-render of Image component
      }, delay);
    } else {
      console.log(`❌ Image load failed after ${MAX_RETRY_ATTEMPTS} attempts: ${imageUrl}`);
      setHasError(true);
    }
  }, [retryCount, imageUrl]);

  // Reset retry state when imageUrl changes
  React.useEffect(() => {
    setRetryCount(0);
    setImageKey(0);
    setHasError(false);
  }, [imageUrl]);

  // Determine category info for badge
  const getCategoryInfo = useCallback(() => {
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

  const categoryInfo = getCategoryInfo();

  // Generate image URL with cache buster for retries
  const getImageSource = useCallback(() => {
    if (retryCount === 0) {
      return { uri: imageUrl };
    }
    // Add cache buster for retries
    const separator = imageUrl.includes("?") ? "&" : "?";
    return { uri: `${imageUrl}${separator}_retry=${retryCount}` };
  }, [imageUrl, retryCount]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={{
          color: "rgba(255, 255, 255, 0.15)",
          borderless: false,
        }}
      >
        <View style={[styles.cardWrapper, { marginBottom: isTablet ? tokens.space.lg : tokens.space.md }]}>
          {/* Image Container */}
          <View style={[styles.imageContainer, { height: cardHeight }]}>
            {/* Parallax Image */}
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { transform: [{ translateY: imageTranslateY }] },
              ]}
            >
              <Image
                key={imageKey}
                source={getImageSource()}
                style={{
                  width: "100%",
                  height: cardHeight + parallaxAmount * 2,
                  marginTop: -parallaxAmount,
                }}
                contentFit="cover"
                contentPosition="top"
                cachePolicy="memory-disk"
                transition={300}
                placeholder={{ blurhash: DEFAULT_BLURHASH }}
                onError={handleImageError}
                recyclingKey={`${imageUrl}-${imageKey}`}
              />
            </Animated.View>

            {/* Dark gradient overlay for text legibility */}
            <LinearGradient
              colors={["transparent", "rgba(0, 0, 0, 0.3)", "rgba(0, 0, 0, 0.75)"]}
              locations={[0.3, 0.6, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Category badge */}
            {categoryInfo.name && (
              <View
                style={[
                  styles.badgeContainer,
                  {
                    top: isTablet ? tokens.space.lg : tokens.space.md,
                    right: isTablet ? tokens.space.lg : tokens.space.md,
                  },
                ]}
              >
                <View style={[styles.badge, { backgroundColor: categoryInfo.color }]}>
                  <Text style={[styles.badgeText, { fontSize: isTablet ? 14 : 12 }]}>
                    {categoryInfo.name}
                  </Text>
                </View>
              </View>
            )}

            {/* Content overlay */}
            <View
              style={[
                styles.contentOverlay,
                {
                  paddingHorizontal: isTablet ? tokens.space.xl : tokens.space.lg,
                  paddingBottom: isTablet ? tokens.space.xl : tokens.space.lg,
                  paddingTop: isTablet ? tokens.space.xxl * 1.5 : tokens.space.xxl,
                },
              ]}
            >
              {/* Title */}
              <Text
                style={[
                  styles.title,
                  {
                    fontSize: isTablet
                      ? tokens.fontSize.h1Tablet
                      : Math.round(fontSizes.h1 * 0.85),
                    lineHeight: isTablet
                      ? tokens.fontSize.h1Tablet * 1.25
                      : Math.round(fontSizes.h1 * 0.85 * 1.25),
                  },
                ]}
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

const styles = StyleSheet.create({
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
export const ImageFactCard = React.memo(
  ImageFactCardComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.title === nextProps.title &&
      prevProps.imageUrl === nextProps.imageUrl &&
      prevProps.categorySlug === nextProps.categorySlug &&
      prevProps.isTablet === nextProps.isTablet &&
      prevProps.cardIndex === nextProps.cardIndex
    );
  }
);
