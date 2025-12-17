import { Dimensions, PixelRatio } from 'react-native';

// Base dimensions for scaling (iPhone 11/12/13/14 standard width)
const BASE_WIDTH = 375;

// Small screen threshold (iPhone SE, older small Android phones)
const SMALL_SCREEN_WIDTH = 375;

// Tablet threshold
const TABLET_BREAKPOINT = 768;

/**
 * Get current screen dimensions
 * Using a function to ensure we get fresh values when orientation changes
 */
export const getScreenDimensions = () => {
  const { width, height } = Dimensions.get('window');
  return { width, height };
};

/**
 * Calculate responsive scale factor based on screen width
 * 
 * - For small screens (< 375pt): scales down proportionally (0.85 - 1.0)
 * - For normal phones (375-767pt): 1.0 (baseline)
 * - For tablets (>= 768pt): Uses tablet-specific sizes
 * 
 * @param screenWidth - Current screen width
 * @returns Scale factor to apply to font sizes
 */
export const getResponsiveScale = (screenWidth: number): number => {
  if (screenWidth >= TABLET_BREAKPOINT) {
    // Tablets use their own dedicated sizes, no scaling needed here
    return 1;
  }
  
  if (screenWidth < SMALL_SCREEN_WIDTH) {
    // For small screens, scale down proportionally
    // Min scale of 0.85 to prevent text from becoming too small
    const scale = screenWidth / BASE_WIDTH;
    return Math.max(0.85, Math.min(scale, 1));
  }
  
  // Normal phone screens - baseline scale
  return 1;
};

/**
 * Check if current device is a tablet
 * @param screenWidth - Current screen width
 */
export const isTabletDevice = (screenWidth: number): boolean => {
  return screenWidth >= TABLET_BREAKPOINT;
};

/**
 * Check if current device is a small screen
 * @param screenWidth - Current screen width
 */
export const isSmallScreen = (screenWidth: number): boolean => {
  return screenWidth < SMALL_SCREEN_WIDTH;
};

/**
 * Scale a font size responsively based on screen width
 * Respects user's system font scale settings
 * 
 * @param size - Base font size
 * @param screenWidth - Current screen width
 * @param options - Options for scaling behavior
 * @returns Scaled font size
 */
export const scaleFontSize = (
  size: number,
  screenWidth: number,
  options: {
    /** Whether to apply system font scale (accessibility) */
    respectSystemScale?: boolean;
    /** Minimum allowed size */
    minSize?: number;
    /** Maximum allowed size */
    maxSize?: number;
  } = {}
): number => {
  const {
    respectSystemScale = false, // Off by default to maintain layout consistency
    minSize = 11,
    maxSize = 48,
  } = options;

  const scale = getResponsiveScale(screenWidth);
  let scaledSize = Math.round(size * scale);

  // Optionally apply system font scale for accessibility
  if (respectSystemScale) {
    const systemFontScale = PixelRatio.getFontScale();
    // Clamp system scale to prevent extreme values
    const clampedSystemScale = Math.min(Math.max(systemFontScale, 0.85), 1.35);
    scaledSize = Math.round(scaledSize * clampedSystemScale);
  }

  // Apply size constraints
  return Math.max(minSize, Math.min(maxSize, scaledSize));
};

/**
 * Scale spacing/dimensions responsively based on screen width
 * 
 * @param value - Base spacing value
 * @param screenWidth - Current screen width
 * @returns Scaled spacing value
 */
export const scaleSpacing = (value: number, screenWidth: number): number => {
  const scale = getResponsiveScale(screenWidth);
  return Math.round(value * scale);
};

/**
 * Get responsive font sizes for the current screen width
 * Returns both phone and tablet-optimized sizes
 * 
 * @param screenWidth - Current screen width
 * @returns Object with scaled font sizes
 */
export const getResponsiveFontSizes = (screenWidth: number) => {
  const isTablet = isTabletDevice(screenWidth);
  const scale = getResponsiveScale(screenWidth);

  // Base sizes (for normal phones)
  const baseSizes = {
    h1: 26,
    h2: 20,
    body: 15,
    label: 15,
    small: 13,
  };

  // Tablet sizes (larger for better readability on big screens)
  const tabletSizes = {
    h1: 32,
    h2: 24,
    body: 17,
    label: 17,
    small: 15,
  };

  if (isTablet) {
    return tabletSizes;
  }

  // Apply scale for phone screens (especially small screens)
  return {
    h1: scaleFontSize(baseSizes.h1, screenWidth),
    h2: scaleFontSize(baseSizes.h2, screenWidth),
    body: scaleFontSize(baseSizes.body, screenWidth),
    label: scaleFontSize(baseSizes.label, screenWidth),
    small: scaleFontSize(baseSizes.small, screenWidth),
  };
};

// Export constants for external use
export const RESPONSIVE_CONSTANTS = {
  BASE_WIDTH,
  SMALL_SCREEN_WIDTH,
  TABLET_BREAKPOINT,
};

