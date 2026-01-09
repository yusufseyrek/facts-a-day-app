import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { styled } from "@tamagui/core";
import { YStack, XStack, YStackProps } from "tamagui";
import { hexColors } from "../theme";
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
  /** Whether to apply max content width on tablets. Defaults to true. */
  shouldSetMaxContentWidth?: boolean;
}

/**
 * ContentContainer - Container for main content with consistent padding
 * Uses responsive hook for tablet/phone spacing
 * On tablets: Full width outer container (catches all touches) with centered content
 * On phones: Simple padding
 */
export function ContentContainer({ children, shouldSetMaxContentWidth = true, ...props }: ContentContainerProps) {
  const { spacing, isTablet } = useResponsive();
  
  if (isTablet && shouldSetMaxContentWidth) {
    return (
      <YStack width="100%" alignItems="center" {...props}>
        <YStack 
          width="100%"
          maxWidth={LAYOUT.MAX_CONTENT_WIDTH} 
          paddingHorizontal={spacing.md}
        >
          {children}
        </YStack>
      </YStack>
    );
  }
  
  return (
    <YStack paddingHorizontal={spacing.md} {...props}>
      {children}
    </YStack>
  );
}

interface ScrollContentContainerProps extends YStackProps {
  children: React.ReactNode;
}

/**
 * ScrollContentContainer - Content container with vertical gap for scrollable content
 * Use inside ScrollView for settings-like screens
 */
export function ScrollContentContainer({ children, ...props }: ScrollContentContainerProps) {
  const { spacing } = useResponsive();
  
  return (
    <YStack paddingHorizontal={spacing.xl} gap={spacing.lg} flex={1} {...props}>
      {children}
    </YStack>
  );
}

interface LoadingContainerProps {
  children: React.ReactNode;
}

/**
 * LoadingContainer - Centered container for loading states
 */
export function LoadingContainer({ children }: LoadingContainerProps) {
  const { spacing } = useResponsive();
  
  return (
    <YStack flex={1} justifyContent="center" alignItems="center" gap={spacing.md}>
      {children}
    </YStack>
  );
}

/**
 * TabletWrapper - Max-width wrapper for tablet layouts
 * Centers content and limits width for better readability
 */
export const TabletWrapper = styled(YStack, {
  width: "100%",
  maxWidth: LAYOUT.MAX_CONTENT_WIDTH,
  alignSelf: "center",
});

interface SectionContainerProps extends YStackProps {
  children: React.ReactNode;
}

/**
 * SectionContainer - Container for grouped settings/content sections
 */
export function SectionContainer({ children, ...props }: SectionContainerProps) {
  const { spacing } = useResponsive();
  
  return (
    <YStack gap={spacing.md} marginBottom={spacing.xl} {...props}>
      {children}
    </YStack>
  );
}

interface SectionTitleProps {
  children: React.ReactNode;
}

/**
 * SectionTitle - Styled H2 for section titles
 */
export function SectionTitle({ children }: SectionTitleProps) {
  const { spacing } = useResponsive();
  
  return (
    <Text.Title marginBottom={spacing.sm}>
      {children}
    </Text.Title>
  );
}

interface ItemGroupProps extends YStackProps {
  children: React.ReactNode;
}

/**
 * ItemGroup - Container for grouped items (e.g., settings rows)
 */
export function ItemGroup({ children, ...props }: ItemGroupProps) {
  const { spacing } = useResponsive();
  
  return (
    <YStack gap={spacing.md} {...props}>
      {children}
    </YStack>
  );
}

/**
 * Helper hook to get icon color based on theme
 */
export function useIconColor() {
  const { theme } = useTheme();
  return theme === "dark" ? "#FFFFFF" : hexColors.light.text;
}
