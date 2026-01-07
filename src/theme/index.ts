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
  sizes,
  typography,
  iconSizes,
  componentSizes,
  gridLayout,
  getSpacing,
  getRadius,
  getSizes,
  getTypography,
  getIconSizes,
  getComponentSizes,
  getGridLayout,
} from '../utils/responsive';
