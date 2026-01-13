/**
 * Share Card Configuration
 */

// Share card dimensions (1:1 square aspect ratio)
export const SHARE_CARD_WIDTH = 1024;
export const SHARE_CARD_HEIGHT = 1024;

// Image format settings
export const SHARE_IMAGE_FORMAT = 'jpg' as const;
export const SHARE_IMAGE_QUALITY = 0.92;

// Padding and spacing
export const SHARE_CARD_PADDING = 50;

// Logo dimensions
export const SHARE_LOGO_SIZE = 80;
export const SHARE_LOGO_BORDER_RADIUS = 16;

// Font sizes
export const SHARE_APP_NAME_FONT_SIZE = 28;
export const SHARE_WATERMARK_FONT_SIZE = 24;
export const SHARE_STORE_HINT_FONT_SIZE = 18;

// Watermark settings
export const SHARE_WATERMARK_LOGO_SIZE = 32;
export const SHARE_DOMAIN_ACCENT_COLOR = '#FF6B00'; // Orange for the "A"

// Fact ID settings
export const SHARE_FACT_ID_FONT_SIZE = 18;

// Colors
export const SHARE_CARD_BACKGROUND = '#0A1628';
export const SHARE_TEXT_COLOR = '#FFFFFF';
export const SHARE_TEXT_MUTED = 'rgba(255, 255, 255, 0.8)';

// Gradient colors
export const SHARE_GRADIENT_COLORS: readonly [string, string, string] = [
  '#0F1E36',
  '#0A1628',
  '#050B14',
];
export const SHARE_GRADIENT_LOCATIONS: readonly [number, number, number] = [0, 0.5, 1];

// Image overlay gradient
export const SHARE_IMAGE_OVERLAY_COLORS: readonly [string, string, string] = [
  'rgba(10, 22, 40, 0.4)',
  'rgba(10, 22, 40, 0.6)',
  'rgba(10, 22, 40, 0.9)',
];
export const SHARE_IMAGE_OVERLAY_LOCATIONS: readonly [number, number, number] = [0, 0.5, 1];
