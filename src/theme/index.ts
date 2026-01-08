export { hexColors } from './hexColors';
export { config } from './config';
export { AppThemeProvider, useTheme } from './ThemeProvider';
export type { HexColors } from './hexColors';
export {
  getNeonColor,
  getNeonColors,
  getCategoryNeonColor,
} from './glowStyles';
export type { NeonColor, ThemeMode } from './glowStyles';

// Re-export responsive values for convenience
export {
  spacing,
  radius,
  typography,
  iconSizes,
  config as responsiveConfig,
  media,
  getSpacing,
  getRadius,
  getTypography,
  getIconSizes,
  getConfig,
  getMedia,
} from '../utils/responsive';
