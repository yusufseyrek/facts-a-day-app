import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';
import {
  getResponsiveScale,
  getResponsiveFontSizes,
  isTabletDevice,
  isSmallScreen,
  scaleFontSize,
  scaleSpacing,
  RESPONSIVE_CONSTANTS,
} from './responsive';

/**
 * Hook for responsive typography and layout
 * Automatically updates when screen dimensions change (e.g., rotation)
 */
export const useResponsive = () => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isTablet = isTabletDevice(width);
    const isSmall = isSmallScreen(width);
    const scale = getResponsiveScale(width);
    const fontSizes = getResponsiveFontSizes(width);

    return {
      /** Current screen width */
      screenWidth: width,
      /** Current screen height */
      screenHeight: height,
      /** Whether device is a tablet (>= 768pt) */
      isTablet,
      /** Whether device has a small screen (< 375pt) */
      isSmallScreen: isSmall,
      /** Current scale factor (0.85 - 1.0 for phones, 1.0 for tablets) */
      scale,
      /** Pre-calculated responsive font sizes */
      fontSizes,
      /** Whether device is in landscape orientation */
      isLandscape: width > height,
      
      /**
       * Scale a font size for current screen
       * @param size - Base font size
       */
      scaleFontSize: (size: number) => scaleFontSize(size, width),
      
      /**
       * Scale a spacing value for current screen
       * @param value - Base spacing value
       */
      scaleSpacing: (value: number) => scaleSpacing(value, width),
    };
  }, [width, height]);
};

/**
 * Hook specifically for responsive typography
 * Returns font sizes that automatically scale for the current screen
 */
export const useResponsiveTypography = () => {
  const { fontSizes, isTablet, isSmallScreen, scale } = useResponsive();

  return useMemo(() => ({
    /** Heading 1 font size */
    h1: fontSizes.h1,
    /** Heading 2 font size */
    h2: fontSizes.h2,
    /** Body text font size */
    body: fontSizes.body,
    /** Label font size */
    label: fontSizes.label,
    /** Small text font size */
    small: fontSizes.small,
    
    /** Line heights based on font sizes */
    lineHeights: {
      h1: Math.round(fontSizes.h1 * 1.25),
      h2: Math.round(fontSizes.h2 * 1.25),
      body: Math.round(fontSizes.body * 1.6),
      label: Math.round(fontSizes.label * 1.4),
      small: Math.round(fontSizes.small * 1.4),
    },
    
    /** Device info */
    isTablet,
    isSmallScreen,
    scale,
  }), [fontSizes, isTablet, isSmallScreen, scale]);
};

// Re-export constants
export { RESPONSIVE_CONSTANTS };

