import { Dimensions } from 'react-native';

// Tablet threshold
const TABLET_BREAKPOINT = 768;

// Tablet multiplier - scales phone values to tablet
const TABLET_MULTIPLIER = 1.5;

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
    body: 17,
    title: 20,
    headline: 24,
    display: 32,
    hero: 48,
  },
  lineHeight: {
    tiny: 15,
    caption: 17,
    body: 24,
    title: 28,
    headline: 32,
    display: 40,
    hero: 56,
  },
} as const;

export const typography = {
  phone: phoneTypography,
  tablet: {
    fontSize: scaleObject(phoneTypography.fontSize),
    lineHeight: scaleObject(phoneTypography.lineHeight),
  },
} as const;

/**
 * Base spacing values for phones.
 * Tablet values are automatically scaled by 1.5x.
 */
const phoneSpacing = {
  screenPadding: 16,
  sectionGap: 24,
  cardPadding: 16,
  itemGap: 12,
  modalPadding: 16,
} as const;

export const spacing = {
  phone: phoneSpacing,
  tablet: scaleObject(phoneSpacing),
} as const;

/**
 * Base icon sizes for phones.
 * Tablet values are automatically scaled by 1.5x.
 */
const phoneIconSizes = {
  small: 16,
  medium: 20,
  large: 24,
  xlarge: 32,
  xxlarge: 36,
  close: 18,
  action: 20,
  button: 18,
  container: 64,
  inner: 32,
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
