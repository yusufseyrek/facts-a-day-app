/**
 * Firebase Analytics event tracking service
 * Provides typed functions for all analytics events in the app
 */

import { logEvent, logScreenView, setAnalyticsUserProperty, setCrashlyticsAttribute, setFirebaseUser } from '../config/firebase';
import { getStoredDeviceKey } from './api';
import { getSelectedCategories, getNotificationTimes } from './onboarding';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = '@app_theme_mode';

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize analytics with device_key, device info, and settings as user properties
 * Also sends the same info to Crashlytics for better crash debugging context
 * Call this on app startup after Firebase is initialized
 */
export const initAnalytics = async (): Promise<void> => {
  try {
    // Set device key - short key as userId, full key as user property
    const deviceKey = await getStoredDeviceKey();
    if (deviceKey) {
      await setFirebaseUser(deviceKey); // shortKey as userId
      await setAnalyticsUserProperty('device_key', deviceKey); // full key as property
      await setCrashlyticsAttribute('device_key', deviceKey); // full key for crash reports
    }

    // Device info values
    const platform = Platform.OS;
    const osVersion = Platform.Version?.toString() || 'unknown';
    const deviceBrand = Device.brand || 'unknown';
    const deviceModel = Device.modelName || 'unknown';
    const appVersion = Application.nativeApplicationVersion || 'unknown';
    const buildNumber = Application.nativeBuildVersion || 'unknown';
    const locale = Localization.getLocales()[0]?.languageCode || 'unknown';
    const isDevice = Device.isDevice ? 'true' : 'false';

    // Set device info as Analytics user properties
    await setAnalyticsUserProperty('platform', platform);
    await setAnalyticsUserProperty('os_version', osVersion);
    await setAnalyticsUserProperty('device_brand', deviceBrand);
    await setAnalyticsUserProperty('device_model', deviceModel);
    await setAnalyticsUserProperty('app_version', appVersion);
    await setAnalyticsUserProperty('build_number', buildNumber);
    await setAnalyticsUserProperty('locale', locale);
    await setAnalyticsUserProperty('is_device', isDevice);

    // Set device info as Crashlytics attributes (for crash report context)
    await setCrashlyticsAttribute('platform', platform);
    await setCrashlyticsAttribute('os_version', osVersion);
    await setCrashlyticsAttribute('device_brand', deviceBrand);
    await setCrashlyticsAttribute('device_model', deviceModel);
    await setCrashlyticsAttribute('app_version', appVersion);
    await setCrashlyticsAttribute('build_number', buildNumber);
    await setCrashlyticsAttribute('locale', locale);
    await setCrashlyticsAttribute('is_device', isDevice);

    // Get user settings
    const theme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    const themeValue = theme || 'system';
    const categories = await getSelectedCategories();
    const categoriesValue = categories.join(',') || 'none';
    const notificationTimes = await getNotificationTimes();
    // Format times as HH:MM (e.g., "09:00,12:30,18:00")
    const formattedTimes = notificationTimes.map(t => {
      const date = new Date(t);
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }).join(',');
    const notifTimesValue = formattedTimes || 'none';

    // Set user settings as Analytics user properties
    await setAnalyticsUserProperty('theme', themeValue);
    await setAnalyticsUserProperty('categories', categoriesValue);
    await setAnalyticsUserProperty('notif_times', notifTimesValue);

    // Set user settings as Crashlytics attributes
    await setCrashlyticsAttribute('theme', themeValue);
    await setCrashlyticsAttribute('categories', categoriesValue);
    await setCrashlyticsAttribute('notif_times', notifTimesValue);

    if (__DEV__) {
      console.log('📊 Analytics & Crashlytics properties set:', {
        device_key: deviceKey || 'none',
        platform,
        os_version: osVersion,
        device_brand: deviceBrand,
        device_model: deviceModel,
        app_version: appVersion,
        build_number: buildNumber,
        locale,
        is_device: isDevice,
        theme: themeValue,
        categories: categoriesValue,
        notif_times: notifTimesValue,
      });
    }
  } catch (error) {
    console.error('Failed to initialize analytics:', error);
  }
};

