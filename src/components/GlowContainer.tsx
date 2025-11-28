import React from "react";
import { View, ViewStyle, Platform, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme";
import type { GlowIntensity, NeonColor } from "../theme";
import { getNeonColor } from "../theme";

interface GlowContainerProps {
  children: React.ReactNode;
  /** Neon color name or custom hex color */
  glowColor: NeonColor | string;
  /** Intensity of the glow effect */
  intensity?: GlowIntensity;
  /** Border radius of the container */
  borderRadius?: number;
  /** Additional container styles */
  style?: ViewStyle;
  /** Whether to show the glow (useful for conditional rendering) */
  showGlow?: boolean;
}

/**
 * Converts hex color to rgba
 */
const hexToRgba = (hex: string, alpha: number): string => {
  // Remove # if present
  const cleanHex = hex.replace("#", "");

  // Parse hex values
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * GlowContainer - A component that wraps children with a neon glow effect
 *
 * Uses LinearGradient to create a soft glow behind the content.
 * Works on both iOS and Android.
 *
 * @example
 * <GlowContainer glowColor="cyan" intensity="medium" borderRadius={16}>
 *   <Card>Content</Card>
 * </GlowContainer>
 */
export const GlowContainer: React.FC<GlowContainerProps> = ({
  children,
  glowColor,
  intensity = "medium",
  borderRadius = 16,
  style,
  showGlow = true,
}) => {
  const { theme } = useTheme();

  // Get the actual color value
  const colorValue =
    glowColor.startsWith("#") || glowColor.startsWith("rgb")
      ? glowColor
      : getNeonColor(glowColor as NeonColor, theme);

  // Intensity settings
  const intensitySettings = {
    subtle: { padding: 3, opacity: 0.2, blurLayers: 1 },
    medium: { padding: 5, opacity: 0.35, blurLayers: 2 },
    strong: { padding: 8, opacity: 0.5, blurLayers: 3 },
  };

  const settings = intensitySettings[intensity];

  // Reduce glow in light mode
  const opacityMultiplier = theme === "light" ? 0.6 : 1;
  const finalOpacity = settings.opacity * opacityMultiplier;

  if (!showGlow) {
    return <View style={style}>{children}</View>;
  }

  return (
    <View style={[styles.container, style]}>
      {/* Outer glow layer */}
      <View
        style={[
          styles.glowLayer,
          {
            top: -settings.padding * 2,
            left: -settings.padding * 2,
            right: -settings.padding * 2,
            bottom: -settings.padding * 2,
            borderRadius: borderRadius + settings.padding * 2,
          },
        ]}
      >
        <LinearGradient
          colors={[
            hexToRgba(colorValue, finalOpacity * 0.3),
            hexToRgba(colorValue, finalOpacity * 0.1),
            "transparent",
          ]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      {/* Middle glow layer (for medium and strong) */}
      {settings.blurLayers >= 2 && (
        <View
          style={[
            styles.glowLayer,
            {
              top: -settings.padding,
              left: -settings.padding,
              right: -settings.padding,
              bottom: -settings.padding,
              borderRadius: borderRadius + settings.padding,
            },
          ]}
        >
          <LinearGradient
            colors={[
              hexToRgba(colorValue, finalOpacity * 0.5),
              hexToRgba(colorValue, finalOpacity * 0.2),
              "transparent",
            ]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 0.5, y: 1 }}
          />
        </View>
      )}

      {/* Inner glow border (for strong only) */}
      {settings.blurLayers >= 3 && (
        <View
          style={[
            styles.glowBorder,
            {
              borderRadius,
              borderColor: hexToRgba(colorValue, finalOpacity),
              borderWidth: 1,
            },
          ]}
        />
      )}

      {/* Content */}
      {children}
    </View>
  );
};

/**
 * Simple glow shadow style hook for inline usage
 * Returns shadow styles that can be spread onto a View
 */
export const useGlowShadow = (
  glowColor: NeonColor | string,
  intensity: GlowIntensity = "medium"
) => {
  const { theme } = useTheme();

  const colorValue =
    glowColor.startsWith("#") || glowColor.startsWith("rgb")
      ? glowColor
      : getNeonColor(glowColor as NeonColor, theme);

  const intensitySettings = {
    subtle: { opacity: 0.15, radius: 8, elevation: 4 },
    medium: { opacity: 0.3, radius: 16, elevation: 8 },
    strong: { opacity: 0.5, radius: 24, elevation: 12 },
  };

  const settings = intensitySettings[intensity];
  const opacityMultiplier = theme === "light" ? 0.6 : 1;

  if (Platform.OS === "ios") {
    return {
      shadowColor: colorValue,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: settings.opacity * opacityMultiplier,
      shadowRadius: settings.radius,
    };
  }

  return {
    elevation: settings.elevation,
    shadowColor: colorValue,
  };
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  glowLayer: {
    position: "absolute",
    overflow: "hidden",
  },
  glowBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default GlowContainer;
