/**
 * App Configuration
 *
 * Central configuration for app-wide constants including timing intervals,
 * storage keys, and display limits.
 */

/**
 * Whether to show the developer settings section (test push, ad inspector,
 * etc.) in the Settings screen. Tied to __DEV__ so it appears automatically in
 * dev / Expo dev-client builds and is always stripped from production bundles
 * (where __DEV__ === false). No manual toggle to forget before shipping.
 */
export const DEV_SETTINGS_ENABLED = __DEV__;

/**
 * Ads configuration
 */
export const ADS_ENABLED = true;

// todo: reports system for users to report issues with facts, should get replies. consider sending them push notifications when their report is taken care of.
// todo: consider adding comments section for each fact, with upvoting and sorting by top / new. would increase engagement and time in app, but also requires active moderation to prevent abuse and misinformation. could start with just a simple free-form comment box without threading or voting to test demand before building out more features.

/**
 * App Check settings for Firebase App Check initialization
 */
export const APP_CHECK = {
  /** Maximum retry attempts for App Check initialization */
  INIT_MAX_RETRIES: 2,
  /** Delay between initialization retries (milliseconds) */
  INIT_RETRY_DELAY_MS: 500,
  /** Maximum attempts to fetch the first token after init */
  FIRST_TOKEN_MAX_ATTEMPTS: 5,
  /** Delay between first token fetch retries (milliseconds) */
  FIRST_TOKEN_RETRY_DELAY_MS: 1000,
  /** When true, block the app and reject API calls if App Check init fails */
  STRICT_MODE_ENABLED: true,
  /** Background retry delays for transient first-token failures (exponential backoff) */
  BG_RETRY_DELAYS_MS: [3_000, 6_000, 12_000, 24_000, 48_000],
  /** Quick retry delay for attestation-failed errors (one attempt before blocking) */
  ATTESTATION_FAILED_RETRY_MS: 3_000,
} as const;

/**
 * Interstitial ad settings
 */
export const INTERSTITIAL_ADS = {
  /** Whether interstitial ads are enabled */
  ENABLED: true,
  /** Number of category-save actions between interstitial ads */
  CATEGORY_CHANGES_BETWEEN_ADS: 3,
  /** Number of fact views between interstitial ads */
  FACT_VIEWS_BETWEEN_ADS: 10,
  /** Minimum seconds between interstitial ads (cooldown) */
  COOLDOWN_SECONDS: 600,
  /**
   * Seconds of no in-app interaction (while foregrounded) before an idle
   * interstitial fires. Still subject to COOLDOWN_SECONDS, so this is a trigger,
   * not a cadence — back-to-back idle windows won't stack ads.
   */
  INACTIVITY_SECONDS: 150,
} as const;

/**
 * App Open ad settings
 */
/**
 * Ad request targeting keywords to improve ad relevance and eCPM
 */
export const AD_KEYWORDS = ['trivia', 'facts', 'education', 'learning', 'quiz', 'knowledge'];

export const APP_OPEN_ADS = {
  /** App Open ads expire after 4 hours (Google's limit). Reload if older than this. */
  AD_EXPIRY_MS: 4 * 60 * 60 * 1000,
  /** Minimum milliseconds between app open ads on foreground */
  FOREGROUND_COOLDOWN_MS: 5 * 60 * 1000,
} as const;

/**
 * Native ad settings (in-feed ads)
 */
export const NATIVE_ADS = {
  /** Whether native feed ads are active */
  ACTIVE: true,
  /** Index of the first ad in each list (0-based). Native ads now live only in
   *  the story swipe view — feed and trivia ads were replaced by banners. */
  FIRST_AD_INDEX: {
    STORY: 3,
  },
  /** Show a native ad every N facts in the vertical story swipe view */
  STORY_AD_INTERVAL: 6,
  /** Duration (ms) to block prev/next navigation when a native ad is shown in
   *  the story swipe view */
  NAV_LOCK_DURATION_MS: 850,
} as const;

export const AD_RETRY = {
  /** Maximum number of retry attempts for failed ads */
  MAX_RETRIES: 5,
  /** Delay intervals between retries (milliseconds): 30s, 1m, 2m, 4m, 8m */
  DELAYS: [30000, 60000, 120000, 240000, 480000],
} as const;

/**
 * AsyncStorage keys used throughout the app
 */
