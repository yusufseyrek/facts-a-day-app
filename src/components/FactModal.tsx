import React, { useRef, useEffect, useState } from "react";
import {
  Pressable,
  Animated,
  View,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
  AccessibilityInfo,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { styled } from "@tamagui/core";
import { ImagePlus, X, Calendar } from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack, XStack } from "tamagui";

import { BannerAd } from "./ads";
import { CategoryBadge } from "./CategoryBadge";
import { FactActions } from "./FactActions";
import { Text, FONT_FAMILIES } from "./Typography";
import { useTranslation } from "../i18n";
import { addCategoryKeyword } from "../services/adKeywords";
import { trackSourceLinkClick } from "../services/analytics";
import {
  getLocalNotificationImagePath,
  deleteNotificationImage,
} from "../services/notifications";
import { hexColors, getCategoryNeonColor, useTheme } from "../theme";
import { openInAppBrowser } from "../utils/browser";
import { useFactImage } from "../utils/useFactImage";
import { useResponsive } from "../utils/useResponsive";

import type { FactWithRelations, Category } from "../services/database";

interface FactModalProps {
  fact: FactWithRelations;
  onClose: () => void;
}

// Styled components without static responsive values - use inline props with useResponsive()
const HeaderTitleContainer = styled(XStack, {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
});

function slugToTitleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return "Source";
  }
}

