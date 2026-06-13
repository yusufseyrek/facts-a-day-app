/**
 * Centralized list performance settings for FlashList components
 * These settings are optimized for smooth scrolling with proper virtualization
 */

/**
 * FlashList-specific settings optimized for lists.
 * FlashList v2 auto-measures items, so no estimatedItemSize / overrideItemLayout size is needed.
 */
export const FLASH_LIST_SETTINGS = {
  /** Draw distance determines how far ahead FlashList renders items (~2-3 items beyond viewport) */
  drawDistance: 600,
  /** Show vertical scroll indicator */
  showsVerticalScrollIndicator: false,
  /** Bounces at the end of content */
  bounces: true,
  /** Prevents momentum from carrying scroll past the nearest snap point */
  disableIntervalMomentum: true,
  /** Disable Android 12+ stretch overscroll that reveals white background on Samsung/Motorola */
  overScrollMode: 'never' as const,
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

