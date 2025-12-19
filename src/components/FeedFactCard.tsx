import React from "react";
import { Pressable, Animated } from "react-native";
import { styled } from "@tamagui/core";
import { XStack, YStack } from "tamagui";
import { ChevronRight } from "@tamagui/lucide-icons";
import { tokens, useTheme } from "../theme";
import { BodyText, SerifTitle } from "./Typography";
import { useResponsive } from "../utils/useResponsive";

interface FeedFactCardProps {
  title: string;
  summary?: string;
  onPress: () => void;
  isTablet?: boolean;
}

const CardWrapper = styled(YStack, {
  borderRadius: tokens.radius.lg,
  padding: tokens.space.lg,
  marginBottom: tokens.space.md,
  variants: {
    tablet: {
      true: {
        padding: tokens.space.xl,
        marginBottom: tokens.space.md,
      },
    },
  } as const,
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
  isTablet: isTabletProp = false,
}: FeedFactCardProps) => {
  const { theme } = useTheme();
  const { fontSizes, isTablet: isTabletDevice } = useResponsive();
  const isTablet = isTabletProp || isTabletDevice;
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

  // Shadow and border styling
  const cardStyle = {
    backgroundColor,
    borderWidth: 1,
    borderColor:
      theme === "dark" ? tokens.color.dark.border : tokens.color.light.border,
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
          <ContentRow>
            <TextContainer>
              <SerifTitle
                fontSize={isTablet ? tokens.fontSize.h2Tablet : Math.round(fontSizes.body * 1.2)}
                lineHeight={isTablet ? tokens.fontSize.h2Tablet * 1.35 : Math.round(fontSizes.body * 1.2 * 1.35)}
                letterSpacing={0.3}
                color="$text"
                numberOfLines={isTablet ? 3 : 2}
              >
                {title}
              </SerifTitle>
              {summary && (
                <BodyText
                  fontSize={isTablet ? tokens.fontSize.bodyTablet : Math.round(fontSizes.body * 0.93)}
                  lineHeight={isTablet ? tokens.fontSize.bodyTablet * 1.6 : Math.round(fontSizes.body * 0.93 * 1.6)}
                  letterSpacing={0.2}
                  color="$textSecondary"
                  numberOfLines={isTablet ? 4 : 3}
                >
                  {summary}
                </BodyText>
              )}
            </TextContainer>
            <ChevronRight
              size={isTablet ? 24 : 18}
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
      prevProps.summary === nextProps.summary &&
      prevProps.isTablet === nextProps.isTablet
      // Don't compare onPress as it may be recreated but functionally equivalent
    );
  }
);
