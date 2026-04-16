import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import {
  applyDisplayScale,
  borderWidths as responsiveBorderWidths,
  config as responsiveConfig,
  getBorderWidths,
  getConfig,
  getDisplaySizeScale,
  getIconSizes,
  getMaxModalWidth,
  getMedia,
  getRadius,
  getSpacing,
  getTypography,
  iconSizes as responsiveIconSizes,
  isTabletDevice,
  media as responsiveMedia,
  radius as responsiveRadius,
  RESPONSIVE_CONSTANTS,
  spacing as responsiveSpacing,
  typography as responsiveTypography,
} from './responsive';

// Use union types to allow both phone and tablet values
export type ResponsiveTypography =
  | typeof responsiveTypography.phone
  | typeof responsiveTypography.tablet;
export type ResponsiveSpacing = typeof responsiveSpacing.phone | typeof responsiveSpacing.tablet;
export type ResponsiveIconSizes =
  | typeof responsiveIconSizes.phone
  | typeof responsiveIconSizes.tablet;
export type ResponsiveConfig = typeof responsiveConfig.phone | typeof responsiveConfig.tablet;
export type ResponsiveMedia = typeof responsiveMedia.phone | typeof responsiveMedia.tablet;
export type ResponsiveRadius = typeof responsiveRadius.phone | typeof responsiveRadius.tablet;
export type ResponsiveBorderWidths =
  | typeof responsiveBorderWidths.phone
  | typeof responsiveBorderWidths.tablet;

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
  /** Border width values (hairline, thin, medium, thick, heavy, extraHeavy) */
  borderWidths: ResponsiveBorderWidths;
  /** Trivia modal width (~90% on phones, 90% of tablet breakpoint on tablets) */
  maxModalWidth: number;
}

/**
 * Hook for responsive typography and layout.
 * Returns phone/tablet values based on screen width, and on Android
 * compensates for "Display Size" scaling to prevent layout overflow.
 */
export const useResponsive = (): ResponsiveValues => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isTablet = isTabletDevice(width);
    const displayScale = getDisplaySizeScale(width);

    const typo = getTypography(width);
    const sp = getSpacing(width);
    const icons = getIconSizes(width);
    const med = getMedia(width);

    return {
      screenWidth: width,
      screenHeight: height,
      isTablet,
      isLandscape: width > height,
      typography:
        displayScale === 1
          ? typo
          : {
              fontSize: applyDisplayScale(typo.fontSize, displayScale),
              lineHeight: applyDisplayScale(typo.lineHeight, displayScale),
              letterSpacing: applyDisplayScale(typo.letterSpacing, displayScale),
            },
      spacing: applyDisplayScale(sp, displayScale),
      iconSizes: applyDisplayScale(icons, displayScale),
      config: getConfig(width),
      media: applyDisplayScale(med, displayScale),
      radius: getRadius(width),
      borderWidths: getBorderWidths(width),
      maxModalWidth: getMaxModalWidth(width),
    };
  }, [width, height]);
};

// Re-export constants
export { RESPONSIVE_CONSTANTS };