export const STORAGE_KEYS = {
  /** Key for tracking the last processed notification ID to prevent duplicate handling */
  NOTIFICATION_TRACK: 'last_processed_notification_id',
  /** Key for tracking number of facts viewed (for app review) */
  FACTS_VIEWED_COUNT: '@facts_viewed_count',
  /** Key for tracking last review prompt timestamp */
  LAST_REVIEW_PROMPT: '@last_review_prompt',
  /** Timestamps of all review prompts shown (JSON array of epoch ms) */
  REVIEW_PROMPT_HISTORY: '@review_prompt_history',
  /** Last satisfaction pre-prompt timestamp */
  LAST_SATISFACTION_PROMPT: '@last_satisfaction_prompt',
  /** Key for tracking the last date explanation hint was used in trivia */
  EXPLANATION_HINT_LAST_USED: '@explanation_hint_last_used',
  /** Key for tracking the number of hints used today */
  EXPLANATION_HINT_COUNT: '@explanation_hint_count',
  /** Key for tracking last paywall prompt timestamp */
  PAYWALL_LAST_SHOWN: '@paywall_last_shown',
  /** Key for tracking number of category-save actions (for interstitial cadence) */
  CATEGORY_CHANGES_COUNT: '@category_changes_count',
  /** Key for tracking fact views since the last fact-view interstitial */
  FACT_VIEWS_SINCE_AD: '@fact_views_since_ad',
} as const;

/**
 * Daily trivia hint limits by user tier
 */
export const HINT_LIMITS = {
  FREE: 1,
  PREMIUM: 3,
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
 * Home feed section item counts
 */
export const HOME_FEED = {
  /** Number of cards in the Latest carousel */
  LATEST_COUNT: 10,
  /** Number of facts per page in the Keep Reading section (infinite scroll) */
  KEEP_READING_PAGE_SIZE: 25,
  /** Number of cards per category carousel on the home screen */
  CATEGORY_CAROUSEL_COUNT: 6,
  /**
   * Min age of the feed data before an automatic refresh (home becoming visible
   * or the app returning to the foreground) triggers another silent background
   * refetch. Keeps rapid back-navigation from re-fetching every loaded page of
   * the cursor feed each time; a manual pull-to-refresh bypasses this gate.
   */
  CONTENT_REFRESH_MIN_AGE_MS: 30_000,
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
  /** Number of days ahead to schedule notifications (and preload images) */
  DAYS_AHEAD: 7,
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
  /** Minimum facts viewed before any review prompt is eligible */
  MIN_FACTS_VIEWED: 15,
  /** Minimum distinct days of app usage before any review prompt */
  MIN_USAGE_DAYS: 3,
  /** Minimum days between review prompts (cooldown) */
  COOLDOWN_DAYS: 90,
  /** Maximum review prompts per rolling 365-day period (iOS enforces 3) */
  MAX_PROMPTS_PER_YEAR: 3,
  /** Minimum trivia accuracy (%) to qualify as a "good score" trigger */
  GOOD_TRIVIA_SCORE_PERCENT: 70,
  /** Streak milestones (in days) that can trigger review prompts */
  STREAK_MILESTONES: [7, 30, 60, 90] as readonly number[],
  /** Minimum favorites count to consider as engaged user */
  MIN_FAVORITES_FOR_TRIGGER: 5,
} as const;

/**
 * Store IDs for linking to app stores
 */
export const APP_STORE_ID = '6755321394';
export const PLAY_STORE_ID = 'dev.seyrek.factsaday';
export const SUPPORT_EMAIL = 'factsadayapp@gmail.com';

/**
 * Minimum number of categories a user must select.
 */
export const MINIMUM_CATEGORIES = 3;

/**
 * Subscription / Premium settings
 */
export const SUBSCRIPTION = {
  /** Whether subscriptions are enabled on this platform */
  ENABLED: true,
  /** Product IDs for subscription plans (must match App Store Connect / Google Play Console) */
  PRODUCT_IDS: [
    'factsaday_premium_weekly',
    'factsaday_premium_monthly',
    'factsaday_premium_annually',
  ],
  /** Product IDs visible on the paywall (excludes legacy plans still valid for existing subscribers) */
  PAYWALL_PRODUCT_IDS: ['factsaday_premium_weekly', 'factsaday_premium_monthly'],
  /** AsyncStorage key for caching premium status */
  PREMIUM_STORAGE_KEY: '@factsaday_premium_status',
} as const;

/**
 * Paywall prompt settings (auto-show interval)
 */
export const PAYWALL_PROMPT = {
  /** Minimum days between automatic paywall prompts */
  MIN_DAYS_BETWEEN_PROMPTS: 1,
  /** Delay after screen focus before showing paywall (ms) */
  DELAY_MS: 1500,
} as const;
