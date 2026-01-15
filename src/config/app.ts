/**
 * App Configuration
 *
 * Central configuration for app-wide constants including timing intervals,
 * storage keys, and display limits.
 */

/**
 * Ads configuration
 */
export const ADS_ENABLED = !__DEV__;

/**
 * Interstitial ad settings
 */
export const INTERSTITIAL_ADS = {
  /** Number of fact views between interstitial ads */
  FACTS_BETWEEN_ADS: 5,
} as const;

export const AD_RETRY = {
  /** Maximum number of retry attempts for failed ads */
  MAX_RETRIES: 5,
  /** Delay intervals between retries (milliseconds): 15s, 30s, 1m, 2m, 4m */
  DELAYS: [15000, 30000, 60000, 120000, 240000],
} as const;

/**
 * AsyncStorage keys used throughout the app
 */
export const STORAGE_KEYS = {
  /** Key for tracking the last processed notification ID to prevent duplicate handling */
  NOTIFICATION_TRACK: 'last_processed_notification_id',
  /** Key for tracking number of facts viewed (for app review) */
  FACTS_VIEWED_COUNT: '@facts_viewed_count',
  /** Key for tracking if review has been requested */
  REVIEW_REQUESTED: '@review_requested',
  /** Key for tracking last review prompt timestamp */
  LAST_REVIEW_PROMPT: '@last_review_prompt',
  /** Key for tracking the last date explanation hint was used in trivia */
  EXPLANATION_HINT_LAST_USED: '@explanation_hint_last_used',
} as const;

/**
 * Timing intervals for background tasks (in milliseconds)
 */
export const TIMING = {
  /** Interval for periodic OTA update checks (30 minutes) */
  UPDATE_CHECK_INTERVAL: 30 * 60 * 1000,
  /** Database initialization timeout (10 seconds) */
  DB_INIT_TIMEOUT: 10 * 1000,
  /** Onboarding status check timeout (5 seconds) */
  ONBOARDING_CHECK_TIMEOUT: 5 * 1000,
  /** Safety timeout to prevent blank screen (15 seconds) */
  APP_INIT_SAFETY_TIMEOUT: 15 * 1000,
} as const;

/**
 * Display limits for UI components
 */
export const DISPLAY_LIMITS = {
  /** Maximum number of categories to show in performance view */
  MAX_CATEGORIES: 3,
  /** Maximum number of recent activities to show in performance view */
  MAX_ACTIVITIES: 3,
} as const;

/**
 * Layout constants for responsive design
 */
export const LAYOUT = {
  /** Maximum content width for tablet layouts (better readability) */
  MAX_CONTENT_WIDTH: 800,
  /** Tablet breakpoint width (iPad mini is 768px wide) */
  TABLET_BREAKPOINT: 768,
  /** Multiplier for scaling phone values to tablet */
  TABLET_MULTIPLIER: 1.5,
} as const;

/**
 * Notification settings
 */
export const NOTIFICATION_SETTINGS = {
  /** iOS limit for scheduled notifications */
  MAX_SCHEDULED: 64,
  /** Number of days to preload notification images in advance */
  DAYS_TO_PRELOAD_IMAGES: 14,
  /** Directory name for notification images (appended to documentDirectory) */
  IMAGES_DIR_NAME: 'notification-images/',
  /** Time tolerance for comparing OS and DB notification times (milliseconds) */
  TIME_TOLERANCE_MS: 60 * 1000,
  /** Concurrency limit for downloading notification images */
  IMAGE_DOWNLOAD_CONCURRENCY: 7,
} as const;

/**
 * App review prompt settings
 */
export const APP_REVIEW = {
  /** Number of facts to view before prompting for review */
  FACTS_THRESHOLD: 10,
  /** Minimum days between review prompts */
  MIN_DAYS_BETWEEN_PROMPTS: 15,
} as const;

/**
 * Store IDs for linking to app stores
 */
export const APP_STORE_ID = '6755321394';
export const PLAY_STORE_ID = 'dev.seyrek.factsaday';

/**
 * API settings for fetching data
 */
export const API_SETTINGS = {
  /** Batch size for fetching facts from the server */
  FACTS_BATCH_SIZE: 1000,
} as const;
