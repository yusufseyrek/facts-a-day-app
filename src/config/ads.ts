/**
 * Ads Configuration
 *
 * Central configuration for ad display throughout the app.
 * To re-enable ads, simply change ADS_ENABLED to true.
 */

export const ADS_ENABLED = !__DEV__;

/**
 * Ad retry configuration for handling failed ad loads
 */
export const AD_RETRY = {
  /** Maximum number of retry attempts for failed ads */
  MAX_RETRIES: 5,
  /** Delay intervals between retries (milliseconds): 30s, 1m, 2m, 4m, 8m */
  DELAYS: [30000, 60000, 120000, 240000, 480000],
} as const;
