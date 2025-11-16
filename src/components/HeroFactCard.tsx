import React from "react";
import { Pressable, Platform, Animated } from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { ChevronRight } from "@tamagui/lucide-icons";
import { tokens } from "../theme/tokens";
import { BodyText } from "./Typography";
import { useTheme } from "../theme";
import { LinearGradient } from "expo-linear-gradient";

interface HeroFactCardProps {
  title: string;
  summary?: string;
  categoryColor?: string;
  onPress: () => void;
}

const CardWrapper = styled(YStack, {
  borderRadius: tokens.radius.xl, // 24px for more premium feel
  padding: tokens.space.xl, // 24px for larger card
  marginBottom: tokens.space.md,
  overflow: "hidden", // Ensure gradient doesn't overflow
});

const ContentRow = styled(XStack, {
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.lg, // Larger gap for better spacing
});

const TextContainer = styled(YStack, {
  flex: 1,
  gap: tokens.space.sm, // Slightly larger gap between title and summary
});

export function HeroFactCard({
  title,
  summary,
  categoryColor = "#0066FF",
  onPress,
}: HeroFactCardProps) {
  const { theme } = useTheme();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

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
  const baseBackground = theme === "dark"
    ? tokens.color.dark.cardBackground
    : "#FFFFFF";

  // Blend category color with base background for solid gradient colors
  // This works better on Android than semi-transparent overlays
  const blendColors = (hex: string, bgHex: string, opacity: number): string => {
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

  // Create gradient with blended solid colors
  const gradientOpacity = theme === "dark" ? [0.12, 0.04] : [0.18, 0.06];
  const gradientColors: [string, string] = [
    blendColors(categoryColor, baseBackground, gradientOpacity[0]),
    blendColors(categoryColor, baseBackground, gradientOpacity[1]),
  ];

  // Enhanced shadow for premium depth
  const cardStyle = {
    backgroundColor: baseBackground, // Solid background for Android compatibility
    borderWidth: theme === "dark" ? 0 : 1,
    borderColor: theme === "dark" ? "transparent" : "#E0E5EB",
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 }, // Deeper shadow offset
      shadowOpacity: theme === "dark" ? 0.4 : 0.12, // Stronger shadow
      shadowRadius: 12, // Larger shadow radius for depth
    }),
    ...(Platform.OS === "android" && {
      elevation: theme === "dark" ? 6 : 4, // Higher elevation for depth
    }),
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={{
          color: theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
          borderless: false,
        }}
      >
        <CardWrapper style={cardStyle}>
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
              <BodyText
                fontSize={20} // Enhanced from 16px to 20px
                lineHeight={28} // Better line height for larger text
                color="$text"
                fontWeight={tokens.fontWeight.bold} // Bold instead of semibold
                numberOfLines={3} // Allow more lines for larger text
              >
                {title}
              </BodyText>
              {summary && (
                <BodyText
                  fontSize={15} // Slightly larger than standard 14px
                  lineHeight={22} // Better line height
                  color="$textSecondary"
                  numberOfLines={4} // More lines visible in hero card
                >
                  {summary}
                </BodyText>
              )}
            </TextContainer>
            <ChevronRight
              size={24} // Larger chevron
              color={
                theme === "dark" ? "#8892A6" : tokens.color.light.textSecondary
              }
            />
          </ContentRow>
        </CardWrapper>
      </Pressable>
    </Animated.View>
  );
}
