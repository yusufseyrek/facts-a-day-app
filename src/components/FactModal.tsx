import React, { useRef } from "react";
import { Pressable, Linking, Dimensions, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { X } from "@tamagui/lucide-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { tokens } from "../theme/tokens";
import { FactActions } from "./FactActions";
import { CategoryBadge } from "./CategoryBadge";
import { BodyText, H1 } from "./Typography";
import { useTheme } from "../theme";
import { useTranslation } from "../i18n";
import type { FactWithRelations, Category } from "../services/database";
import { BannerAd } from "./ads";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_HEIGHT = 280;

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

  // Close button opacity - fades out when scrolling down
  const closeButtonOpacity = scrollY.interpolate({
    inputRange: [0, 80, 150],
    outputRange: [1, 0.5, 0],
    extrapolate: "clamp",
  });

  return (
    <Container>
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
            />
          </Animated.View>
        )}

        {/* Content Section */}
        <ContentSection>
          {/* Title */}
          <H1 fontSize={24} lineHeight={32} letterSpacing={-0.5}>
            {fact.title || fact.content.substring(0, 60) + "..."}
          </H1>

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

      {/* Fixed Close Button - always in same position */}
      <Animated.View
        style={{
          position: "absolute",
          top: tokens.space.xl,
          right: tokens.space.xl,
          opacity: hasImage ? closeButtonOpacity : 1,
          zIndex: 10,
        }}
      >
        <Pressable onPress={onClose}>
          <CloseButton
            backgroundColor={
              hasImage
                ? "rgba(0, 0, 0, 0.4)"
                : theme === "dark"
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.08)"
            }
          >
            <X
              size={20}
              color={
                hasImage
                  ? "#FFFFFF"
                  : theme === "dark"
                  ? "#FFFFFF"
                  : tokens.color.light.text
              }
            />
          </CloseButton>
        </Pressable>
      </Animated.View>

      <BannerAd position="modal" />

      <FactActions
        factId={fact.id}
        factTitle={fact.title}
        factContent={fact.content}
      />
    </Container>
  );
}
