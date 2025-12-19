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
 * Call this on app startup after Firebase is initialized
 */
export const initAnalytics = async (): Promise<void> => {
  try {
    // Set device key - short key as userId, full key as user property
    const deviceKey = await getStoredDeviceKey();
    if (deviceKey) {
      const shortKey = deviceKey.substring(0, 8);
      await setFirebaseUser(shortKey, deviceKey); // shortKey as userId
      await setAnalyticsUserProperty('device_key', deviceKey); // full key as property
    }

    // Set device info as Analytics user properties
    await setAnalyticsUserProperty('platform', Platform.OS);
    await setAnalyticsUserProperty('os_version', Platform.Version?.toString() || 'unknown');
    await setAnalyticsUserProperty('device_brand', Device.brand || 'unknown');
    await setAnalyticsUserProperty('device_model', Device.modelName || 'unknown');
    await setAnalyticsUserProperty('app_version', Application.nativeApplicationVersion || 'unknown');
    await setAnalyticsUserProperty('build_number', Application.nativeBuildVersion || 'unknown');
    await setAnalyticsUserProperty('locale', Localization.getLocales()[0]?.languageCode || 'unknown');
    await setAnalyticsUserProperty('is_device', Device.isDevice ? 'true' : 'false');

    // Set user settings as Analytics user properties
    const theme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    await setAnalyticsUserProperty('theme', theme || 'system');

    const categories = await getSelectedCategories();
    await setAnalyticsUserProperty('categories', categories.join(',') || 'none');

    const notificationTimes = await getNotificationTimes();
    // Format times as HH:MM (e.g., "09:00,12:30,18:00")
    const formattedTimes = notificationTimes.map(t => {
      const date = new Date(t);
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }).join(',');
    await setAnalyticsUserProperty('notif_times', formattedTimes || 'none');

    if (__DEV__) {
      console.log('📊 Analytics user properties set:', {
        platform: Platform.OS,
        os_version: Platform.Version,
        device_brand: Device.brand,
        device_model: Device.modelName,
        app_version: Application.nativeApplicationVersion,
        build_number: Application.nativeBuildVersion,
        locale: Localization.getLocales()[0]?.languageCode,
        is_device: Device.isDevice,
        theme: theme || 'system',
        categories: categories.join(','),
        notif_times: formattedTimes,
      });
    }
  } catch (error) {
    console.error('Failed to initialize analytics:', error);
  }
};

/**
 * Update theme user property when theme changes
 */
export const updateThemeProperty = async (theme: string): Promise<void> => {
  await setAnalyticsUserProperty('theme', theme);
};

/**
 * Update categories user property when categories change
 */
export const updateCategoriesProperty = async (categories: string[]): Promise<void> => {
  await setAnalyticsUserProperty('categories', categories.join(',') || 'none');
};

/**
 * Update notification times user property when times change
 */
export const updateNotificationProperty = async (times: Date[]): Promise<void> => {
  const formattedTimes = times.map(t => 
    `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`
  ).join(',');
  await setAnalyticsUserProperty('notif_times', formattedTimes || 'none');
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

export type FactViewSource = 'feed' | 'discover' | 'favorites' | 'notification';

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

export type InterstitialSource = 'fact_view' | 'settings' | 'content_refresh';

/**
 * Track when interstitial ad is shown
 */
export const trackInterstitialShown = (source: InterstitialSource): void => {
  logEvent('app_interstitial_shown', { source });
};

