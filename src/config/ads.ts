/**
 * Ads Configuration
 *
 * Central configuration for ad display throughout the app.
 * To re-enable ads, simply change ADS_ENABLED to true.
 */

export const ADS_ENABLED = true;

// Interstitial ad frequency
export const FACTS_BEFORE_INTERSTITIAL = 8; // Show interstitial after every 8 fact views

// Banner ad refresh interval (in milliseconds)
// Google AdMob recommends minimum 30 seconds between refreshes
export const BANNER_REFRESH_INTERVAL = 60000; // 60 seconds
