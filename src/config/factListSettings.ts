/**
 * Centralized list performance settings for FlashList components
 * These settings are optimized for smooth scrolling with proper virtualization
 */

import { config } from '../utils/responsive';

/**
 * Image prefetch settings to prevent network saturation and memory leaks
 */
export const PREFETCH_SETTINGS = {
  /** Maximum size of prefetch tracking set before clearing (prevents memory leaks) */
  maxCacheSize: 100,
  /** Maximum concurrent image downloads (prevents network saturation) */
  maxConcurrent: 4,
  /** Maximum images to prefetch initially when loading a list (covers ~2 screens) */
  maxInitialPrefetch: 4,
} as const;

/**
 * Card aspect ratios - imported from images.ts for single source of truth
 */
export const CARD_ASPECT_RATIOS = {
  phone: config.phone.cardAspectRatio,
  tablet: config.tablet.cardAspectRatio,
} as const;

/**
 * FlashList item types for heterogeneous lists with section headers
 */
export const FLASH_LIST_ITEM_TYPES = {
  SECTION_HEADER: 'sectionHeader',
  FACT_ITEM: 'factItem',
  NATIVE_AD: 'nativeAd',
} as const;

/**
 * FlashList-specific settings optimized for lists
 * FlashList uses a recycler approach which is more performant than FlatList/SectionList
 */
export const FLASH_LIST_SETTINGS = {
  /** Estimated item size for FlashList layout calculations (average card height ~220px) */
  estimatedItemSize: 220,
  /** Draw distance determines how far ahead FlashList renders items (~3-4 card heights) */
  drawDistance: 220,
  /** Show vertical scroll indicator */
  showsVerticalScrollIndicator: false,
  /** Bounces at the end of content */
  bounces: true,
  /** Prevents momentum from carrying scroll past the nearest snap point */
  disableIntervalMomentum: true,
} as const;

/**
 * Scroll-to-top behavior settings
 */
export const SCROLL_TO_TOP_SETTINGS = {
  /** Scroll offset threshold - if scrolled beyond this, jump instantly instead of animating */
  instantJumpThreshold: 4000,
  /** Number of items to pre-render at top before jumping (helps avoid blank flash) */
  preRenderItemCount: 4,
} as const;

/** Border width used by ImageFactCard's cardWrapperStyle */
const CARD_BORDER_WIDTH = 1;

/**
 * Calculate ImageFactCard height based on screen width.
 * Must match ImageFactCard's actual rendered height including:
 * - Image height (width * aspectRatio)
 * - Border (1px top + 1px bottom = 2px)
 * - Margin bottom (spacing.md)
 *
 * @param width Screen width for calculating image card height
 * @param isTablet Whether tablet layout is being used
 * @param margin The actual spacing.md value from useResponsive()
 */
export const getImageCardHeight = (width: number, isTablet: boolean, margin: number): number => {
  const aspectRatio = isTablet ? CARD_ASPECT_RATIOS.tablet : CARD_ASPECT_RATIOS.phone;
  const borderTotal = CARD_BORDER_WIDTH * 2; // top + bottom
  return width * aspectRatio + borderTotal + margin;
};
