/**
 * Centralized list performance settings for Fact FlatList and SectionList components
 * These settings are optimized for smooth scrolling with large fact lists
 */

export const FACT_LIST_PERFORMANCE_SETTINGS = {
  /** Number of items to render initially */
  initialNumToRender: 8,
  /** Maximum items to render per batch during scroll */
  maxToRenderPerBatch: 5,
  /** Number of viewports to render (before + current + after) */
  windowSize: 11,
  /** Unmount components when off-screen - disabled to prevent flickering during fast scroll */
  removeClippedSubviews: true,
  /** Time in ms between batched cell updates */
  updateCellsBatchingPeriod: 25,
} as const;

export const FACT_LIST_SCROLL_SETTINGS = {
  /** How often scroll events fire (16ms = ~60fps) using 30ms for better performance */
  scrollEventThrottle: 30,
} as const;

export const FACT_SECTION_LIST_SETTINGS = {
  /** Section headers stick to the top while scrolling */
  stickySectionHeadersEnabled: true,
} as const;

/** Combined settings for FlatList components that display fact cards */
export const FACT_FLAT_LIST_SETTINGS = {
  ...FACT_LIST_PERFORMANCE_SETTINGS,
  ...FACT_LIST_SCROLL_SETTINGS,
} as const;

/** Combined settings for SectionList components that display fact cards */
export const FACT_SECTION_LIST_FULL_SETTINGS = {
  ...FACT_LIST_PERFORMANCE_SETTINGS,
  ...FACT_LIST_SCROLL_SETTINGS,
  ...FACT_SECTION_LIST_SETTINGS,
} as const;

