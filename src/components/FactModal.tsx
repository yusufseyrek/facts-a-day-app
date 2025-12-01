import React, { useRef } from "react";
import { Pressable, Linking, Dimensions, Animated, View, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { X } from "@tamagui/lucide-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { tokens } from "../theme/tokens";
import { FactActions } from "./FactActions";
import { CategoryBadge } from "./CategoryBadge";
import { BodyText, SerifTitle } from "./Typography";
import { useTheme } from "../theme";
import { useTranslation } from "../i18n";
import type { FactWithRelations, Category } from "../services/database";
import { BannerAd } from "./ads";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_HEIGHT = SCREEN_WIDTH;

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
  paddingHorizontal: tokens.space.xl,
  minHeight: 60,
});

const HeaderTitleContainer = styled(XStack, {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: tokens.space.md,
});

const ContentSection = styled(YStack, {
  paddingHorizontal: tokens.space.xl,
  paddingTop: tokens.space.xl,
  paddingBottom: tokens.space.lg,
  gap: tokens.space.lg,
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
  const scrollY = useRef(new Animated.Value(0)).current;
  const [closeButtonVisible, setCloseButtonVisible] = React.useState(true);
  const [headerShouldBlock, setHeaderShouldBlock] = React.useState(false);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  const handleSourcePress = () => {
    if (fact?.source_url) {
      Linking.openURL(fact.source_url).catch((err) => {
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
  // Header starts appearing at 60% of image height (or 100px for no image), fully visible at 80%
  const HEADER_START = hasImage ? IMAGE_HEIGHT * 0.6 : 100;
  const HEADER_END = hasImage ? IMAGE_HEIGHT * 0.8 : 150;
  
  // Update close button visibility and header pointer events for Android
  React.useEffect(() => {
    if (Platform.OS === "android" && hasImage) {
      const threshold = HEADER_START * 0.5;
      // Check initial value
      const initialValue = (scrollY as any)._value || 0;
      setCloseButtonVisible(initialValue < threshold);
      setHeaderShouldBlock(initialValue >= HEADER_START);
      
      const listener = scrollY.addListener(({ value }) => {
        setCloseButtonVisible(value < threshold);
        setHeaderShouldBlock(value >= HEADER_START);
      });
      return () => scrollY.removeListener(listener);
    }
  }, [HEADER_START, hasImage]);

  // Image parallax and scale animations
  const imageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, IMAGE_HEIGHT],
    outputRange: [-50, 0, IMAGE_HEIGHT * 0.4],
    extrapolate: "clamp",
  });

  const imageScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.3, 1],
    extrapolateRight: "clamp",
  });

  // Header opacity animation - smooth fade in as user scrolls
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_START, HEADER_END],
    outputRange: [0, 0.1, 1],
    extrapolate: "clamp",
  });

  // Blur opacity - should be visible when header is visible
  // Use header opacity to control blur visibility
  const blurOpacity = headerOpacity;

  // Title opacity in header - fades in slightly after header starts appearing
  const headerTitleOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_START, HEADER_START + 40, HEADER_END],
    outputRange: [0, 0, 0.5, 1],
    extrapolate: "clamp",
  });

  // Blurred background image position - should show what's currently at the top (header position)
  // The blurred image needs to move to reveal the portion that's at scrollY position
  // When scrollY = 0, show top of image (translateY = 0)
  // When scrollY increases, move image up (negative translateY) to show lower portion
  // Use direct scroll mapping to show what's at the top of viewport
  const blurredImageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, IMAGE_HEIGHT],
    outputRange: [-50, 0, -IMAGE_HEIGHT * 0.6],
    extrapolate: "clamp",
  });

  // Close button opacity - fades out smoothly as header appears
  const closeButtonOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_START * 0.5, HEADER_START],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  // Content title opacity - fades out as header title fades in
  const contentTitleOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_START * 0.7, HEADER_START, HEADER_END],
    outputRange: [1, 0.8, 0.3, 0],
    extrapolate: "clamp",
  });

  const factTitle = fact.title || fact.content.substring(0, 60) + "...";

  return (
    <Container>
      {/* Sticky Header with Blur Background */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          opacity: headerOpacity,
          minHeight: Platform.OS === "ios" ? 80 : 70 + insets.top,
          paddingTop: Platform.OS === "ios" ? 0 : insets.top,
        }}
        collapsable={false}
        pointerEvents={
          Platform.OS === "android" && hasImage && !headerShouldBlock
            ? "none"
            : "box-none"
        }
      >
        {/* Blurred background image behind header */}
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
                width: SCREEN_WIDTH,
                height: IMAGE_HEIGHT * 2,
                transform: [{ translateY: blurredImageTranslateY }],
              }}
            >
              <Image
                source={{ uri: fact.image_url! }}
                style={{
                  width: SCREEN_WIDTH,
                  height: IMAGE_HEIGHT * 2,
                }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
              />
            </Animated.View>
            <Animated.View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: blurOpacity,
              }}
            >
              <BlurView
                intensity={Platform.OS === "android" ? 100 : 20}
                tint={theme === "dark" ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            {/* Semi-transparent overlay for better text readability - lighter on Android for better blur visibility */}
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    theme === "dark"
                      ? Platform.OS === "android"
                        ? "rgba(0, 0, 0, 0.1)"
                        : "rgba(0, 0, 0, 0.15)"
                      : Platform.OS === "android"
                      ? "rgba(255, 255, 255, 0.15)"
                      : "rgba(255, 255, 255, 0.25)",
                  opacity: headerOpacity,
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
          style={{
            paddingTop: Platform.OS === "ios" ? tokens.space.md : insets.top + tokens.space.sm,
            minHeight: Platform.OS === "ios" ? 80 : 70 + insets.top,
            paddingBottom: Platform.OS === "ios" ? tokens.space.md : tokens.space.md,
            zIndex: 101,
            alignItems: "center",
          }}
        >
          <Pressable 
            onPress={onClose} 
            style={{ zIndex: 102 }} 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <CloseButton
              backgroundColor={
                theme === "dark"
                  ? "rgba(255,255,255,0.15)"
                  : "rgba(0,0,0,0.1)"
              }
            >
              <X
                size={20}
                color={
                  theme === "dark"
                    ? "#FFFFFF"
                    : tokens.color.light.text
                }
              />
            </CloseButton>
          </Pressable>
          <HeaderTitleContainer>
            <Animated.View
              style={{
                opacity: headerTitleOpacity,
                flex: 1,
              }}
            >
              <SerifTitle
                fontSize={18}
                lineHeight={24}
                letterSpacing={0}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {factTitle}
              </SerifTitle>
            </Animated.View>
          </HeaderTitleContainer>
          <View style={{ width: 36 }} />
        </HeaderContainer>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        bounces={true}
        contentContainerStyle={{ paddingBottom: tokens.space.lg }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Hero Image Section */}
        {hasImage && (
          <Animated.View
            style={{
              position: "relative",
              overflow: "hidden",
              transform: [{ scale: imageScale }],
            }}
          >
            <Animated.View
              style={{
                transform: [{ translateY: imageTranslateY }],
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
            />
          </Animated.View>
        )}

        {/* Content Section */}
        <ContentSection>
          {/* Title - shown in content when header is not visible */}
          <Animated.View
            style={{
              opacity: contentTitleOpacity,
            }}
          >
            <SerifTitle fontSize={24} lineHeight={34} letterSpacing={0}>
              {factTitle}
            </SerifTitle>
          </Animated.View>

          {/* Category Badge */}
          {categoryForBadge && (
            <BadgesRow>
              <CategoryBadge category={categoryForBadge} />
            </BadgesRow>
          )}

          {/* Main Content */}
          <BodyText
            fontSize={18}
            lineHeight={32}
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
                  fontSize={14}
                  lineHeight={20}
                  color="$primary"
                  textDecorationLine="underline"
                >
                  {t("sourcePrefix")}
                  {extractDomain(fact.source_url)}
                </BodyText>
              </Pressable>
            </SourceLink>
          )}
        </ContentSection>
      </Animated.ScrollView>

      {/* Fixed Close Button - visible when header is not shown */}
      {hasImage && (
        <Animated.View
          style={{
            position: "absolute",
            top: (Platform.OS === "ios" ? 0 : insets.top) + tokens.space.xl,
            right: tokens.space.xl,
            opacity: closeButtonOpacity,
            zIndex: 110,
          }}
          collapsable={false}
          pointerEvents={Platform.OS === "android" && hasImage && !closeButtonVisible ? "none" : "auto"}
        >
          <Pressable 
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <CloseButton backgroundColor="rgba(0, 0, 0, 0.4)">
              <X size={20} color="#FFFFFF" />
            </CloseButton>
          </Pressable>
        </Animated.View>
      )}

      {/* Close button for facts without images */}
      {!hasImage && (
        <Animated.View
          style={{
            position: "absolute",
            top: insets.top + tokens.space.xl,
            right: tokens.space.xl,
            zIndex: 10,
          }}
        >
          <Pressable onPress={onClose}>
            <CloseButton
              backgroundColor={
                theme === "dark"
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.08)"
              }
            >
              <X
                size={20}
                color={
                  theme === "dark"
                    ? "#FFFFFF"
                    : tokens.color.light.text
                }
              />
            </CloseButton>
          </Pressable>
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
