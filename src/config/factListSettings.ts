/**
 * Centralized list performance settings for Fact FlatList and SectionList components
 * These settings are optimized for smooth scrolling with proper virtualization
 * 
 * Platform differences:
 * - iOS: Native list handling is excellent, can use conservative settings
 * - Android: Needs more aggressive pre-rendering to avoid items appearing late
 * - Android Tablets: Need even higher values due to larger screens showing more items
 */

import { Platform, Dimensions } from "react-native";

const isAndroid = Platform.OS === "android";
const { width: screenWidth } = Dimensions.get("window");
const isTablet = screenWidth >= 768;
const isAndroidTablet = isAndroid && isTablet;

// Card height estimates for getItemLayout calculations
// These should match the actual rendered heights as closely as possible
export const CARD_HEIGHTS = {
  /** Height of FeedFactCard (varies by content, use average) */
  feedCard: 140,
  /** Height of FeedFactCard on tablet */
  feedCardTablet: 160,
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
 * Performance settings tuned per platform and device type:
 * - iOS: Native list handling is excellent, can use conservative settings
 * - Android Phone: Higher values to avoid blank spots
 * - Android Tablet: Even higher values due to more visible items
 */
export const FACT_LIST_PERFORMANCE_SETTINGS = {
  /** 
   * Number of items to render initially
   * - iOS: 6 is fine
   * - Android Phone: 10 to fill screen
   * - Android Tablet: 15 to fill larger screen
   */
  initialNumToRender: isAndroidTablet ? 15 : isAndroid ? 10 : 6,
  
  /** 
   * Maximum items to render per batch during scroll
   * - iOS: 4 for smooth animations
   * - Android Phone: 8 to keep up with scroll
   * - Android Tablet: 12 for larger viewport
   */
  maxToRenderPerBatch: isAndroidTablet ? 12 : isAndroid ? 8 : 4,
  
  /** 
   * Number of viewports to keep rendered (above + below + visible)
   * - iOS: 5 is fine
   * - Android Phone: 9 for pre-rendering
   * - Android Tablet: 13 for more pre-rendering on larger screen
   */
  windowSize: isAndroidTablet ? 13 : isAndroid ? 9 : 5,
  
  /** 
   * Unmount components when off-screen
   * Disabled on all platforms - causes items to appear late when re-mounting
   */
  removeClippedSubviews: false,
  
  /** 
   * Time in ms between batched cell updates
   * Lower = faster rendering but more CPU
   * - iOS: 50ms for smoother scroll
   * - Android: 30ms for faster item appearance
   * - Android Tablet: 20ms for even faster rendering
   */
  updateCellsBatchingPeriod: isAndroidTablet ? 20 : isAndroid ? 30 : 50,
} as const;

export const FACT_LIST_SCROLL_SETTINGS = {
  /** How often scroll events fire (16ms = ~60fps) */
  scrollEventThrottle: 16,
  /** 
   * Maintain scroll position when content changes (iOS only)
   * This prop can cause issues on Android
   */
  ...(Platform.OS === "ios" && {
    maintainVisibleContentPosition: {
      minIndexForVisible: 0,
    },
  }),
} as const;

export const FACT_SECTION_LIST_SETTINGS = {
  /** Section headers stick to the top while scrolling */
  stickySectionHeadersEnabled: true,
} as const;

/** Combined settings for FlatList components that display fact cards */
export const FACT_FLAT_LIST_SETTINGS = {
  ...FACT_LIST_PERFORMANCE_SETTINGS,
  ...FACT_LIST_SCROLL_SETTINGS,
  /** Bounce effect on iOS */
  bounces: true,
  /** Faster momentum scroll */
  decelerationRate: "fast" as const,
  /** Hide scroll indicator for cleaner look */
  showsVerticalScrollIndicator: false,
  /** 
   * Android-specific: Additional optimizations
   */
  ...(isAndroid && {
    // Override maxToRenderPerBatch for combined settings
    maxToRenderPerBatch: isAndroidTablet ? 15 : 10,
    // Render further ahead on Android
    onEndReachedThreshold: isAndroidTablet ? 1.0 : 0.5,
    // Disable nested scroll for better performance
    nestedScrollEnabled: false,
  }),
} as const;

/** Combined settings for SectionList components that display fact cards */
export const FACT_SECTION_LIST_FULL_SETTINGS = {
  ...FACT_LIST_PERFORMANCE_SETTINGS,
  ...FACT_LIST_SCROLL_SETTINGS,
  ...FACT_SECTION_LIST_SETTINGS,
  /** Bounce effect on iOS */
  bounces: true,
  /** Faster momentum scroll */
  decelerationRate: "fast" as const,
  /** Hide scroll indicator for cleaner look */
  showsVerticalScrollIndicator: false,
  /** 
   * Android-specific: Additional optimizations
   */
  ...(isAndroid && {
    maxToRenderPerBatch: isAndroidTablet ? 15 : 10,
    onEndReachedThreshold: isAndroidTablet ? 1.0 : 0.5,
    nestedScrollEnabled: false,
  }),
} as const;

/**
 * Calculate estimated item height for getItemLayout
 * This helps the list pre-calculate positions and avoid layout jumps
 * 
 * @param hasImage Whether the item has an image (ImageFactCard vs FeedFactCard)
 * @param width Screen width for calculating image card height
 * @param isTabletLayout Whether tablet layout is being used
 */
export const getEstimatedItemHeight = (
  hasImage: boolean, 
  width: number,
  isTabletLayout: boolean = false
): number => {
  const margin = isTabletLayout ? CARD_HEIGHTS.cardMarginTablet : CARD_HEIGHTS.cardMargin;
  
  if (hasImage) {
    // For tablets with content wrapper, use the wrapper width instead of screen width
    const cardWidth = isTabletLayout ? Math.min(width, 600) : width;
    return cardWidth * CARD_HEIGHTS.imageCardAspectRatio + margin;
  }
  
  const cardHeight = isTabletLayout ? CARD_HEIGHTS.feedCardTablet : CARD_HEIGHTS.feedCard;
  return cardHeight + margin;
};
