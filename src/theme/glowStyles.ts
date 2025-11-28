import { Platform, ViewStyle } from "react-native";
import { tokens } from "./tokens";

export type GlowIntensity = "subtle" | "medium" | "strong";
export type NeonColor =
  | "cyan"
  | "orange"
  | "magenta"
  | "green"
  | "purple"
  | "yellow"
  | "red";
export type ThemeMode = "light" | "dark";

// Neon color mappings
const neonColorMap = {
  cyan: {
    light: tokens.color.light.neonCyan,
    dark: tokens.color.dark.neonCyan,
  },
  orange: {
    light: tokens.color.light.neonOrange,
    dark: tokens.color.dark.neonOrange,
  },
  magenta: {
    light: tokens.color.light.neonMagenta,
    dark: tokens.color.dark.neonMagenta,
  },
  green: {
    light: tokens.color.light.neonGreen,
    dark: tokens.color.dark.neonGreen,
  },
  purple: {
    light: tokens.color.light.neonPurple,
    dark: tokens.color.dark.neonPurple,
  },
  yellow: {
    light: tokens.color.light.neonYellow,
    dark: tokens.color.dark.neonYellow,
  },
  red: {
    light: tokens.color.light.neonRed,
    dark: tokens.color.dark.neonRed,
  },
};

// Intensity settings for glow effects
const intensitySettings = {
  subtle: { opacity: 0.15, radius: 8, elevation: 4 },
  medium: { opacity: 0.3, radius: 16, elevation: 8 },
  strong: { opacity: 0.5, radius: 24, elevation: 12 },
};

/**
 * Creates a glow style for a component
 * Works cross-platform with iOS shadows and Android elevation
 */
export const createGlowStyle = (
  color: NeonColor | string,
  intensity: GlowIntensity,
  theme: ThemeMode
): ViewStyle => {
  const settings = intensitySettings[intensity];

  // Get the actual color value
  let colorValue: string;
  if (color in neonColorMap) {
    colorValue = neonColorMap[color as NeonColor][theme];
  } else {
    colorValue = color; // Allow custom hex colors
  }

  // Reduce glow intensity in light mode for subtlety
  const opacityMultiplier = theme === "light" ? 0.6 : 1;

  if (Platform.OS === "ios") {
    return {
      shadowColor: colorValue,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: settings.opacity * opacityMultiplier,
      shadowRadius: settings.radius,
    };
  }

  // Android: Use elevation (shadow color works on API 28+)
  return {
    elevation: settings.elevation,
    shadowColor: colorValue,
  };
};

/**
 * Creates a multi-layer glow for stronger effect (iOS only)
 * Returns an array of styles to apply to nested views
 */
export const createMultiLayerGlowStyles = (
  color: NeonColor | string,
  theme: ThemeMode
): ViewStyle[] => {
  // Get the actual color value
  let colorValue: string;
  if (color in neonColorMap) {
    colorValue = neonColorMap[color as NeonColor][theme];
  } else {
    colorValue = color;
  }

  const opacityMultiplier = theme === "light" ? 0.5 : 1;

  if (Platform.OS !== "ios") {
    return [{ elevation: 12, shadowColor: colorValue }];
  }

  // Return multiple shadow layers for iOS
  return [
    {
      shadowColor: colorValue,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4 * opacityMultiplier,
      shadowRadius: 8,
    },
    {
      shadowColor: colorValue,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.2 * opacityMultiplier,
      shadowRadius: 20,
    },
  ];
};

/**
 * Get neon color value by name and theme
 */
export const getNeonColor = (color: NeonColor, theme: ThemeMode): string => {
  return neonColorMap[color][theme];
};

/**
 * Get all neon colors for a theme
 */
export const getNeonColors = (theme: ThemeMode) => {
  return {
    cyan: neonColorMap.cyan[theme],
    orange: neonColorMap.orange[theme],
    magenta: neonColorMap.magenta[theme],
    green: neonColorMap.green[theme],
    purple: neonColorMap.purple[theme],
    yellow: neonColorMap.yellow[theme],
    red: neonColorMap.red[theme],
  };
};

/**
 * Category to neon color mapping
 * Maps category slugs to their assigned neon colors
 */
export const categoryNeonColors: Record<string, NeonColor> = {
  // Primary categories
  science: "cyan",
  history: "orange",
  nature: "green",
  technology: "purple",
  arts: "magenta",
  sports: "yellow",
  geography: "cyan",
  literature: "purple",
  music: "magenta",
  food: "orange",
  animals: "green",
  space: "purple",
  health: "green",
  entertainment: "magenta",
  business: "orange",
  politics: "red",
  culture: "yellow",
  language: "cyan",
  mathematics: "purple",
  philosophy: "magenta",
};

/**
 * Get neon color for a category
 * Falls back to cyan if category not found
 */
export const getCategoryNeonColor = (
  categorySlug: string,
  theme: ThemeMode
): string => {
  const neonColor = categoryNeonColors[categorySlug.toLowerCase()] || "cyan";
  return getNeonColor(neonColor, theme);
};

/**
 * Get neon color name for a category
 * Falls back to cyan if category not found
 */
export const getCategoryNeonColorName = (categorySlug: string): NeonColor => {
  return categoryNeonColors[categorySlug.toLowerCase()] || "cyan";
};

/**
 * Cycle through neon colors for categories without predefined colors
 * Useful for dynamically assigning colors to new categories
 */
const neonColorCycle: NeonColor[] = [
  "cyan",
  "orange",
  "magenta",
  "green",
  "purple",
  "yellow",
];

export const getColorForIndex = (index: number, theme: ThemeMode): string => {
  const colorName = neonColorCycle[index % neonColorCycle.length];
  return getNeonColor(colorName, theme);
};
