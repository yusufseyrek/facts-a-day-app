/**
 * Centralized list performance settings for FlashList components
 * These settings are optimized for smooth scrolling with proper virtualization
 */

/**
 * Image prefetch settings to prevent network saturation and memory leaks
 */
export const PREFETCH_SETTINGS = {
  /** Maximum size of prefetch tracking set before clearing (prevents memory leaks) */
  maxCacheSize: 100,
  /** Maximum concurrent image downloads (prevents network saturation) */
  maxConcurrent: 5,
  /** Maximum images to prefetch initially when loading a list (covers ~2 screens) */
  maxInitialPrefetch: 8,
} as const;

/**
 * Card height constants for ImageFactCard.
 */
export const CARD_HEIGHTS = {
  /** Height of ImageFactCard (based on 9:16 aspect ratio, calculated dynamically) */
  imageCardAspectRatio: 9 / 16,
  /** Margin between cards */
  cardMargin: 12,
  /** Margin between cards on tablet */
  cardMarginTablet: 16,
} as const;

/**
 * FlashList item types for heterogeneous lists with section headers
 */
export const FLASH_LIST_ITEM_TYPES = {
  SECTION_HEADER: 'sectionHeader',
  FACT_ITEM: 'factItem',
} as const;

/**
 * FlashList-specific settings optimized for lists
 * FlashList uses a recycler approach which is more performant than FlatList/SectionList
 */
export const FLASH_LIST_SETTINGS = {
  /** Estimated item size for FlashList layout calculations (average card height ~220px) */
  estimatedItemSize: 220,
  /** Draw distance determines how far ahead FlashList renders items (~3-4 card heights) */
  drawDistance: 800,
  /** Show vertical scroll indicator */
  showsVerticalScrollIndicator: false,
  /** Bounces at the end of content */
  bounces: true,
} as const;

/**
 * Calculate ImageFactCard height based on screen width.
 * All facts now use ImageFactCard with 9:16 aspect ratio.
 *
 * @param width Screen width for calculating image card height
 * @param isTabletLayout Whether tablet layout is being used
 */
export const getImageCardHeight = (width: number, isTabletLayout: boolean = false): number => {
  const margin = isTabletLayout ? CARD_HEIGHTS.cardMarginTablet : CARD_HEIGHTS.cardMargin;
  const cardWidth = isTabletLayout ? Math.min(width, 600) : width;
  return cardWidth * CARD_HEIGHTS.imageCardAspectRatio + margin;
};
