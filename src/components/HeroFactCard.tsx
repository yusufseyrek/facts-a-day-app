import React from "react";
import { Pressable, Platform, Animated } from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { ChevronRight } from "@tamagui/lucide-icons";
import {
  tokens,
  useTheme,
  getCategoryNeonColor,
  getCategoryNeonColorName,
} from "../theme";
import { BodyText, SerifTitle } from "./Typography";
import { LinearGradient } from "expo-linear-gradient";
import { useResponsive } from "../utils/useResponsive";

interface HeroFactCardProps {
  title: string;
  summary?: string;
  categoryColor?: string;
  categorySlug?: string;
  onPress: () => void;
  isTablet?: boolean;
}

const CardWrapper = styled(YStack, {
  borderRadius: tokens.radius.xl, // 24px for more premium feel
  padding: tokens.space.xl, // Increased for better spacing on phones
  marginBottom: tokens.space.md,
  overflow: "hidden", // Ensure gradient doesn't overflow
  variants: {
    tablet: {
      true: {
        padding: tokens.space.xxl,
        marginBottom: tokens.space.lg,
      },
    },
  } as const,
});

const ContentRow = styled(XStack, {
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.lg, // Larger gap for better spacing
});

const TextContainer = styled(YStack, {
  flex: 1,
  gap: tokens.space.lg, // Better visual separation between title and summary
});

const HeroFactCardComponent = ({
  title,
  summary,
  categoryColor,
  categorySlug,
  onPress,
  isTablet: isTabletProp = false,
}: HeroFactCardProps) => {
  const { theme } = useTheme();
  const { fontSizes, isTablet: isTabletDevice } = useResponsive();
  const isTablet = isTabletProp || isTabletDevice;
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  // Get neon color based on category slug, fallback to categoryColor or cyan
  const neonColor = categorySlug
    ? getCategoryNeonColor(categorySlug, theme)
    : categoryColor ||
      (theme === "dark"
        ? tokens.color.dark.neonCyan
        : tokens.color.light.neonCyan);

  const neonColorName = categorySlug
    ? getCategoryNeonColorName(categorySlug)
    : "cyan";

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  // Base background color
  const baseBackground =
    theme === "dark"
      ? tokens.color.dark.cardBackground
      : tokens.color.light.cardBackground;

  // Blend category color with base background for solid gradient colors
  // This works better on Android than semi-transparent overlays
  const blendColors = (hex: string, bgHex: string, opacity: number): string => {
    // Handle rgb format
    if (hex.startsWith("rgb")) {
      const match = hex.match(/\d+/g);
      if (match) {
        const [r1, g1, b1] = match.map(Number);
        const r2 = parseInt(bgHex.slice(1, 3), 16);
        const g2 = parseInt(bgHex.slice(3, 5), 16);
        const b2 = parseInt(bgHex.slice(5, 7), 16);
        const r = Math.round(r1 * opacity + r2 * (1 - opacity));
        const g = Math.round(g1 * opacity + g2 * (1 - opacity));
        const b = Math.round(b1 * opacity + b2 * (1 - opacity));
        return `rgb(${r}, ${g}, ${b})`;
      }
    }

    const r1 = parseInt(hex.slice(1, 3), 16);
    const g1 = parseInt(hex.slice(3, 5), 16);
    const b1 = parseInt(hex.slice(5, 7), 16);

    const r2 = parseInt(bgHex.slice(1, 3), 16);
    const g2 = parseInt(bgHex.slice(3, 5), 16);
    const b2 = parseInt(bgHex.slice(5, 7), 16);

    const r = Math.round(r1 * opacity + r2 * (1 - opacity));
    const g = Math.round(g1 * opacity + g2 * (1 - opacity));
    const b = Math.round(b1 * opacity + b2 * (1 - opacity));

    return `rgb(${r}, ${g}, ${b})`;
  };

  // Create gradient with blended neon colors - stronger in dark mode
  const gradientOpacity = theme === "dark" ? [0.25, 0.08] : [0.15, 0.05];
  const gradientColors: [string, string] = [
    blendColors(neonColor, baseBackground, gradientOpacity[0]),
    blendColors(neonColor, baseBackground, gradientOpacity[1]),
  ];

  // Card styling
  const cardStyle = {
    backgroundColor: baseBackground,
    borderWidth: 1,
    borderColor:
      theme === "dark"
        ? `${neonColor}30` // Subtle neon border in dark mode
        : tokens.color.light.border,
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={{
          color:
            theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
          borderless: false,
        }}
      >
        <CardWrapper style={cardStyle} tablet={isTablet}>
          {/* Gradient Background */}
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />

          {/* Content on top of gradient */}
          <ContentRow style={{ position: "relative" }}>
            <TextContainer>
              <SerifTitle
                fontSize={isTablet ? tokens.fontSize.h1Tablet : Math.round(fontSizes.h1 * 0.81)}
                lineHeight={isTablet ? tokens.fontSize.h1Tablet * 1.35 : Math.round(fontSizes.h1 * 0.81 * 1.35)}
                letterSpacing={0.2}
                color={
                  theme === "dark"
                    ? tokens.color.dark.text
                    : tokens.color.light.text
                }
                numberOfLines={isTablet ? 4 : 3}
              >
                {title}
              </SerifTitle>
              {summary && (
                <BodyText
                  fontSize={isTablet ? tokens.fontSize.bodyTablet : fontSizes.body}
                  lineHeight={isTablet ? tokens.fontSize.bodyTablet * 1.6 : Math.round(fontSizes.body * 1.6)}
                  letterSpacing={0.3}
                  color={
                    theme === "dark"
                      ? "#B8C9DC" // Lighter than textSecondary for better contrast on gradient
                      : tokens.color.light.text // Use primary text color in light mode
                  }
                  numberOfLines={isTablet ? 5 : 4}
                >
                  {summary}
                </BodyText>
              )}
            </TextContainer>
            <ChevronRight
              size={isTablet ? 28 : 20}
              color={
                theme === "dark"
                  ? tokens.color.dark.textSecondary
                  : tokens.color.light.textSecondary
              }
            />
          </ContentRow>
        </CardWrapper>
      </Pressable>
    </Animated.View>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const HeroFactCard = React.memo(
  HeroFactCardComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.title === nextProps.title &&
      prevProps.summary === nextProps.summary &&
      prevProps.categoryColor === nextProps.categoryColor &&
      prevProps.categorySlug === nextProps.categorySlug &&
      prevProps.isTablet === nextProps.isTablet
      // Don't compare onPress as it may be recreated but functionally equivalent
    );
  }
);
