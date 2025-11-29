import React from "react";
import { Pressable, Animated } from "react-native";
import { styled } from "@tamagui/core";
import { XStack, YStack } from "tamagui";
import { ChevronRight } from "@tamagui/lucide-icons";
import { tokens, useTheme, createGlowStyle } from "../theme";
import { BodyText, SerifTitle } from "./Typography";

interface FeedFactCardProps {
  title: string;
  summary?: string;
  onPress: () => void;
}

const CardWrapper = styled(YStack, {
  borderRadius: tokens.radius.lg,
  padding: tokens.space.lg,
  marginBottom: tokens.space.sm,
});

const ContentRow = styled(XStack, {
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.md,
});

const TextContainer = styled(YStack, {
  flex: 1,
  gap: tokens.space.sm,
});

const FeedFactCardComponent = ({
  title,
  summary,
  onPress,
}: FeedFactCardProps) => {
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

  // Background colors using new neon theme
  const backgroundColor =
    theme === "dark"
      ? tokens.color.dark.cardBackground
      : tokens.color.light.cardBackground;

  // Subtle cyan glow for cards
  const glowStyle = createGlowStyle("cyan", "subtle", theme);

  // Shadow and border styling with subtle neon glow
  const cardStyle = {
    backgroundColor,
    borderWidth: 1,
    borderColor:
      theme === "dark" ? tokens.color.dark.border : tokens.color.light.border,
    ...glowStyle,
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
        <CardWrapper style={cardStyle}>
          <ContentRow>
            <TextContainer>
              <SerifTitle
                fontSize={17}
                lineHeight={26}
                letterSpacing={0.3}
                color="$text"
                numberOfLines={2}
              >
                {title}
              </SerifTitle>
              {summary && (
                <BodyText
                  fontSize={15}
                  lineHeight={24}
                  letterSpacing={0.2}
                  color="$textSecondary"
                  numberOfLines={3}
                >
                  {summary}
                </BodyText>
              )}
            </TextContainer>
            <ChevronRight
              size={20}
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
export const FeedFactCard = React.memo(
  FeedFactCardComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.title === nextProps.title &&
      prevProps.summary === nextProps.summary
      // Don't compare onPress as it may be recreated but functionally equivalent
    );
  }
);
