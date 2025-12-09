import React, { useRef, useEffect } from "react";
import { Pressable, Dimensions, Animated, View, StyleSheet, Platform, useWindowDimensions, PanResponder, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { X } from "@tamagui/lucide-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { tokens } from "../theme/tokens";
import { FactActions } from "./FactActions";
import { CategoryBadge } from "./CategoryBadge";
import { BodyText, SerifTitle } from "./Typography";
import { useTheme } from "../theme";
import { useTranslation } from "../i18n";
import type { FactWithRelations, Category } from "../services/database";
import { BannerAd } from "./ads";
import { openInAppBrowser } from "../utils/browser";

// Device breakpoints
const TABLET_BREAKPOINT = 768;

interface FactModalProps {
  fact: FactWithRelations;
  onClose: () => void;
}

const Container = styled(YStack, {
  flex: 1,
  backgroundColor: "$surface",
});

const CloseButton = styled(YStack, {
  width: 36,
  height: 36,
  borderRadius: tokens.radius.full,
  backgroundColor: "rgba(0, 0, 0, 0.4)",
  alignItems: "center",
  justifyContent: "center",
});

const HeaderContainer = styled(XStack, {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 100,
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: tokens.space.lg,
  variants: {
    tablet: {
      true: {
        paddingHorizontal: tokens.space.xxl,
      },
    },
  } as const,
});

const HeaderTitleContainer = styled(XStack, {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
});

const ContentSection = styled(YStack, {
  paddingHorizontal: tokens.space.lg,
  paddingTop: tokens.space.lg,
  paddingBottom: tokens.space.md,
  gap: tokens.space.md,
  variants: {
    tablet: {
      true: {
        paddingHorizontal: tokens.space.xxl,
        paddingTop: tokens.space.xxl,
        paddingBottom: tokens.space.xl,
        gap: tokens.space.xl,
      },
    },
  } as const,
});

const TabletWrapper = styled(YStack, {
  width: "100%",
});

const BadgesRow = styled(XStack, {
  gap: tokens.space.sm,
  flexWrap: "wrap",
});

const SourceLink = styled(YStack, {
  paddingTop: tokens.space.md,
  borderTopWidth: 1,
  borderTopColor: "$border",
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

export function FactModal({ fact, onClose }: FactModalProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const isTablet = SCREEN_WIDTH >= TABLET_BREAKPOINT;
  const isLandscape = SCREEN_WIDTH > SCREEN_HEIGHT;
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const currentScrollY = useRef(0);
  const [closeButtonVisible, setCloseButtonVisible] = React.useState(true);
  const [headerShouldBlock, setHeaderShouldBlock] = React.useState(false);
  const [titleHeight, setTitleHeight] = React.useState(24); // Default to 1 line height
  
  // For tablets: full width in portrait (square), full width with half height in landscape
  // For phones: square (full width)
  const IMAGE_WIDTH = SCREEN_WIDTH;
  const IMAGE_HEIGHT = isTablet 
    ? (isLandscape ? IMAGE_WIDTH * 0.4 : IMAGE_WIDTH * 0.8) 
    : SCREEN_WIDTH;

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  const handleSourcePress = () => {
    if (fact?.source_url) {
      openInAppBrowser(fact.source_url, { theme }).catch((err) => {
        console.error("Failed to open URL:", err);
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

  const hasImage = !!fact.image_url;
  
  // Calculate dynamic header height first (needed for transition calculations)
  const basePaddingTop = Platform.OS === "ios" ? tokens.space.lg : insets.top + tokens.space.sm;
  const basePaddingBottom = Platform.OS === "ios" ? tokens.space.lg : tokens.space.md;
  const dynamicHeaderHeight = basePaddingTop + basePaddingBottom + titleHeight + 8;
  const minHeaderHeight = Platform.OS === "ios" ? 100 : 70 + insets.top;
  const headerHeight = Math.max(dynamicHeaderHeight, minHeaderHeight);

  // Header background appears when image starts to be covered (for images) or early for no image
  const HEADER_BG_TRANSITION = hasImage ? IMAGE_HEIGHT - headerHeight : 100;
  
  // Title animation starts when scroll position reaches headerHeight + contentPaddingTop
  const contentPaddingTop = isTablet ? tokens.space.xxl : tokens.space.lg;
  const TRANSITION_START = headerHeight + contentPaddingTop;
  const TRANSITION_END = TRANSITION_START + 10; // Small buffer for smooth transition
  
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
      setHeaderShouldBlock(initialValue >= HEADER_BG_TRANSITION);
      
      const listener = scrollY.addListener(({ value }) => {
        setCloseButtonVisible(value < threshold);
        setHeaderShouldBlock(value >= HEADER_BG_TRANSITION);
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
    inputRange: [0, Math.max(0, HEADER_BG_TRANSITION - 0.01), HEADER_BG_TRANSITION],
    outputRange: [1, 1, 0],
    extrapolate: "clamp",
  });

  // Header container opacity - appears instantly when header background should show
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, Math.max(0, HEADER_BG_TRANSITION - 0.01), HEADER_BG_TRANSITION],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  // Fade opacity - overlay for header background image (slowly fades in after header becomes visible)
  const FADE_DURATION = 70; // Pixels over which to fade in after header becomes visible
  const fadeOpacity = scrollY.interpolate({
    inputRange: [
      HEADER_BG_TRANSITION, 
      HEADER_BG_TRANSITION + FADE_DURATION
    ],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // Content title opacity - stays visible, no fade
  const contentTitleOpacity = scrollY.interpolate({
    inputRange: [0, 1000],
    outputRange: [1, 1],
    extrapolate: "clamp",
  });

  const iosShadowOffset = Platform.OS === "ios" ? 4 : 0;
  const tabletMagicNumber = (isTablet ? tokens.space.lg : 0)

  // Header title opacity - fades in with overlay for smooth appearance
  const headerTitleOpacity = fadeOpacity;

  // Header title translateY - slides up from bottom of header as scrollY increases
  // Animation starts when header becomes visible (at HEADER_BG_TRANSITION)
  const headerTitleStartY = headerHeight - basePaddingTop + basePaddingBottom - iosShadowOffset + tabletMagicNumber; // Start from bottom of header
  
  // Continuous animation: translateY decreases (moves up) as scrollY increases
  // The title starts moving up when header becomes visible and continues to move up as user scrolls
  // Clamped at 0 to prevent going below the header
  const headerTitleTranslateY = scrollY.interpolate({
    inputRange: [
      Math.max(0, HEADER_BG_TRANSITION - 1), 
      HEADER_BG_TRANSITION, 
      HEADER_BG_TRANSITION + headerTitleStartY
    ],
    outputRange: [
      headerTitleStartY, 
      headerTitleStartY, 
      0
    ], 
    extrapolate: "clamp", // Clamp at 0 to prevent going below header
  });

  // Header background image position - shows the center portion of the image
  // To center the image in the header: translate up by (IMAGE_HEIGHT - headerHeight) / 2
  // This aligns the center of the image with the center of the header
  const headerImageTranslateY = hasImage ? -(IMAGE_HEIGHT - headerHeight) / 2 : 0;
  const fadedImageTranslateY = hasImage ? scrollY.interpolate({
    inputRange: [-100, 0, HEADER_BG_TRANSITION, HEADER_BG_TRANSITION + 1000],
    outputRange: [-50, headerImageTranslateY, headerImageTranslateY, headerImageTranslateY], // Show center portion
    extrapolate: "clamp",
  }) : new Animated.Value(0);

  // Close button opacity - hides when header appears (no X button in header)
  const closeButtonOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_BG_TRANSITION * 0.7, HEADER_BG_TRANSITION],
    outputRange: [1, 0.5, 0],
    extrapolate: "clamp",
  });

  const factTitle = fact.title || fact.content.substring(0, 60) + "...";

  return (
    <Container>
      {/* Hidden measurement view to get accurate title height */}
      <View
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          zIndex: -1,
          width: isTablet 
            ? SCREEN_WIDTH - tokens.space.xxl * 2
            : SCREEN_WIDTH - tokens.space.lg * 2,
        }}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          if (height > 0 && height !== titleHeight) {
            setTitleHeight(height);
          }
        }}
      >
        <SerifTitle
          fontSize={isTablet ? tokens.fontSize.h1Tablet : 26}
          lineHeight={isTablet ? tokens.fontSize.h1Tablet * 1.35 : 34}
          letterSpacing={0}
        >
          {factTitle}
        </SerifTitle>
      </View>
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
              shadowOffset: { width: 0, height: iosShadowOffset },
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
            paddingTop: Platform.OS === "ios" ? 0 : insets.top,
            overflow: "hidden",
            ...Platform.select({
              android: {
                elevation: 12,
                // Background color for elevation - matches the overlay/solid background
                backgroundColor: hasImage
                  ? (theme === "dark" ? "rgba(0, 0, 0, 0.35)" : "rgba(255, 255, 255, 0.5)")
                  : (theme === "dark" ? "rgba(0, 0, 0, 0.85)" : "rgba(255, 255, 255, 0.95)"),
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
                  source={{ uri: fact.image_url! }}
                  style={{
                    width: IMAGE_WIDTH,
                    height: IMAGE_HEIGHT,
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
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
          <HeaderContainer
            tablet={isTablet}
            pointerEvents="box-none"
              style={{
                paddingTop: Platform.OS === "ios" ? tokens.space.lg : insets.top + tokens.space.sm,
                minHeight: headerHeight,
                paddingBottom: Platform.OS === "ios" ? tokens.space.lg : tokens.space.md,
                zIndex: 101,
                alignItems: "center",
              }}
          >
            <HeaderTitleContainer pointerEvents="none">
              <Animated.View
                style={{
                  opacity: headerTitleOpacity,
                  flex: 1,
                  transform: [{ translateY: headerTitleTranslateY }],
                }}
              >
                <SerifTitle
                  fontSize={isTablet ? tokens.fontSize.h1Tablet : 26}
                  lineHeight={isTablet ? tokens.fontSize.h1Tablet * 1.35 : 34}
                  letterSpacing={0}
                >
                  {factTitle}
                </SerifTitle>
              </Animated.View>
            </HeaderTitleContainer>
          </HeaderContainer>
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        bounces={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {isTablet ? (
          <>
            {/* Hero Image Section - Full width outside wrapper */}
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
                    transform: [{ scale: imageScale }, { translateY: imageTranslateY }],
                  }}
                >
                  <Image
                    source={{ uri: fact.image_url! }}
                    style={{
                      width: IMAGE_WIDTH,
                      height: IMAGE_HEIGHT,
                    }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
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

            <TabletWrapper>
              {/* Content Section */}
            <ContentSection tablet={isTablet}>
              {/* Title - shown in content when header is not visible */}
              <Animated.View
                style={{
                  opacity: contentTitleOpacity,
                  minHeight: isTablet ? 44 : 30, // Preserve space to prevent layout shift
                }}
              >
                <SerifTitle 
                  fontSize={isTablet ? tokens.fontSize.h1Tablet : 26} 
                  lineHeight={isTablet ? tokens.fontSize.h1Tablet * 1.35 : 34} 
                  letterSpacing={0}
                >
                  {factTitle}
                </SerifTitle>
              </Animated.View>

              {/* Category Badge */}
              {categoryForBadge && (
                <BadgesRow>
                  <CategoryBadge 
                    category={categoryForBadge} 
                    fontWeight={tokens.fontWeight.bold}
                    fontSize={isTablet ? tokens.fontSize.labelTablet : tokens.fontSize.label}
                  />
                </BadgesRow>
              )}

              {/* Main Content */}
              <BodyText
                fontSize={isTablet ? tokens.fontSize.bodyTablet : 16}
                lineHeight={isTablet ? tokens.fontSize.bodyTablet * 1.85 : 28}
                letterSpacing={isTablet ? 0.5 : 0.3}
                color="$text"
              >
                {fact.content}
              </BodyText>

              {/* Source Link */}
              {fact.source_url && (
                <SourceLink>
                  <Pressable onPress={handleSourcePress}>
                    <BodyText
                      fontSize={isTablet ? tokens.fontSize.bodyTablet : 15}
                      lineHeight={isTablet ? tokens.fontSize.bodyTablet * 1.5 : 22}
                      color="$primary"
                      textDecorationLine="underline"
                      fontFamily="Montserrat_600SemiBold"
                    >
                      {t("sourcePrefix")}
                      {extractDomain(fact.source_url)}
                    </BodyText>
                  </Pressable>
                </SourceLink>
              )}
            </ContentSection>
            </TabletWrapper>
          </>
        ) : (
          <>
            {/* Hero Image Section */}
            {hasImage && (
              <Animated.View
                style={{
                  position: "relative",
                  overflow: "hidden",
                  width: SCREEN_WIDTH,
                  height: SCREEN_WIDTH, // Keep space even when image fades out
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
                    transform: [{ scale: imageScale }, { translateY: imageTranslateY }],
                  }}
                >
                  <Image
                    source={{ uri: fact.image_url! }}
                    style={{
                      width: SCREEN_WIDTH,
                      height: SCREEN_WIDTH,
                    }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
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

            {/* Content Section */}
            <ContentSection tablet={isTablet}>
              {/* Title - shown in content when header is not visible */}
              <Animated.View
                style={{
                  opacity: contentTitleOpacity,
                  minHeight: 30, // Preserve space to prevent layout shift
                }}
              >
                <SerifTitle 
                  fontSize={26} 
                  lineHeight={34} 
                  letterSpacing={0}
                >
                  {factTitle}
                </SerifTitle>
              </Animated.View>

              {/* Category Badge */}
              {categoryForBadge && (
                <BadgesRow>
                  <CategoryBadge 
                    category={categoryForBadge} 
                    fontWeight={tokens.fontWeight.bold}
                    fontSize={isTablet ? tokens.fontSize.labelTablet : tokens.fontSize.label}
                  />
                </BadgesRow>
              )}

              {/* Main Content */}
              <BodyText
                fontSize={16}
                lineHeight={28}
                letterSpacing={0.3}
                color="$text"
              >
                {fact.content}
              </BodyText>

              {/* Source Link */}
              {fact.source_url && (
                <SourceLink>
                  <Pressable onPress={handleSourcePress}>
                    <BodyText
                      fontSize={15}
                      lineHeight={22}
                      color="$primary"
                      textDecorationLine="underline"
                      fontFamily="Montserrat_600SemiBold"
                    >
                      {t("sourcePrefix")}
                      {extractDomain(fact.source_url)}
                    </BodyText>
                  </Pressable>
                </SourceLink>
              )}
            </ContentSection>
          </>
        )}
      </Animated.ScrollView>

      {/* Fixed Close Button - visible when header is not shown */}
      {hasImage && (
        <Animated.View
          style={{
            position: "absolute",
            top: (Platform.OS === "ios" ? 0 : insets.top) + (isTablet ? tokens.space.xxl : tokens.space.xl),
            right: isTablet ? tokens.space.xxl : tokens.space.xl,
            opacity: closeButtonOpacity,
            zIndex: 9999,
            ...Platform.select({
              android: {
                elevation: 999, // Much higher than any other element to receive touches
              },
            }),
          }}
          collapsable={false}
          pointerEvents={Platform.OS === "android" && hasImage && !closeButtonVisible ? "none" : "box-none"}
        >
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={{
              width: 36,
              height: 36,
              borderRadius: tokens.radius.full,
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={isTablet ? 24 : 18} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Close button for facts without images */}
      {!hasImage && (
        <Animated.View
          style={{
            position: "absolute",
            top: insets.top + (isTablet ? tokens.space.xxl : tokens.space.xl),
            right: isTablet ? tokens.space.xxl : tokens.space.xl,
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
            style={{
              width: 36,
              height: 36,
              borderRadius: tokens.radius.full,
              backgroundColor: theme === "dark"
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.08)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X
              size={isTablet ? 24 : 18}
              color={
                theme === "dark"
                  ? "#FFFFFF"
                  : tokens.color.light.text
              }
            />
          </TouchableOpacity>
        </Animated.View>
      )}

      <BannerAd position="modal" />

      <FactActions
        factId={fact.id}
        factTitle={fact.title}
        factContent={fact.content}
      />
    </Container>
  );
}
