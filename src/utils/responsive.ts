import { Dimensions } from 'react-native';
import { LAYOUT } from '../config/app';

// Use centralized layout constants
const TABLET_BREAKPOINT = LAYOUT.TABLET_BREAKPOINT;
const TABLET_MULTIPLIER = LAYOUT.TABLET_MULTIPLIER;

/**
 * Scale a value for tablet by applying the multiplier and rounding
 */
const scale = (value: number): number => Math.round(value * TABLET_MULTIPLIER);

/**
 * Scale an object of values for tablet
 */
const scaleObject = <T extends Record<string, number>>(obj: T): T => {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, scale(value)])) as T;
};

// ============================================================================
// CONFIG - Non-dimension values (counts, multipliers, adjustments)
// ============================================================================

/**
 * Configuration values that differ between phone and tablet.
 * These are NOT scaled - each device type has its own explicit values.
 */
const phoneConfig = {
  maxLines: 3,
  categoryColumns: 3,
  discoverColumns: 2,
  triviaCategoriesPerRow: 2,
  cardWidthMultiplier: 0.85,
  headerPaddingAdjustment: 8,
} as const;

const tabletConfig = {
  maxLines: 3,
  categoryColumns: 5,
  discoverColumns: 2,
  triviaCategoriesPerRow: 4,
  cardWidthMultiplier: 0.7,
  headerPaddingAdjustment: 4,
} as const;

export const config = {
  phone: phoneConfig,
  tablet: tabletConfig,
} as const;

// ============================================================================
// MEDIA - Dimension values (widths, heights, sizes)
// Tablet values are automatically scaled by 1.5x
// ============================================================================

/**
 * Media/dimension values for components.
 * Tablet values are automatically scaled by 1.5x.
 */
const phoneMedia = {
  buttonHeight: 56,
  topicCardSize: 80,
  colorSwatchSize: 72,
  tabBarHeight: 56,
  searchInputHeight: 44,
  clearButtonSize: 28,
  chipHeight: 28,
  chipClearButtonSize: 20,
  categoryIconContainerSize: 48,
  answerLabelWidth: 70,
} as const;

export const media = {
  phone: phoneMedia,
  tablet: scaleObject(phoneMedia),
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

/**
 * Base typography values for phones.
 * Tablet values are automatically scaled by 1.5x.
 *
 * Size hierarchy (phone → tablet):
 * - tiny: 11 → 17 - Very small text, footnotes
 * - caption: 12 → 18 - Captions, timestamps, secondary text
 * - body: 17 → 26 - Main content, labels, buttons
 * - title: 20 → 30 - Section headers
 * - headline: 24 → 36 - Large headers
 * - display: 32 → 48 - Large display text
 * - hero: 48 → 72 - Hero/splash text
 */
const phoneTypography = {
  fontSize: {
    tiny: 11,
    caption: 12,
    label: 14,
    body: 17,
    title: 20,
    headline: 25,
    display: 32,
    hero: 48,
  },
  lineHeight: {
    tiny: 15,
    caption: 17,
    label: 19,
    body: 28,
    title: 30,
    headline: 37,
    display: 48,
    hero: 72,
  },
  letterSpacing: {
    tiny: 0.05,
    caption: 0.1,
    label: 0.15,
    body: 0.2,
    title: 0.15,
    headline: 0.2,
    display: 0.3,
    hero: 0.4,
  },
} as const;

export const typography = {
  phone: phoneTypography,
  tablet: {
    fontSize: scaleObject(phoneTypography.fontSize),
    lineHeight: scaleObject(phoneTypography.lineHeight),
    letterSpacing: scaleObject(phoneTypography.letterSpacing),
  },
} as const;

// ============================================================================
// SPACING
// ============================================================================

/**
 * Base spacing values for phones.
 * Tablet values are automatically scaled by 1.5x.
 */
const phoneSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 28,
} as const;

export const spacing = {
  phone: phoneSpacing,
  tablet: scaleObject(phoneSpacing),
} as const;

// ============================================================================
// ICON SIZES
// ============================================================================

/**
 * Base icon sizes for phones.
 * Tablet values are automatically scaled by 1.5x.
 *
 * Size hierarchy (phone → tablet):
 * - xs: 16 → 24 - Check marks, badges, small indicators
 * - sm: 20 → 30 - Settings icons, chevrons, close buttons
 * - md: 24 → 36 - Navigation, tab bar icons, headers, discover category icons
 * - lg: 28 → 42 - Larger icons
 * - xl: 32 → 48 - Category cards icons
 * - hero: 48 → 72 - Hero/display icons (empty state, onboarding)
 * - heroLg: 64 → 96 - Large hero icons, containers
 */
const phoneIconSizes = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
  hero: 48,
  heroLg: 64,
} as const;

export const iconSizes = {
  phone: phoneIconSizes,
  tablet: scaleObject(phoneIconSizes),
} as const;

// ============================================================================
// RADIUS
// ============================================================================

/**
 * Base radius values for phones.
 * Tablet values are automatically scaled by 1.5x.
 */
const phoneRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const radius = {
  phone: phoneRadius,
  tablet: {
    ...scaleObject({
      sm: phoneRadius.sm,
      md: phoneRadius.md,
      lg: phoneRadius.lg,
      xl: phoneRadius.xl,
    }),
    full: phoneRadius.full, // Keep full as-is (already very large)
  },
} as const;

// ============================================================================
// BORDER WIDTHS
// ============================================================================

/**
 * Base border width values for phones.
 * Tablet values are automatically scaled by 1.5x.
 */
const phoneBorderWidths = {
  hairline: 1,
  thin: 1.5,
  medium: 2,
  thick: 3,
  heavy: 4,
  extraHeavy: 6,
} as const;

export const borderWidths = {
  phone: phoneBorderWidths,
  tablet: scaleObject(phoneBorderWidths),
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get current screen dimensions
 * Using a function to ensure we get fresh values when orientation changes
 */
export const getScreenDimensions = () => {
  const { width, height } = Dimensions.get('window');
  return { width, height };
};

/**
 * Check if current device is a tablet
 * @param screenWidth - Current screen width
 */
export const isTabletDevice = (screenWidth: number): boolean => {
  return screenWidth >= TABLET_BREAKPOINT;
};

/**
 * Get config values for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getConfig = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? config.tablet : config.phone;
};

/**
 * Get media values for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getMedia = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? media.tablet : media.phone;
};

/**
 * Get typography values for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getTypography = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? typography.tablet : typography.phone;
};

/**
 * Get spacing values for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getSpacing = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? spacing.tablet : spacing.phone;
};

/**
 * Get icon sizes for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getIconSizes = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? iconSizes.tablet : iconSizes.phone;
};

/**
 * Get radius values for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getRadius = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? radius.tablet : radius.phone;
};

/**
 * Get border width values for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getBorderWidths = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? borderWidths.tablet : borderWidths.phone;
};

/**
 * Get trivia modal width for the current screen width.
 * ~90% on phones, 90% of tablet breakpoint on tablets.
 * @param screenWidth - Current screen width
 */
export const getMaxModalWidth = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? TABLET_BREAKPOINT * 0.9 : screenWidth * 0.9;
};

// Export constants for external use
export const RESPONSIVE_CONSTANTS = {
  TABLET_BREAKPOINT,
  TABLET_MULTIPLIER,
};

// Type exports
export type Config = typeof config.phone;
export type Media = typeof media.phone;
export type Typography = typeof typography.phone;
export type Spacing = typeof spacing.phone;
export type IconSizes = typeof iconSizes.phone;
export type Radius = typeof radius.phone;
export type BorderWidths = typeof borderWidths.phone;
