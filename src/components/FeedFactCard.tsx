import React, { useCallback, useMemo, useRef } from "react";
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
  
  // Use ref for animation value - persists across renders
  const scaleAnim = useRef(new Animated.Value(1)).current;

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

  // Memoize computed values
  const titleFontSize = useMemo(() => 
    isTablet ? tokens.fontSize.h2Tablet : Math.round(fontSizes.body * 1.2),
    [isTablet, fontSizes.body]
  );
  
  const titleLineHeight = useMemo(() => 
    isTablet ? tokens.fontSize.h2Tablet * 1.35 : Math.round(fontSizes.body * 1.2 * 1.25),
    [isTablet, fontSizes.body]
  );

  const summaryFontSize = useMemo(() => 
    isTablet ? tokens.fontSize.bodyTablet : Math.round(fontSizes.body * 0.93),
    [isTablet, fontSizes.body]
  );

  const summaryLineHeight = useMemo(() => 
    isTablet ? tokens.fontSize.bodyTablet * 1.6 : Math.round(fontSizes.body * 0.93 * 1.6),
    [isTablet, fontSizes.body]
  );

  // Memoize style object to prevent recreation
  const cardStyle = useMemo(() => ({
    backgroundColor: theme === "dark"
      ? tokens.color.dark.cardBackground
      : tokens.color.light.cardBackground,
    borderWidth: 1,
    borderColor: theme === "dark" 
      ? tokens.color.dark.border 
      : tokens.color.light.border,
  }), [theme]);

  const chevronColor = useMemo(() => 
    theme === "dark"
      ? tokens.color.dark.textSecondary
      : tokens.color.light.textSecondary,
    [theme]
  );

  const androidRipple = useMemo(() => ({
    color: theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    borderless: false,
  }), [theme]);

  return (
    <Animated.View style={scaleStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={androidRipple}
      >
        <CardWrapper style={cardStyle} tablet={isTablet}>
          <ContentRow>
            <TextContainer>
              <SerifTitle
                fontSize={titleFontSize}
                lineHeight={titleLineHeight}
                letterSpacing={0.3}
                color="$text"
                numberOfLines={isTablet ? 4 : 3}
              >
                {title}
              </SerifTitle>
              {summary && (
                <BodyText
                  fontSize={summaryFontSize}
                  lineHeight={summaryLineHeight}
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
              color={chevronColor}
            />
          </ContentRow>
        </CardWrapper>
      </Pressable>
    </Animated.View>
  );

  // Helper for animated style - defined as a getter since we need scaleAnim
  function scaleStyle() {
    return { transform: [{ scale: scaleAnim }] };
  }
};

// Memoize the component to prevent unnecessary re-renders
// Only compare stable props - onPress is intentionally excluded
export const FeedFactCard = React.memo(
  FeedFactCardComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.title === nextProps.title &&
      prevProps.summary === nextProps.summary &&
      prevProps.isTablet === nextProps.isTablet
    );
  }
);
