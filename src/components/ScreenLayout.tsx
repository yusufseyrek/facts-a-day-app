import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { tokens } from "../theme/tokens";
import { Text } from "./Typography";
import { useTheme } from "../theme";
import { LAYOUT } from "../config/app";

/**
 * ScreenContainer - Main container for all screens
 * Wraps content in SafeAreaView with proper background
 */
export const ScreenContainer = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
});

/**
 * ScreenHeader - Header container with icon + title
 * Used at the top of tab screens
 */
export const ScreenHeaderContainer = styled(XStack, {
  padding: tokens.space.xl,
  paddingBottom: tokens.space.md,
  alignItems: "center",
  gap: tokens.space.sm,
  variants: {
    tablet: {
      true: {
        padding: tokens.space.xxl,
        paddingBottom: tokens.space.lg,
      },
    },
  } as const,
});

interface ScreenHeaderProps {
  icon: React.ReactNode;
  title: string;
  isTablet?: boolean;
  rightElement?: React.ReactNode;
}

/**
 * ScreenHeader - Composed header component with icon and title
 */
export function ScreenHeader({ icon, title, isTablet = false, rightElement }: ScreenHeaderProps) {
  return (
    <ScreenHeaderContainer tablet={isTablet}>
      {icon}
      <Text.Headline flex={1}>
        {title}
      </Text.Headline>
      {rightElement}
    </ScreenHeaderContainer>
  );
}

/**
 * SectionHeader - Header for content sections (e.g., date groups in feed)
 */
export const SectionHeaderContainer = styled(YStack, {
  paddingHorizontal: tokens.space.xl,
  paddingVertical: tokens.space.md,
  backgroundColor: "$background",
  variants: {
    tablet: {
      true: {
        paddingHorizontal: tokens.space.xxl,
        paddingVertical: tokens.space.lg,
      },
    },
  } as const,
});

interface SectionHeaderProps {
  title: string;
  isTablet?: boolean;
}

/**
 * SectionHeader - Composed section header with H2 title
 */
export function SectionHeader({ title, isTablet = false }: SectionHeaderProps) {
  return (
    <SectionHeaderContainer tablet={isTablet}>
      <Text.Title>
        {title}
      </Text.Title>
    </SectionHeaderContainer>
  );
}

/**
 * ContentContainer - Container for main content with consistent padding
 */
export const ContentContainer = styled(YStack, {
  paddingHorizontal: tokens.space.lg,
  variants: {
    tablet: {
      true: {
        paddingHorizontal: tokens.space.xl,
      },
    },
  } as const,
});

/**
 * ScrollContentContainer - Content container with vertical gap for scrollable content
 * Use inside ScrollView for settings-like screens
 */
export const ScrollContentContainer = styled(YStack, {
  paddingHorizontal: tokens.space.xl,
  gap: tokens.space.lg,
  flex: 1,
});

/**
 * LoadingContainer - Centered container for loading states
 */
export const LoadingContainer = styled(YStack, {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  gap: tokens.space.md,
});

/**
 * TabletWrapper - Max-width wrapper for tablet layouts
 * Centers content and limits width for better readability
 */
export const TabletWrapper = styled(YStack, {
  width: "100%",
  maxWidth: LAYOUT.MAX_CONTENT_WIDTH,
  alignSelf: "center",
});

/**
 * SectionContainer - Container for grouped settings/content sections
 */
export const SectionContainer = styled(YStack, {
  gap: tokens.space.md,
  marginBottom: tokens.space.xl,
});

/**
 * SectionTitle - Styled H2 for section titles
 */
export const SectionTitle = styled(Text.Title, {
  marginBottom: tokens.space.sm,
});

/**
 * ItemGroup - Container for grouped items (e.g., settings rows)
 */
export const ItemGroup = styled(YStack, {
  gap: tokens.space.md,
});

/**
 * Helper hook to get icon color based on theme
 */
export function useIconColor() {
  const { theme } = useTheme();
  return theme === "dark" ? "#FFFFFF" : tokens.color.light.text;
}

