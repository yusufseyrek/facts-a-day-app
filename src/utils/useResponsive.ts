import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';
import {
  isTabletDevice,
  getTypography,
  getSpacing,
  getIconSizes,
  getConfig,
  getMedia,
  getRadius,
  typography as responsiveTypography,
  spacing as responsiveSpacing,
  iconSizes as responsiveIconSizes,
  config as responsiveConfig,
  media as responsiveMedia,
  radius as responsiveRadius,
  RESPONSIVE_CONSTANTS,
} from './responsive';

// Use union types to allow both phone and tablet values
export type ResponsiveTypography = typeof responsiveTypography.phone | typeof responsiveTypography.tablet;
export type ResponsiveSpacing = typeof responsiveSpacing.phone | typeof responsiveSpacing.tablet;
export type ResponsiveIconSizes = typeof responsiveIconSizes.phone | typeof responsiveIconSizes.tablet;
export type ResponsiveConfig = typeof responsiveConfig.phone | typeof responsiveConfig.tablet;
export type ResponsiveMedia = typeof responsiveMedia.phone | typeof responsiveMedia.tablet;
export type ResponsiveRadius = typeof responsiveRadius.phone | typeof responsiveRadius.tablet;

export interface ResponsiveValues {
  /** Current screen width */
  screenWidth: number;
  /** Current screen height */
  screenHeight: number;
  /** Whether device is a tablet (>= 768pt) */
  isTablet: boolean;
  /** Whether device is in landscape orientation */
  isLandscape: boolean;
  /** Typography values (fontSize, lineHeight) */
  typography: ResponsiveTypography;
  /** Spacing values (screenPadding, sectionGap, etc.) */
  spacing: ResponsiveSpacing;
  /** Icon sizes (xs, sm, md, lg, xl, hero, heroLg) */
  iconSizes: ResponsiveIconSizes;
  /** Config values (columns, multipliers, maxLines, etc.) */
  config: ResponsiveConfig;
  /** Media/dimension values (buttonHeight, modalMaxWidth, etc.) */
  media: ResponsiveMedia;
  /** Radius values (sm, md, lg, xl, full) */
  radius: ResponsiveRadius;
}

/**
 * Hook for responsive typography and layout.
 * Returns fixed values for phone/tablet - no scaling.
 * Automatically updates when screen dimensions change (e.g., rotation).
 */
export const useResponsive = (): ResponsiveValues => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isTablet = isTabletDevice(width);
    
    return {
      screenWidth: width,
      screenHeight: height,
      isTablet,
      isLandscape: width > height,
      typography: getTypography(width),
      spacing: getSpacing(width),
      iconSizes: getIconSizes(width),
      config: getConfig(width),
      media: getMedia(width),
      radius: getRadius(width),
    };
  }, [width, height]);
};

// Re-export constants
export { RESPONSIVE_CONSTANTS };
