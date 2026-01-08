import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { styled } from "@tamagui/core";
import { YStack, XStack, YStackProps } from "tamagui";
import { hexColors, spacing, radius } from "../theme";
import { Text } from "./Typography";
import { useTheme } from "../theme";
import { LAYOUT } from "../config/app";
import { useResponsive } from "../utils/useResponsive";

/**
 * ScreenContainer - Main container for all screens
 * Wraps content in SafeAreaView with proper background
 */
export const ScreenContainer = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
});

interface ScreenHeaderProps {
  icon: React.ReactNode;
  title: string;
  rightElement?: React.ReactNode;
}

/**
 * ScreenHeader - Composed header component with icon and title
 * Uses responsive hook for tablet/phone spacing
 */
export function ScreenHeader({ icon, title, rightElement }: ScreenHeaderProps) {
  const { spacing } = useResponsive();
  
  return (
    <XStack
      padding={spacing.lg}
      paddingBottom={spacing.md}
      alignItems="center"
      gap={spacing.sm}
    >
      {icon}
      <Text.Headline flex={1}>
        {title}
      </Text.Headline>
      {rightElement}
    </XStack>
  );
}

interface SectionHeaderProps {
  title: string;
}

/**
 * SectionHeader - Composed section header with H2 title
 * Uses responsive hook for tablet/phone spacing
 */
export function SectionHeader({ title }: SectionHeaderProps) {
  const { spacing } = useResponsive();
  
  return (
    <YStack
      paddingHorizontal={spacing.xl}
      paddingVertical={spacing.md}
      backgroundColor="$background"
    >
      <Text.Title>
        {title}
      </Text.Title>
    </YStack>
  );
}

interface ContentContainerProps extends YStackProps {
  children: React.ReactNode;
}

/**
 * ContentContainer - Container for main content with consistent padding
 * Uses responsive hook for tablet/phone spacing
 */
export function ContentContainer({ children, ...props }: ContentContainerProps) {
  const { spacing } = useResponsive();
  
  return (
    <YStack paddingHorizontal={spacing.md} {...props}>
      {children}
    </YStack>
  );
}

/**
 * ScrollContentContainer - Content container with vertical gap for scrollable content
 * Use inside ScrollView for settings-like screens
 */
export const ScrollContentContainer = styled(YStack, {
  paddingHorizontal: spacing.phone.xl,
  gap: spacing.phone.lg,
  flex: 1,
});

/**
 * LoadingContainer - Centered container for loading states
 */
export const LoadingContainer = styled(YStack, {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.phone.md,
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
  gap: spacing.phone.md,
  marginBottom: spacing.phone.xl,
});

/**
 * SectionTitle - Styled H2 for section titles
 */
export const SectionTitle = styled(Text.Title, {
  marginBottom: spacing.phone.sm,
});

/**
 * ItemGroup - Container for grouped items (e.g., settings rows)
 */
export const ItemGroup = styled(YStack, {
  gap: spacing.phone.md,
});

/**
 * Helper hook to get icon color based on theme
 */
export function useIconColor() {
  const { theme } = useTheme();
  return theme === "dark" ? "#FFFFFF" : hexColors.light.text;
}