/**
 * Update theme user property when theme changes
 * Updates both Analytics and Crashlytics
 */
export const updateThemeProperty = async (theme: string): Promise<void> => {
  await setAnalyticsUserProperty('theme', theme);
  await setCrashlyticsAttribute('theme', theme);
};

/**
 * Update categories user property when categories change
 * Updates both Analytics and Crashlytics
 */
export const updateCategoriesProperty = async (categories: string[]): Promise<void> => {
  const categoriesValue = categories.join(',') || 'none';
  await setAnalyticsUserProperty('categories', categoriesValue);
  await setCrashlyticsAttribute('categories', categoriesValue);
};

/**
 * Update notification times user property when times change
 * Updates both Analytics and Crashlytics
 */
export const updateNotificationProperty = async (times: Date[]): Promise<void> => {
  const formattedTimes = times.map(t => 
    `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`
  ).join(',');
  const notifTimesValue = formattedTimes || 'none';
  await setAnalyticsUserProperty('notif_times', notifTimesValue);
  await setCrashlyticsAttribute('notif_times', notifTimesValue);
};

// ============================================================================
// Screen Tracking
// ============================================================================

export const trackScreenView = (screenName: string, screenClass?: string): void => {
  logScreenView(screenName, screenClass);
};

// Screen name constants for consistency
export const Screens = {
  HOME: 'Home',
  DISCOVER: 'Discover',
  TRIVIA: 'Trivia',
  FAVORITES: 'Favorites',
  SETTINGS: 'Settings',
  FACT_DETAIL: 'FactDetail',
  ONBOARDING_CATEGORIES: 'OnboardingCategories',
  ONBOARDING_NOTIFICATIONS: 'OnboardingNotifications',
  ONBOARDING_SUCCESS: 'OnboardingSuccess',
  SETTINGS_CATEGORIES: 'SettingsCategories',
} as const;

// ============================================================================
// Consent/ATT Events
// ============================================================================

/**
 * Track GDPR consent result
 */
export const trackGDPRConsentResult = (params: {
  status: string;
  canRequestAds: boolean;
  gdprApplies: boolean;
}): void => {
  logEvent('app_gdpr_consent', {
    status: params.status,
    can_request_ads: params.canRequestAds,
    gdpr_applies: params.gdprApplies,
  });
};

/**
 * Track ATT (App Tracking Transparency) permission result - iOS only
 */
export const trackATTPermissionResult = (status: string): void => {
  logEvent('app_att_permission', { status });
};

/**
 * Track ads SDK initialization result
 */
export const trackAdsSdkInitialized = (success: boolean): void => {
  logEvent('app_ads_sdk_init', { success });
};

// ============================================================================
// Onboarding Events
// ============================================================================

/**
 * Track when user starts onboarding (categories screen mount)
 */
export const trackOnboardingStart = (locale: string): void => {
  logEvent('app_onboarding_start', { locale });
};

/**
 * Track when user selects categories and continues
 */
export const trackOnboardingCategoriesSelected = (categories: string[]): void => {
  logEvent('app_onboarding_categories', {
    count: categories.length,
    categories: categories.slice(0, 10).join(','), // Limit to 10 for param size
  });
};

/**
 * Track when user enables notifications
 */
export const trackOnboardingNotificationsEnabled = (timesCount: number): void => {
  logEvent('app_onboarding_notif_on', { times_count: timesCount });
};

/**
 * Track when user skips/denies notifications
 */
export const trackOnboardingNotificationsSkipped = (): void => {
  logEvent('app_onboarding_notif_skip', {});
};

/**
 * Track when onboarding is complete
 */
