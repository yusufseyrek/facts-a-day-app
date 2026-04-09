import { hexColors } from './hexColors';

type NeonColor = 'cyan' | 'orange' | 'magenta' | 'green' | 'purple' | 'yellow' | 'red';
type ResolvedTheme = 'light' | 'dark';

// Neon color mappings
const neonColorMap = {
  cyan: {
    light: hexColors.light.neonCyan,
    dark: hexColors.dark.neonCyan,
  },
  orange: {
    light: hexColors.light.neonOrange,
    dark: hexColors.dark.neonOrange,
  },
  magenta: {
    light: hexColors.light.neonMagenta,
    dark: hexColors.dark.neonMagenta,
  },
  green: {
    light: hexColors.light.neonGreen,
    dark: hexColors.dark.neonGreen,
  },
  purple: {
    light: hexColors.light.neonPurple,
    dark: hexColors.dark.neonPurple,
  },
  yellow: {
    light: hexColors.light.neonYellow,
    dark: hexColors.dark.neonYellow,
  },
  red: {
    light: hexColors.light.neonRed,
    dark: hexColors.dark.neonRed,
  },
};

/**
 * Get neon color value by name and theme
 */
export const getNeonColor = (color: NeonColor, theme: ResolvedTheme): string => {
  return neonColorMap[color][theme];
};

/**
 * Get all neon colors for a theme
 */
export const getNeonColors = (theme: ResolvedTheme) => {
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
 * Category to neon color mapping (internal)
 * Maps category slugs to their assigned neon colors
 */
const categoryNeonColors: Record<string, NeonColor> = {
  // Primary categories
  science: 'cyan',
  history: 'orange',
  nature: 'green',
  technology: 'purple',
  arts: 'magenta',
  sports: 'yellow',
  geography: 'cyan',
  literature: 'purple',
  music: 'magenta',
  food: 'orange',
  animals: 'green',
  space: 'purple',
  health: 'green',
  entertainment: 'magenta',
  business: 'orange',
  politics: 'red',
  culture: 'yellow',
  language: 'cyan',
  mathematics: 'purple',
  philosophy: 'magenta',
};

/**
 * Get neon color for a category
 * Falls back to cyan if category not found
 */
export const getCategoryNeonColor = (categorySlug: string, theme: ResolvedTheme): string => {
  const neonColor = categoryNeonColors[categorySlug.toLowerCase()] || 'cyan';
  return getNeonColor(neonColor, theme);
};
