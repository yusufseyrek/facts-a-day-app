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
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, scale(value)])
  ) as T;
};

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

/**
 * Base spacing values for phones.
 * Tablet values are automatically scaled by 1.5x.
 */
const phoneSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const spacing = {
  phone: phoneSpacing,
  tablet: scaleObject(phoneSpacing),
} as const;

/**
 * Base icon sizes for phones.
 * Tablet values are automatically scaled by 1.5x.
 * 
 * Size hierarchy (phone → tablet):
 * - sm: 16 → 24 - Check marks, badges, small indicators
 * - md: 20 → 30 - Settings icons, chevrons, close buttons
 * - lg: 24 → 36 - Navigation, tab bar icons, headers
 * - xl: 32 → 48 - Extra large icons
 * - hero: 48 → 72 - Hero/display icons (empty state, onboarding)
 * - heroLg: 64 → 96 - Large hero icons, containers
 */
const phoneIconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  hero: 48,
  heroLg: 64,
} as const;

export const iconSizes = {
  phone: phoneIconSizes,
  tablet: scaleObject(phoneIconSizes),
} as const;

/**
 * Base component-specific sizes for phones.
 * Tablet values are automatically scaled by 1.5x.
 */
const phoneComponentSizes = {
  titleMinHeight: 30,
  modalMaxWidth: 340,
  badgeFontSize: 12,
  maxLines: 3,
  timerFontSize: 26,
  timerLineHeight: 36,
} as const;

export const componentSizes = {
  phone: phoneComponentSizes,
  tablet: scaleObject(phoneComponentSizes),
} as const;

/**
 * Grid layout configuration for different screen sizes.
 * These values control how many columns/items are displayed in grids.
 */
const phoneGridLayout = {
  categoryColumns: 3,           // Categories grid (onboarding, settings)
  discoverColumns: 2,           // Discover category grid
  triviaCategoriesPerRow: 2,    // Trivia categories per row
  categoryIconSize: 32,         // Icon size in category cards
  discoverIconSize: 24,         // Icon size in discover category cards
  cardWidthMultiplier: 0.85,    // Card width as percentage of screen width
  headerPaddingAdjustment: 8,   // Small padding adjustment for headers
} as const;

const tabletGridLayout = {
  categoryColumns: 5,
  discoverColumns: 3,
  triviaCategoriesPerRow: 4,
  categoryIconSize: 48,
  discoverIconSize: 28,
  cardWidthMultiplier: 0.45,
  headerPaddingAdjustment: 4,
} as const;

export const gridLayout = {
  phone: phoneGridLayout,
  tablet: tabletGridLayout,
} as const;

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
    ...scaleObject({ sm: phoneRadius.sm, md: phoneRadius.md, lg: phoneRadius.lg, xl: phoneRadius.xl }),
    full: phoneRadius.full, // Keep full as-is (already very large)
  },
} as const;

/**
 * Base size values for phones.
 * Tablet values are automatically scaled by 1.5x.
 */
const phoneSizes = {
  buttonHeight: 56,
  topicCardSize: 80,
  colorSwatchSize: 72,
  toggleSize: 24,
} as const;

export const sizes = {
  phone: phoneSizes,
  tablet: scaleObject(phoneSizes),
} as const;

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
 * Get component sizes for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getComponentSizes = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? componentSizes.tablet : componentSizes.phone;
};

/**
 * Get grid layout values for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getGridLayout = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? gridLayout.tablet : gridLayout.phone;
};

/**
 * Get radius values for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getRadius = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? radius.tablet : radius.phone;
};

/**
 * Get sizes for the current screen width.
 * @param screenWidth - Current screen width
 */
export const getSizes = (screenWidth: number) => {
  return isTabletDevice(screenWidth) ? sizes.tablet : sizes.phone;
};

// Export constants for external use
export const RESPONSIVE_CONSTANTS = {
  TABLET_BREAKPOINT,
  TABLET_MULTIPLIER,
};

// Type exports
export type Typography = typeof typography.phone;
export type Spacing = typeof spacing.phone;
export type IconSizes = typeof iconSizes.phone;
export type ComponentSizes = typeof componentSizes.phone;
export type GridLayout = typeof gridLayout.phone;
export type Radius = typeof radius.phone;
export type Sizes = typeof sizes.phone;
