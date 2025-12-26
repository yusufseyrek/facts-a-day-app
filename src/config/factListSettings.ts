/**
 * Centralized list performance settings for Fact FlatList and SectionList components
 * These settings are optimized for smooth scrolling with proper virtualization
 */

import { Dimensions } from "react-native";

const { width: screenWidth } = Dimensions.get("window");
const isTablet = screenWidth >= 768;

/**
 * Image prefetch cache size limit to prevent memory leaks
 */
export const MAX_PREFETCH_CACHE_SIZE = 10;

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
  /** Section header height */
  sectionHeader: 56,
  /** Section header height on tablet */
  sectionHeaderTablet: 64,
} as const;

/**
 * Performance settings for lists
 */
export const FACT_LIST_PERFORMANCE_SETTINGS = {
  initialNumToRender:  6,
  maxToRenderPerBatch: 4,
  windowSize:  5,
  removeClippedSubviews: true,
  updateCellsBatchingPeriod: 50,
} as const;

export const FACT_LIST_SCROLL_SETTINGS = {
  scrollEventThrottle: 16,
} as const;

export const FACT_SECTION_LIST_SETTINGS = {
  stickySectionHeadersEnabled: false,
} as const;

/** Combined settings for FlatList components that display fact cards */
export const FACT_FLAT_LIST_SETTINGS = {
  ...FACT_LIST_PERFORMANCE_SETTINGS,
  ...FACT_LIST_SCROLL_SETTINGS,
  bounces: true,
  decelerationRate: "fast" as const,
  showsVerticalScrollIndicator: false,
} as const;

/** Combined settings for SectionList components that display fact cards */
export const FACT_SECTION_LIST_FULL_SETTINGS = {
  ...FACT_LIST_PERFORMANCE_SETTINGS,
  ...FACT_LIST_SCROLL_SETTINGS,
  ...FACT_SECTION_LIST_SETTINGS,
  bounces: true,
  decelerationRate: "fast" as const,
  showsVerticalScrollIndicator: false,
} as const;

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
