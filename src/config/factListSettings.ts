/**
 * Centralized list performance settings for FlashList and FlatList components
 * These settings are optimized for smooth scrolling with proper virtualization
 */

/**
 * Image prefetch settings to prevent network saturation and memory leaks
 */
export const PREFETCH_SETTINGS = {
  /** Maximum size of prefetch tracking set before clearing (prevents memory leaks) */
  maxCacheSize: 100,
  /** Maximum concurrent image downloads (prevents network saturation) */
  maxConcurrent: 3,
  /** Maximum images to prefetch initially when loading a list (first visible items) */
  maxInitialPrefetch: 3,
} as const;

/**
 * Image prefetch cache size limit to prevent memory leaks
 * @deprecated Use PREFETCH_SETTINGS.maxCacheSize instead
 */
export const MAX_PREFETCH_CACHE_SIZE = PREFETCH_SETTINGS.maxCacheSize;

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
  /** Draw distance determines how far ahead FlashList renders items (in pixels) */
  drawDistance: 500,
  /** Show vertical scroll indicator */
  showsVerticalScrollIndicator: false,
  /** Bounces at the end of content */
  bounces: true,
} as const;

/** @deprecated Use FLASH_LIST_SETTINGS instead */
export const FACT_FLASH_LIST_SETTINGS = FLASH_LIST_SETTINGS;

/**
 * Settings for FlatList components (for screens not yet migrated to FlashList)
 */
export const FLAT_LIST_SETTINGS = {
  initialNumToRender: 6,
  maxToRenderPerBatch: 4,
  windowSize: 5,
  removeClippedSubviews: true,
  updateCellsBatchingPeriod: 50,
  scrollEventThrottle: 16,
  bounces: true,
  decelerationRate: "fast" as const,
  showsVerticalScrollIndicator: false,
} as const;

/** @deprecated Use FLAT_LIST_SETTINGS instead */
export const FACT_FLAT_LIST_SETTINGS = FLAT_LIST_SETTINGS;

/**
 * Calculate ImageFactCard height based on screen width.
 * All facts now use ImageFactCard with 9:16 aspect ratio.
 * 
 * @param width Screen width for calculating image card height
 * @param isTabletLayout Whether tablet layout is being used
 */
export const getImageCardHeight = (
  width: number,
  isTabletLayout: boolean = false
): number => {
  const margin = isTabletLayout ? CARD_HEIGHTS.cardMarginTablet : CARD_HEIGHTS.cardMargin;
  const cardWidth = isTabletLayout ? Math.min(width, 600) : width;
  return cardWidth * CARD_HEIGHTS.imageCardAspectRatio + margin;
};

/**
 * Create getItemLayout function for FlatList with ImageFactCards.
 * This enables the list to pre-calculate item positions for better scroll performance.
 * 
 * NOTE: Only use this for FlatList, NOT SectionList (which has complex indexing with headers).
 * 
 * @param width Screen width for calculating card height
 * @param isTabletLayout Whether tablet layout is being used
 */
export const createFlatListGetItemLayout = (
  width: number,
  isTabletLayout: boolean = false
) => {
  const itemHeight = getImageCardHeight(width, isTabletLayout);
  
  return (_data: unknown, index: number) => ({
    length: itemHeight,
    offset: itemHeight * index,
    index,
  });
};