function formatLastUpdated(dateString: string, locale: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function FactModal({ fact, onClose }: FactModalProps) {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const {
    typography,
    spacing,
    iconSizes,
    isTablet,
    screenWidth: SCREEN_WIDTH,
    screenHeight: SCREEN_HEIGHT,
    config,
    radius,
    borderWidths,
  } = useResponsive();

  const insets = useSafeAreaInsets();
  const isLandscape = SCREEN_WIDTH > SCREEN_HEIGHT;
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const currentScrollY = useRef(0);
  const [closeButtonVisible, setCloseButtonVisible] = useState(true);
  const [titleHeight, setTitleHeight] = useState<number>(
    typography.lineHeight.headline
  ); // Default to 1 line height
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH); // Actual modal width

  // Use authenticated image with App Check - downloads and caches locally
  const { imageUri: authenticatedImageUri, isLoading: isImageLoading } =
    useFactImage(fact.image_url, fact.id);

  // Shimmer animation for loading placeholder
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Show loading placeholder when we have a URL but image is still loading
  const showImagePlaceholder =
    !!fact.image_url && isImageLoading && !authenticatedImageUri;

  // Run shimmer animation when loading
  useEffect(() => {
    if (showImagePlaceholder) {
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
  }, [showImagePlaceholder, shimmerAnim]);

  // Add fact category to ad keywords for better ad targeting
  useEffect(() => {
    const categorySlug = fact.categoryData?.slug || fact.category;
    if (categorySlug) {
      addCategoryKeyword(categorySlug);
    }
  }, [fact.id, fact.categoryData?.slug, fact.category]);

  // Local notification image state - prioritize notification image if available
  const [notificationImageUri, setNotificationImageUri] = useState<
    string | null
  >(null);

  // Check for local notification image and use it if available, then delete it
  useEffect(() => {
    let isMounted = true;

    const checkAndUseLocalImage = async () => {
      if (!fact.image_url) return;

      try {
        // Check if we have a locally cached notification image
        const localImagePath = await getLocalNotificationImagePath(fact.id);

        if (localImagePath && isMounted) {
          setNotificationImageUri(localImagePath);

          // Delete the notification image after a short delay to ensure it's loaded
          // This prevents the image from being deleted before it's displayed
          setTimeout(async () => {
            await deleteNotificationImage(fact.id);
          }, 1000);
        }
      } catch {
        // Ignore errors checking local notification image
      }
    };

    checkAndUseLocalImage();

    return () => {
      isMounted = false;
    };
  }, [fact.id, fact.image_url]);

  // Use notification image if available, otherwise use authenticated image
  // IMPORTANT: Never use remote URL directly as it requires App Check headers
  const imageUri = notificationImageUri || authenticatedImageUri;

  // Images are always square (1:1)
  // For tablets: landscape shows 50% height (more content visible), portrait shows 80% height centered
  // For phones: square (full width)
  // Use actual container width (measured via onLayout) instead of screen width for accurate sizing
  const IMAGE_WIDTH = containerWidth;
  const IMAGE_HEIGHT = isTablet
    ? isLandscape
      ? IMAGE_WIDTH * 0.7
      : IMAGE_WIDTH * 0.8
    : containerWidth;

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  const handleSourcePress = () => {
    if (fact?.source_url) {
      // Track source link click
      trackSourceLinkClick({
        factId: fact.id,
        domain: extractDomain(fact.source_url),
      });

      openInAppBrowser(fact.source_url, {
        theme,
        // Translate the source URL if user's locale is not English
        translateTo: locale !== "en" ? locale : undefined,
      }).catch(() => {
        // Ignore URL open errors
      });
    }
  };

  let categoryForBadge: string | Category | null = null;
  if (fact.categoryData) {
    categoryForBadge = fact.categoryData;
  } else if (fact.category) {
    try {
      const parsed = JSON.parse(fact.category);
      categoryForBadge = parsed.name || parsed.slug || fact.category;
    } catch {
      categoryForBadge = slugToTitleCase(fact.category);
    }
  }

  // Get category color (same logic as CategoryBadge)
  const categoryColor = React.useMemo(() => {
    if (!categoryForBadge) return null;
    if (typeof categoryForBadge === "string") {
      return getCategoryNeonColor(categoryForBadge, theme);
    }
    return (
      categoryForBadge.color_hex ||
      getCategoryNeonColor(categoryForBadge.slug, theme)
    );
  }, [categoryForBadge, theme]);

  const hasImage = !!imageUri;

  // Calculate dynamic header height first (needed for transition calculations)
  const basePaddingTop = Platform.OS === "ios" ? spacing.xl : insets.top;
  const basePaddingBottom = spacing.xl;
  const dynamicHeaderHeight = basePaddingTop + basePaddingBottom + titleHeight;
  const minHeaderHeight = Platform.OS === "ios" ? 100 : 70 + insets.top;
  const headerHeight = Math.max(dynamicHeaderHeight, minHeaderHeight);

  // Header background appears when image starts to be covered (for images) or early for no image
  const HEADER_BG_TRANSITION = hasImage ? IMAGE_HEIGHT - headerHeight : 100;

  // Track scroll position for gesture handling
  React.useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      currentScrollY.current = value;
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  // Update close button visibility and header pointer events for Android
  React.useEffect(() => {
    if (Platform.OS === "android" && hasImage) {
      // Match the opacity animation - button is visible until HEADER_BG_TRANSITION
      const threshold = HEADER_BG_TRANSITION * 0.95;
      const initialValue = (scrollY as any)._value || 0;
      setCloseButtonVisible(initialValue < threshold);

      const listener = scrollY.addListener(({ value }) => {
        setCloseButtonVisible(value < threshold);
      });
      return () => scrollY.removeListener(listener);
    }
  }, [HEADER_BG_TRANSITION, hasImage]);

  // Image scale - stays at 1, no scaling
  const imageScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.3, 1],
    extrapolateRight: "clamp",
  });

  // Image parallax - moves image down to show center portion
  // At transition: scroll = IMAGE_HEIGHT - headerHeight
  // Visible portion = headerHeight, we want to show center
  // To center: translateY = (IMAGE_HEIGHT - headerHeight) / 2
  const centeredTranslateY = hasImage ? (IMAGE_HEIGHT - headerHeight) / 2 : 0;
  const imageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, HEADER_BG_TRANSITION],
    outputRange: [-50, 0, centeredTranslateY], // At transition, show center portion
    extrapolate: "clamp",
  });

  // Body image opacity - hides instantly when header background appears (no fade)
  // Use very small epsilon to create instant cutoff without fade
  const bodyImageOpacity = scrollY.interpolate({
    inputRange: [
      0,
      Math.max(0, HEADER_BG_TRANSITION - 0.01),
      HEADER_BG_TRANSITION,
    ],
    outputRange: [1, 1, 0],
    extrapolate: "clamp",
  });

  // Header container opacity - appears instantly when header background should show
  const headerOpacity = scrollY.interpolate({
    inputRange: [
      0,
      Math.max(0, HEADER_BG_TRANSITION - 0.01),
      HEADER_BG_TRANSITION,
    ],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  // Fade opacity - overlay for header background image (slowly fades in after header becomes visible)
  const FADE_DURATION = 70; // Pixels over which to fade in after header becomes visible
  const fadeOpacity = scrollY.interpolate({
    inputRange: [HEADER_BG_TRANSITION, HEADER_BG_TRANSITION + FADE_DURATION],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // Content title opacity - stays visible, no fade
  const contentTitleOpacity = scrollY.interpolate({
    inputRange: [0, 1000],
    outputRange: [1, 1],
    extrapolate: "clamp",
  });

  // const tabletMagicNumber = isTablet ? 10 : 0;

  const tabletMagicNumber = 0;

  // Header title translateY - slides up from bottom of header as scrollY increases
  // Animation starts when header becomes visible (at HEADER_BG_TRANSITION)
  // Account for centering offset when header is clamped to minimum height
  // When clamped, extra space is distributed above/below title due to alignItems: "center"
  const clampedExtraSpace = Math.max(0, headerHeight - dynamicHeaderHeight);
  const centeringOffset = clampedExtraSpace / 2;
  const headerTitleStartY =
    headerHeight -
    basePaddingTop +
    basePaddingBottom +
    tabletMagicNumber -
    centeringOffset; // Start from bottom of header, adjusted for centering

  // Continuous animation: translateY decreases (moves up) as scrollY increases
  // The title starts moving up when header becomes visible and continues to move up as user scrolls
  // Clamped at 0 to prevent going below the header
  const headerTitleTranslateY = scrollY.interpolate({
    inputRange: [
      Math.max(0, HEADER_BG_TRANSITION - 1),
      HEADER_BG_TRANSITION,
      HEADER_BG_TRANSITION + headerTitleStartY,
    ],
    outputRange: [headerTitleStartY, headerTitleStartY, 0],
    extrapolate: "clamp", // Clamp at 0 to prevent going below header
  });

  // Header background image position - shows the center portion of the image
  // To center the image in the header: translate up by (IMAGE_HEIGHT - headerHeight) / 2
  // This aligns the center of the image with the center of the header
  const headerImageTranslateY = hasImage
    ? -(IMAGE_HEIGHT - headerHeight) / 2
    : 0;
  const fadedImageTranslateY = hasImage
    ? scrollY.interpolate({
        inputRange: [
          -100,
          0,
          HEADER_BG_TRANSITION,
          HEADER_BG_TRANSITION + 1000,
        ],
        outputRange: [
          -50,
          headerImageTranslateY,
          headerImageTranslateY,
          headerImageTranslateY,
        ], // Show center portion
        extrapolate: "clamp",
      })
    : new Animated.Value(0);

  // Close button opacity - hides when header appears (no X button in header)
  const closeButtonOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_BG_TRANSITION * 0.7, HEADER_BG_TRANSITION],
    outputRange: [1, 0.5, 0],
    extrapolate: "clamp",
  });

  // Badge scroll threshold - when category badge scrolls under the header
  // Badge is at: IMAGE_HEIGHT (or 0 if no image) + contentPadding + titleHeight + gap
  const BADGE_SCROLL_THRESHOLD =
    (hasImage ? IMAGE_HEIGHT : 0) +
    spacing.lg +
    titleHeight +
    spacing.md -
    headerHeight;

  // Header border animations - appears when category badge scrolls under header
  // ScaleX animation for sleek reveal from center
  const headerBorderScaleX = scrollY.interpolate({
    inputRange: [BADGE_SCROLL_THRESHOLD, BADGE_SCROLL_THRESHOLD + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // Subtle opacity fade for polish
  const headerBorderOpacity = scrollY.interpolate({
    inputRange: [BADGE_SCROLL_THRESHOLD, BADGE_SCROLL_THRESHOLD + 20],
    outputRange: [0, 0.7],
    extrapolate: "clamp",
  });

  // Category badge fade out as it approaches the header
  const categoryBadgeOpacity = scrollY.interpolate({
    inputRange: [
      Math.max(0, BADGE_SCROLL_THRESHOLD - 5),
      BADGE_SCROLL_THRESHOLD + 35,
    ],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const factTitle = fact.title || fact.content.substring(0, 60) + "...";

  // Announce modal opening to screen readers
  useEffect(() => {
    // Small delay to ensure the modal is rendered
    const timer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(factTitle);
    }, 100);
    return () => clearTimeout(timer);
  }, [factTitle]);

  return (
    <View
      style={{ flex: 1, backgroundColor: theme === 'dark' ? hexColors.dark.surface : hexColors.light.surface }}
      accessibilityViewIsModal={true}
      accessibilityLabel={factTitle}
      accessibilityRole="none"
      importantForAccessibility="yes"
      onLayout={(event) => {
        const { width } = event.nativeEvent.layout;
        if (width > 0 && width !== containerWidth) {
          setContainerWidth(width);
        }
      }}
    >
      {/* Sticky Header with Faded Image Background */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          opacity: headerOpacity,
          minHeight: headerHeight,
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
            },
          }),
        }}
        collapsable={false}
        pointerEvents="box-none"
      >
        <Animated.View
          pointerEvents="none"
          style={{
            minHeight: headerHeight,
            overflow: "hidden",
            ...Platform.select({
              android: {
                elevation: 12,
                // Background color for elevation - matches the overlay/solid background
                backgroundColor: hasImage
                  ? theme === "dark"
                    ? "rgba(0, 0, 0, 0.35)"
                    : "rgba(255, 255, 255, 0.5)"
                  : theme === "dark"
                  ? "rgba(0, 0, 0, 0.85)"
                  : "rgba(255, 255, 255, 0.95)",
              },
            }),
          }}
        >
          {/* Faded background image behind header */}
          {hasImage && (
            <Animated.View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: "hidden",
              }}
            >
              <Animated.View
                style={{
                  width: IMAGE_WIDTH,
                  height: IMAGE_HEIGHT,
                  transform: [{ translateY: fadedImageTranslateY }],
                }}
              >
                <Image
                  source={{ uri: imageUri! }}
                  aria-label={t("a11y_factImage", { title: factTitle })}
                  role="img"
                  style={{
                    width: IMAGE_WIDTH,
                    height: IMAGE_HEIGHT,
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </Animated.View>
              {/* Overlay for better text readability */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: fadeOpacity,
                    backgroundColor:
                      theme === "dark"
                        ? "rgba(0, 0, 0, 0.35)"
                        : "rgba(255, 255, 255, 0.5)",
                  },
                ]}
              />
            </Animated.View>
          )}
          {/* Solid background for header when no image */}
          {!hasImage && (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    theme === "dark"
                      ? "rgba(0, 0, 0, 0.85)"
                      : "rgba(255, 255, 255, 0.95)",
                },
              ]}
            />
          )}
          {/* Header content */}
          <XStack
            position="absolute"
            top={0}
            left={0}
            right={0}
            zIndex={100}
            alignItems="center"
            justifyContent="space-between"
            paddingHorizontal={spacing.xl}
            pointerEvents="box-none"
            style={{
              paddingTop: basePaddingTop,
              minHeight: headerHeight,
              paddingBottom: basePaddingBottom,
              zIndex: 101,
              alignItems: "center",
            }}
          >
            <HeaderTitleContainer pointerEvents="none">
              <Animated.View
                style={{
                  flex: 1,
                  transform: [{ translateY: headerTitleTranslateY }],
                }}
              >
                <Text.Headline>{factTitle}</Text.Headline>
              </Animated.View>
            </HeaderTitleContainer>
          </XStack>
          {/* Animated border bottom when category badge is hidden */}
          {categoryColor && (
            <Animated.View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: borderWidths.heavy,
                backgroundColor: categoryColor,
                opacity: headerBorderOpacity,
                transform: [{ scaleX: headerBorderScaleX }],
              }}
              pointerEvents="none"
            />
          )}
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        bounces={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        // Optimize scroll performance on Android
        removeClippedSubviews={Platform.OS === "android"}
      >
        {/* Hero Image Section */}
        {hasImage && (
          <Animated.View
            style={{
              position: "relative",
              overflow: "hidden",
              width: IMAGE_WIDTH,
              height: IMAGE_HEIGHT,
              opacity: bodyImageOpacity,
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                transform: [
                  { scale: imageScale },
                  { translateY: imageTranslateY },
                ],
              }}
            >
              <Image
                source={{ uri: imageUri! }}
                aria-label={t("a11y_factImage", { title: factTitle })}
                role="img"
                style={{
                  width: IMAGE_WIDTH,
                  height: isTablet ? IMAGE_HEIGHT : IMAGE_WIDTH,
                }}
                contentFit="cover"
                cachePolicy="memory-disk"
                placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
              />
            </Animated.View>
            {/* Gradient overlay */}
            <LinearGradient
              colors={["rgba(0,0,0,0.5)", "transparent", "transparent"]}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 120,
              }}
              pointerEvents="none"
            />
          </Animated.View>
        )}

        {/* Image Loading Placeholder */}
        {showImagePlaceholder && (
          <View
            style={{
              width: IMAGE_WIDTH,
              height: IMAGE_HEIGHT,
              backgroundColor: theme === "dark" ? "#1a1a2e" : "#e8e8f0",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: theme === "dark" ? "#2d2d44" : "#d0d0e0",
                  opacity: shimmerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 0.6],
                  }),
                },
              ]}
            />
            <View style={{ alignItems: "center", gap: spacing.sm }}>
              <ImagePlus
                size={iconSizes.xl}
                color={
                  theme === "dark" ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)"
                }
              />
            </View>
          </View>
        )}

        {/* Content Section */}
        <YStack padding={spacing.xl} gap={spacing.md}>
          {/* Title - shown in content when header is not visible */}
          <Animated.View
            style={{
              opacity: contentTitleOpacity,
            }}
          >
            <Text.Headline
              role="heading"
              onTextLayout={(e) => {
                const lines = e.nativeEvent.lines;
                const totalHeight = lines.reduce(
                  (sum, line) => sum + line.height,
                  0
                );
                if (totalHeight > 0 && totalHeight !== titleHeight) {
                  setTitleHeight(totalHeight);
                }
              }}
            >
              {factTitle}
            </Text.Headline>
          </Animated.View>

          {/* Category Badge & Date */}
          {(categoryForBadge || fact.last_updated || fact.created_at) && (
            <XStack
              gap={spacing.sm}
              flexWrap="wrap"
              alignItems="center"
              justifyContent="space-between"
              width="100%"
            >
              {categoryForBadge && (
                <Animated.View style={{ opacity: categoryBadgeOpacity }}>
                  <CategoryBadge category={categoryForBadge} />
                </Animated.View>
              )}
              {(fact.last_updated || fact.created_at) && (
                <XStack alignItems="center" gap={spacing.xs}>
                  <Text.Body
                    fontSize={typography.fontSize.label}
                    color="$textSecondary"
                    fontFamily={FONT_FAMILIES.semibold}
                  >
                    {formatLastUpdated(
                      fact.last_updated || fact.created_at,
                      locale
                    )}
                  </Text.Body>
                  <Calendar size={iconSizes.xs} color="$textSecondary" />
                </XStack>
              )}
            </XStack>
          )}

          {/* Summary */}
          {fact.summary && (
            <Text.Body color="$text" fontFamily={FONT_FAMILIES.semibold}>
              {fact.summary}
            </Text.Body>
          )}

          {/* Banner between summary and content */}
          <BannerAd position="fact-modal" />

          {/* Main Content */}
          <Text.Body color="$text" fontFamily={FONT_FAMILIES.regular}>
            {fact.content}
          </Text.Body>

          {/* Source Link */}
          {fact.source_url && (
            <YStack
              paddingTop={spacing.md}
              borderTopWidth={1}
              borderTopColor="$border"
            >
              <Pressable
                onPress={handleSourcePress}
                role="link"
                aria-label={t("a11y_sourceLink", {
                  domain: extractDomain(fact.source_url),
                })}
              >
                <Text.Body
                  letterSpacing={0.2}
                  color="$primary"
                  textDecorationLine="underline"
                  fontFamily={FONT_FAMILIES.semibold}
                >
                  {t("sourcePrefix")}
                  {extractDomain(fact.source_url)}
                </Text.Body>
              </Pressable>
            </YStack>
          )}
        </YStack>
      </Animated.ScrollView>

      {/* Fixed Close Button - visible when header is not shown */}
      {hasImage && (
        <Animated.View
          style={{
            position: "absolute",
            top: (Platform.OS === "ios" ? 0 : insets.top) + spacing.xl,
            right: spacing.xl,
            opacity: closeButtonOpacity,
            zIndex: 9999,
            ...Platform.select({
              android: {
                elevation: 999, // Much higher than any other element to receive touches
              },
            }),
          }}
          collapsable={false}
          pointerEvents={
            Platform.OS === "android" && hasImage && !closeButtonVisible
              ? "none"
              : "box-none"
          }
        >
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            testID="fact-modal-close-button"
            aria-label={t("a11y_closeButton")}
            role="button"
            style={{
              width: iconSizes.xl,
              height: iconSizes.xl,
              borderRadius: radius.full,
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={iconSizes.md} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Close button for facts without images */}
      {!hasImage && (
        <Animated.View
          style={{
            position: "absolute",
            top: insets.top + spacing.xl,
            right: spacing.xl,
            zIndex: 9999,
            ...Platform.select({
              android: {
                elevation: 999, // Much higher than any other element to receive touches
              },
            }),
          }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            testID="fact-modal-close-button"
            aria-label={t("a11y_closeButton")}
            role="button"
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.full,
              backgroundColor:
                theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X
              size={iconSizes.md}
              color={theme === "dark" ? "#FFFFFF" : hexColors.light.text}
            />
          </TouchableOpacity>
        </Animated.View>
      )}

      <FactActions
        factId={fact.id}
        factTitle={fact.title}
        factContent={fact.content}
        imageUrl={imageUri || undefined}
        category={fact.categoryData?.slug || fact.category || "unknown"}
      />
    </View>
  );
}
