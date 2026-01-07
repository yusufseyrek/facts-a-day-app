/**
 * Image Configuration
 *
 * Central configuration for image-related constants including placeholder,
 * aspect ratios, caching, and retry settings.
 */

/**
 * Image placeholder settings
 */
export const IMAGE_PLACEHOLDER = {
  /** Dark blurhash that matches the card's dark theme for cohesive loading */
  DEFAULT_BLURHASH: 'L03[%0IU00~q00xu00Rj00%M00M{',
} as const;

/**
 * Image dimension settings
 */
export const IMAGE_DIMENSIONS = {
  /** Aspect ratio for immersive cards (16:9 portrait) */
  CARD_ASPECT_RATIO: 9 / 16,
} as const;

/**
 * Image retry settings for handling load failures in components
 */
export const IMAGE_RETRY = {
  /** Maximum retry attempts for re-rendering (without re-downloading) */
  MAX_RENDER_ATTEMPTS: 2,
  /** Maximum retry attempts for re-downloading (after render retries fail) */
  MAX_DOWNLOAD_ATTEMPTS: 2,
  /** Delay before retrying render (milliseconds) */
  RENDER_DELAY: 300,
  /** Delay before retrying download (milliseconds) */
  DOWNLOAD_DELAY: 1000,
} as const;

/**
 * Image caching settings for the image service
 */
export const IMAGE_CACHE = {
  /** Directory name for cached fact images (appended to documentDirectory) */
  FACT_IMAGES_DIR_NAME: 'fact-images/',
  /** Maximum cache age in milliseconds (7 days) */
  MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  /** Maximum age for in-memory file existence cache (30 minutes) */
  FILE_EXISTENCE_CACHE_MAX_AGE_MS: 30 * 60 * 1000,
} as const;

/**
 * Image download retry settings for the image service
 */
export const IMAGE_DOWNLOAD_RETRY = {
  /** Maximum retry attempts for downloading images */
  MAX_ATTEMPTS: 3,
  /** Base delay between retries in milliseconds (exponential backoff) */
  DELAY_BASE_MS: 1000,
} as const;

/**
 * In-memory image cache settings for the useFactImage hook
 */
export const IMAGE_MEMORY_CACHE = {
  /** Maximum size of in-memory cache to prevent memory issues on tablets */
  MAX_SIZE: 200,
  /** Maximum time to wait for a pending fetch before starting a new one (milliseconds) */
  PENDING_FETCH_TIMEOUT_MS: 30 * 1000,
} as const;

