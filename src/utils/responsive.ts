import { Dimensions } from 'react-native';

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
 * Check if current device is a tablet
 * @param screenWidth - Current screen width
 */
export const isTabletDevice = (screenWidth: number): boolean => {
  return screenWidth >= TABLET_BREAKPOINT;
};

/**
 * Fixed typography values for phones and tablets.
 * No scaling - just fixed values for each device type.
 * 
 * Size hierarchy (phone/tablet):
 * - tiny: 10/12 - Very small text, footnotes
 * - caption: 12/14 - Captions, timestamps
 * - small: 13/15 - Secondary text
 * - subtext: 14/16 - Tertiary labels
 * - label: 15/17 - Labels, buttons
 * - subtitle: 16/18 - Subtitles, emphasized labels
 * - body: 17/21 - Main content
 * - large: 18/22 - Emphasized body text
 * - h2: 20/24 - Section headers
 * - h1: 26/36 - Page titles
 * - display: 28/36 - Large display text
 * - hero: 48/64 - Hero/splash text
 */
export const typography = {
  phone: {
    fontSize: {
      tiny: 10,
      caption: 12,
      small: 13,
      subtext: 14,
      label: 15,
      subtitle: 16,
      body: 17,
      large: 18,
      h2: 20,
      h1: 26,
      display: 28,
      hero: 48,
    },
    lineHeight: {
      tiny: 14,     // tiny * 1.4
      caption: 17,  // caption * 1.4
      small: 18,    // small * 1.4
      subtext: 20,  // subtext * 1.4
      label: 21,    // label * 1.4
      subtitle: 22, // subtitle * 1.4
      body: 27,     // body * 1.6
      large: 25,    // large * 1.4
      h2: 25,       // h2 * 1.25
      h1: 31,       // h1 * 1.25
      display: 34,  // display * 1.2
      hero: 56,     // hero * 1.15
    },
  },
  tablet: {
    fontSize: {
      tiny: 12,
      caption: 14,
      small: 15,
      subtext: 16,
      label: 17,
      subtitle: 18,
      body: 21,
      large: 22,
      h2: 24,
      h1: 36,
      display: 36,
      hero: 64,
    },
    lineHeight: {
      tiny: 17,     // tiny * 1.4
      caption: 20,  // caption * 1.4
      small: 21,    // small * 1.4
      subtext: 22,  // subtext * 1.4
      label: 24,    // label * 1.4
      subtitle: 25, // subtitle * 1.4
      body: 33,     // body * 1.6
      large: 31,    // large * 1.4
      h2: 30,       // h2 * 1.25
      h1: 43,       // h1 * 1.25
      display: 43,  // display * 1.2
      hero: 74,     // hero * 1.15
    },
  },
} as const;

/**
 * Fixed spacing values for phones and tablets.
 */
export const spacing = {
  phone: {
    screenPadding: 16,
    sectionGap: 24,
    cardPadding: 16,
    itemGap: 12,
    modalPadding: 16,
  },
  tablet: {
    screenPadding: 24,
    sectionGap: 32,
    cardPadding: 24,
    itemGap: 16,
    modalPadding: 32,
  },
} as const;

/**
 * Fixed icon sizes for phones and tablets.
 */
export const iconSizes = {
  phone: {
    small: 16,
    medium: 20,
    large: 24,
    xlarge: 32,
    xxlarge: 36,
    close: 18,      // Close button X icon
    action: 20,     // Action/message icons
    button: 18,     // Icons inside buttons
    container: 64,  // Large container/modal icons
    inner: 32,      // Inner icons (inside containers)
  },
  tablet: {
    small: 18,
    medium: 22,
    large: 28,
    xlarge: 40,
    xxlarge: 48,
    close: 24,
    action: 24,
    button: 20,
    container: 72,
    inner: 36,
  },
} as const;

/**
 * Fixed component-specific sizes for phones and tablets.
 */
export const componentSizes = {
  phone: {
    titleMinHeight: 30,
    modalMaxWidth: 340,
    badgeFontSize: 12,
    maxLines: 3,
    timerFontSize: 26,
    timerLineHeight: 36,
  },
  tablet: {
    titleMinHeight: 44,
    modalMaxWidth: 420,
    badgeFontSize: 14,
    maxLines: 4,
    timerFontSize: 40,
    timerLineHeight: 54,
  },
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
};

// Type exports
export type Typography = typeof typography.phone;
export type Spacing = typeof spacing.phone;
export type IconSizes = typeof iconSizes.phone;
export type ComponentSizes = typeof componentSizes.phone;