export const trackOnboardingComplete = (params: {
  locale: string;
  categoriesCount: number;
  notificationsEnabled: boolean;
}): void => {
  logEvent('app_onboarding_done', {
    locale: params.locale,
    categories_count: params.categoriesCount,
    notifications_enabled: params.notificationsEnabled,
  });
};

// ============================================================================
// Content Engagement Events
// ============================================================================

export type FactViewSource = 'feed' | 'discover' | 'favorites' | 'notification' | 'trivia_review';

/**
 * Track when user views a fact
 */
export const trackFactView = (params: {
  factId: number;
  category: string;
  source: FactViewSource;
}): void => {
  logEvent('app_fact_view', {
    fact_id: params.factId,
    category: params.category,
    source: params.source,
  });
};

/**
 * Track when user shares a fact
 */
export const trackFactShare = (params: {
  factId: number;
  category: string;
}): void => {
  logEvent('app_fact_share', {
    fact_id: params.factId,
    category: params.category,
  });
};

/**
 * Track when user adds a fact to favorites
 */
export const trackFactFavoriteAdd = (params: {
  factId: number;
  category: string;
}): void => {
  logEvent('app_fact_fav_add', {
    fact_id: params.factId,
    category: params.category,
  });
};

/**
 * Track when user removes a fact from favorites
 */
export const trackFactFavoriteRemove = (params: {
  factId: number;
  category: string;
}): void => {
  logEvent('app_fact_fav_remove', {
    fact_id: params.factId,
    category: params.category,
  });
};

/**
 * Track when user reports a fact
 */
export const trackFactReport = (factId: number): void => {
  logEvent('app_fact_report', { fact_id: factId });
};

/**
 * Track when user clicks source link
 */
export const trackSourceLinkClick = (params: {
  factId: number;
  domain: string;
}): void => {
  logEvent('app_source_click', {
    fact_id: params.factId,
    domain: params.domain,
  });
};

// ============================================================================
// Discovery/Search Events
// ============================================================================

/**
 * Track search performed
 */
export const trackSearch = (params: {
  searchTerm: string;
  resultsCount: number;
  categoryFilter?: string;
}): void => {
  logEvent('app_search', {
    search_term: params.searchTerm.substring(0, 100), // Limit length
    results_count: params.resultsCount,
    category_filter: params.categoryFilter || '',
  });
};

/**
 * Track category browse in Discover
 */
export const trackCategoryBrowse = (params: {
  category: string;
  factsCount: number;
}): void => {
  logEvent('app_category_browse', {
    category: params.category,
    facts_count: params.factsCount,
  });
};

export type FeedRefreshSource = 'pull' | 'notification' | 'auto';

/**
 * Track feed refresh
 */
export const trackFeedRefresh = (source: FeedRefreshSource): void => {
  logEvent('app_feed_refresh', { source });
};

// ============================================================================
// Settings Events
// ============================================================================

/**
 * Track theme change
 */
export const trackThemeChange = (params: {
  from: string;
  to: string;
}): void => {
  logEvent('app_theme_change', {
    from: params.from,
    to: params.to,
  });
};

/**
 * Track categories update in settings
 */
export const trackCategoriesUpdate = (params: {
  count: number;
  addedCount: number;
  removedCount: number;
}): void => {
  logEvent('app_categories_update', {
    count: params.count,
    added_count: params.addedCount,
    removed_count: params.removedCount,
  });
};

/**
 * Track notification time change
 */
export const trackNotificationTimeChange = (timesCount: number): void => {
  logEvent('app_notif_time_change', { times_count: timesCount });
};

// ============================================================================
// Ads Events
// ============================================================================

export type InterstitialSource = 'fact_view' | 'settings' | 'content_refresh' | 'trivia_results';

/**
 * Track when interstitial ad is shown
 */
export const trackInterstitialShown = (source: InterstitialSource): void => {
  logEvent('app_interstitial_shown', { source });
};

