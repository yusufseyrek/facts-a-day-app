/**
 * Analytics event tracking service
 * Sends events to Firebase Analytics and selected events to PostHog
 */

import { Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Localization from 'expo-localization';

import {
  logEvent,
  logScreenView,
  setAnalyticsUserProperty,
  setCrashlyticsAttribute,
} from '../config/firebase';
import { posthog } from '../config/posthog';
import { getAppVersionInfo } from '../utils/appInfo';

import { enqueueFactEvent } from './factEvents';

import { getNotificationTimes, getSelectedCategories } from './onboarding';

const THEME_STORAGE_KEY = '@app_theme_mode';

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize analytics with device info and settings as user properties
 * Also sends the same info to Crashlytics for better crash debugging context
 * Call this on app startup after Firebase is initialized
 */
export const initAnalytics = async (): Promise<void> => {
  try {
    // Device info values
    const { platform, appVersion, buildNumber, platformBuildId } = getAppVersionInfo();
    const osVersion = Platform.Version?.toString() || 'unknown';
    const deviceBrand = Device.brand || 'unknown';
    const deviceModel = Device.modelName || 'unknown';
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
    await setAnalyticsUserProperty('platform_build_id', platformBuildId);

    // Set device info as Crashlytics attributes (for crash report context)
    await setCrashlyticsAttribute('platform', platform);
    await setCrashlyticsAttribute('os_version', osVersion);
    await setCrashlyticsAttribute('device_brand', deviceBrand);
    await setCrashlyticsAttribute('device_model', deviceModel);
    await setCrashlyticsAttribute('app_version', appVersion);
    await setCrashlyticsAttribute('build_number', buildNumber);
    await setCrashlyticsAttribute('locale', locale);
    await setCrashlyticsAttribute('is_device', isDevice);
    await setCrashlyticsAttribute('platform_build_id', platformBuildId);

    // Get user settings
    const theme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    const themeValue = theme || 'system';
    const categories = await getSelectedCategories();
    const categoriesValue = categories.join(',') || 'none';
    const notificationTimes = await getNotificationTimes();
    // Format times as HH:MM (e.g., "09:00,12:30,18:00")
    const formattedTimes = notificationTimes
      .map((t) => {
        const date = new Date(t);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      })
      .join(',');
    const notifTimesValue = formattedTimes || 'none';

    // Set user settings as Analytics user properties
    await setAnalyticsUserProperty('theme', themeValue);
    await setAnalyticsUserProperty('categories', categoriesValue);
    await setAnalyticsUserProperty('notif_times', notifTimesValue);

    // Set user settings as Crashlytics attributes
    await setCrashlyticsAttribute('theme', themeValue);
    await setCrashlyticsAttribute('categories', categoriesValue);
    await setCrashlyticsAttribute('notif_times', notifTimesValue);

    // Set PostHog super properties (attached to all events)
    posthog.register({
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
    });
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
  posthog.register({ theme });
};

/**
 * Update categories user property when categories change
 * Updates both Analytics and Crashlytics
 */
export const updateCategoriesProperty = async (categories: string[]): Promise<void> => {
  const categoriesValue = categories.join(',') || 'none';
  await setAnalyticsUserProperty('categories', categoriesValue);
  await setCrashlyticsAttribute('categories', categoriesValue);
  posthog.register({ categories: categoriesValue });
};

/**
 * Update notification times user property when times change
 * Updates both Analytics and Crashlytics
 */
export const updateNotificationProperty = async (times: Date[]): Promise<void> => {
  const formattedTimes = times
    .map(
      (t) =>
        `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`
    )
    .join(',');
  const notifTimesValue = formattedTimes || 'none';
  await setAnalyticsUserProperty('notif_times', notifTimesValue);
  await setCrashlyticsAttribute('notif_times', notifTimesValue);
};

// ============================================================================
// Screen Tracking
// ============================================================================

export const trackScreenView = (screenName: string, screenClass?: string): void => {
  logScreenView(screenName, screenClass);
  posthog.screen(screenName, { screen_class: screenClass ?? null });
};

// Screen name constants for consistency
export const Screens = {
  HOME: 'Home',
  DISCOVER: 'Discover',
  TRIVIA: 'Trivia',
  TRIVIA_GAME: 'TriviaGame',
  TRIVIA_PERFORMANCE: 'TriviaPerformance',
  TRIVIA_HISTORY: 'TriviaHistory',
  TRIVIA_CATEGORIES: 'TriviaCategories',
  TRIVIA_RESULTS: 'TriviaResults',
  TRIVIA_LEADERBOARD: 'TriviaLeaderboard',
  FAVORITES: 'Favorites',
  SETTINGS: 'Settings',
  FACT_DETAIL: 'FactDetail',
  ONBOARDING_WELCOME: 'OnboardingWelcome',
  ONBOARDING_FACT_PREVIEW: 'OnboardingFactPreview',
  ONBOARDING_QUESTIONS: 'OnboardingQuestions',
  ONBOARDING_NOTIFICATIONS: 'OnboardingNotifications',
  ONBOARDING_SUCCESS: 'OnboardingSuccess',
  SETTINGS_CATEGORIES: 'SettingsCategories',
  BLOCKED_USERS: 'BlockedUsers',
  STORY: 'Story',
  BADGES: 'Badges',
  BADGE_DETAIL: 'BadgeDetail',
  READING_STATS: 'ReadingStats',
  OFFLINE_LIBRARY: 'OfflineLibrary',
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
  posthog.capture('gdpr_consent', {
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
  posthog.capture('att_permission', { status });
};

// ============================================================================
// Onboarding Events
// ============================================================================

/**
 * Track when user starts onboarding (questions screen mount)
 */
export const trackOnboardingStart = (locale: string): void => {
  logEvent('app_onboarding_start', { locale });
  posthog.capture('onboarding_start', { locale });
};

/**
 * Track an answer to an onboarding preference question
 */
export const trackOnboardingQuizAnswer = (params: {
  questionKey: string;
  optionKey: string;
}): void => {
  const props = { question: params.questionKey, option: params.optionKey };
  logEvent('app_onboarding_quiz_answer', props);
  posthog.capture('onboarding_quiz_answer', props);
};

/**
 * Track the categories derived from quiz answers when the user continues
 */
export const trackOnboardingCategoriesSelected = (categories: string[]): void => {
  const props = { count: categories.length, categories: categories.slice(0, 10).join(',') };
  logEvent('app_onboarding_categories', props);
  posthog.capture('onboarding_categories_selected', props);
};

/**
 * Track when user enables notifications
 */
export const trackOnboardingNotificationsEnabled = (timesCount: number): void => {
  logEvent('app_onboarding_notif_on', { times_count: timesCount });
  posthog.capture('onboarding_notifications_enabled', { times_count: timesCount });
};

/**
 * Track when user skips/denies notifications
 */
export const trackOnboardingNotificationsSkipped = (
  source?: 'os_denied' | 'maybe_later' | 'error'
): void => {
  const props = { source: source ?? 'maybe_later' };
  logEvent('app_onboarding_notif_skip', props);
  posthog.capture('onboarding_notifications_skipped', props);
};

/**
 * Track when onboarding is complete
 */
export const trackOnboardingComplete = (params: {
  locale: string;
  categoriesCount: number;
  notificationsEnabled: boolean;
}): void => {
  const props = {
    locale: params.locale,
    categories_count: params.categoriesCount,
    notifications_enabled: params.notificationsEnabled,
  };
  logEvent('app_onboarding_done', props);
  posthog.capture('onboarding_complete', props);
};

// ============================================================================
// Content Engagement Events
// ============================================================================

export type FactViewSource =
  | 'home_latest'
  | 'home_keep_reading'
  | 'home_on_this_day'
  | 'discover_search'
  | 'discover_category'
  | 'favorites'
  | 'story'
  | 'notification'
  | 'trivia_review'
  | 'widget';

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
  posthog.capture('fact_viewed', {
    fact_id: params.factId,
    category: params.category,
    source: params.source,
  });
  // First-party engagement tracker (our own backend) — see factEvents.ts.
  enqueueFactEvent(params.factId, 'view');
};

/**
 * Track when user shares a fact
 */
export const trackFactShare = (params: { factId: number; category: string }): void => {
  logEvent('app_fact_share', {
    fact_id: params.factId,
    category: params.category,
  });
  posthog.capture('fact_shared', {
    fact_id: params.factId,
    category: params.category,
  });
};

export type SharePlatform = 'instagram_stories' | 'whatsapp' | 'twitter' | 'facebook' | 'general';

/**
 * Track when user shares a fact with platform info
 */
export const trackFactShareWithPlatform = (params: {
  factId: number;
  category: string;
  platform: SharePlatform;
  success: boolean;
}): void => {
  logEvent('app_fact_share', {
    fact_id: params.factId,
    category: params.category,
    platform: params.platform,
    success: params.success,
  });
  posthog.capture('fact_shared', {
    fact_id: params.factId,
    category: params.category,
    platform: params.platform,
    success: params.success,
  });
  // First-party tracker: count one event per COMPLETED share (not cancellations),
  // and only here — trackFactShare fires on the share *intent* and would double-count.
  if (params.success) enqueueFactEvent(params.factId, 'share');
};

/**
 * Track when user adds a fact to favorites
 */
export const trackFactFavoriteAdd = (params: { factId: number; category: string }): void => {
  logEvent('app_fact_fav_add', {
    fact_id: params.factId,
    category: params.category,
  });
  posthog.capture('fact_favorited', {
    fact_id: params.factId,
    category: params.category,
  });
  // First-party engagement tracker (our own backend) — see factEvents.ts.
  enqueueFactEvent(params.factId, 'favorite');
};

/**
 * Track when user removes a fact from favorites
 */
export const trackFactFavoriteRemove = (params: { factId: number; category: string }): void => {
  logEvent('app_fact_fav_remove', {
    fact_id: params.factId,
    category: params.category,
  });
  posthog.capture('fact_unfavorited', {
    fact_id: params.factId,
    category: params.category,
  });
};

/**
 * Track when user reports a fact
 */
export const trackFactReport = (factId: number): void => {
  logEvent('app_fact_report', { fact_id: factId });
  posthog.capture('fact_reported', { fact_id: factId });
};

/**
 * Track when user clicks source link
 */
export const trackSourceLinkClick = (params: { factId: number; domain: string }): void => {
  const props = { fact_id: params.factId, domain: params.domain };
  logEvent('app_source_click', props);
  posthog.capture('source_link_clicked', props);
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
  const props = {
    search_term: params.searchTerm.substring(0, 100),
    results_count: params.resultsCount,
    category_filter: params.categoryFilter || '',
  };
  logEvent('app_search', props);
  posthog.capture('search', props);
};

/**
 * Track category browse in Discover
 */
export const trackCategoryBrowse = (params: { category: string; factsCount: number }): void => {
  const props = { category: params.category, facts_count: params.factsCount };
  logEvent('app_category_browse', props);
  posthog.capture('category_browsed', props);
};

export type FeedRefreshSource = 'pull' | 'focus' | 'foreground' | 'interval';

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
export const trackThemeChange = (params: { from: string; to: string }): void => {
  logEvent('app_theme_change', { from: params.from, to: params.to });
  posthog.capture('theme_changed', { from: params.from, to: params.to });
};

/**
 * Track categories update in settings
 */
export const trackCategoriesUpdate = (params: {
  count: number;
  addedCount: number;
  removedCount: number;
}): void => {
  const props = {
    count: params.count,
    added_count: params.addedCount,
    removed_count: params.removedCount,
  };
  logEvent('app_categories_update', props);
  posthog.capture('categories_updated', props);
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

export type InterstitialSource =
  | 'settings'
  | 'trivia_results'
  | 'fact_view'
  | 'inactivity'
  | 'queue_next_fact';

/**
 * Track when interstitial ad is shown
 */
export const trackInterstitialShown = (source: InterstitialSource): void => {
  logEvent('app_interstitial_shown', { source });
  posthog.capture('interstitial_shown', { source });
};

/**
 * Track when App Open ad is shown (impression).
 *
 * NOTE: `app_open_ad_shown` is the AdMob-comparable metric — compare its count
 * to AdMob app-open ad impressions. Do NOT compare AdMob against GA4's automatic
 * `app_open` event (a Firebase-collected app-foreground signal) or PostHog's
 * `Application Opened`/`Became Active` lifecycle events — those count app
 * resumes, not ad impressions, and will always be far higher.
 */
export const trackAppOpenAdShown = (source: 'foreground'): void => {
  logEvent('app_open_ad_shown', { source });
  posthog.capture('app_open_ad_shown', { source });
};

// ============================================================================
// Trivia Events
// ============================================================================

export type TriviaMode = 'daily' | 'mixed' | 'category' | 'quick';

/**
 * Track when user starts a trivia session
 */
export const trackTriviaStart = (params: {
  mode: TriviaMode;
  questionCount: number;
  categorySlug?: string;
}): void => {
  const props = {
    mode: params.mode,
    question_count: params.questionCount,
    category_slug: params.categorySlug || '',
  };
  logEvent('app_trivia_start', props);
  posthog.capture('trivia_started', props);
};

/**
 * Track when user completes a trivia session
 */
export const trackTriviaComplete = (params: {
  mode: TriviaMode;
  questionCount: number;
  correctCount: number;
  elapsedTime: number;
  bestStreak: number;
  timeExpired: boolean;
  categorySlug?: string;
}): void => {
  const accuracy =
    params.questionCount > 0 ? Math.round((params.correctCount / params.questionCount) * 100) : 0;

  const props = {
    mode: params.mode,
    question_count: params.questionCount,
    correct_count: params.correctCount,
    accuracy,
    elapsed_time: params.elapsedTime,
    best_streak: params.bestStreak,
    time_expired: params.timeExpired,
    category_slug: params.categorySlug || '',
  };
  logEvent('app_trivia_complete', props);
  posthog.capture('trivia_completed', props);
};

/**
 * Track when user exits a trivia session early
 */
export const trackTriviaExit = (params: {
  mode: TriviaMode;
  questionsAnswered: number;
  totalQuestions: number;
  categorySlug?: string;
}): void => {
  const props = {
    mode: params.mode,
    questions_answered: params.questionsAnswered,
    total_questions: params.totalQuestions,
    category_slug: params.categorySlug || '',
  };
  logEvent('app_trivia_exit', props);
  posthog.capture('trivia_exited', props);
};

/**
 * Track when user views trivia session results from history
 */
export const trackTriviaResultsView = (params: {
  mode: TriviaMode;
  sessionId: number;
  categorySlug?: string;
}): void => {
  const props = {
    mode: params.mode,
    session_id: params.sessionId,
    category_slug: params.categorySlug || '',
  };
  logEvent('app_trivia_results_view', props);
  posthog.capture('trivia_results_viewed', props);
};

/**
 * Track when user clicks the hint button during trivia
 */
export const trackTriviaHintClick = (params: {
  mode: TriviaMode;
  questionIndex: number;
  source: 'free' | 'rewarded_ad';
  categorySlug?: string;
}): void => {
  const props = {
    mode: params.mode,
    question_index: params.questionIndex,
    source: params.source,
    category_slug: params.categorySlug || '',
  };
  logEvent('app_trivia_hint_click', props);
  posthog.capture('trivia_hint_clicked', props);
};

/**
 * Track when a rewarded ad is shown for a trivia hint
 */
export const trackRewardedAdShown = (params: {
  mode: TriviaMode;
  questionIndex: number;
  categorySlug?: string;
}): void => {
  logEvent('app_rewarded_ad_shown', {
    mode: params.mode,
    question_index: params.questionIndex,
    category_slug: params.categorySlug || '',
  });
};

/**
 * Track the result of a rewarded ad (completed or dismissed)
 */
export const trackRewardedAdResult = (params: {
  mode: TriviaMode;
  questionIndex: number;
  rewarded: boolean;
  categorySlug?: string;
}): void => {
  logEvent('app_rewarded_ad_result', {
    mode: params.mode,
    question_index: params.questionIndex,
    rewarded: params.rewarded,
    category_slug: params.categorySlug || '',
  });
};

// ============================================================================
// Premium Gate Ad Events
// ============================================================================

/**
 * Track when a rewarded ad is shown from the premium fact gate
 */
export const trackPremiumGateAdShown = (params: {
  factId: number;
  categorySlug?: string;
}): void => {
  logEvent('app_premium_gate_ad_shown', {
    fact_id: params.factId,
    category_slug: params.categorySlug || '',
  });
};

/**
 * Track the result of a rewarded ad from the premium fact gate
 */
export const trackPremiumGateAdResult = (params: {
  factId: number;
  rewarded: boolean;
  categorySlug?: string;
}): void => {
  logEvent('app_premium_gate_ad_result', {
    fact_id: params.factId,
    rewarded: params.rewarded,
    category_slug: params.categorySlug || '',
  });
};

// ============================================================================
// Native Ad Events
// ============================================================================

/**
 * Track when a native ad is displayed (impression)
 */
export const trackNativeAdImpression = (params?: {
  placement?: 'feed' | 'story' | 'inline';
  aspectRatio?: string;
  slotKey?: string;
}): void => {
  logEvent('app_native_ad_impression', {
    placement: params?.placement ?? '',
    aspect_ratio: params?.aspectRatio ?? '',
    slot_key: params?.slotKey ?? '',
  });
};

/**
 * Track when user clicks view fact button during trivia
 */
export const trackTriviaViewFactClick = (params: {
  mode: TriviaMode;
  factId: number;
  questionIndex: number;
  categorySlug?: string;
}): void => {
  logEvent('app_trivia_view_fact_click', {
    mode: params.mode,
    fact_id: params.factId,
    question_index: params.questionIndex,
    category_slug: params.categorySlug || '',
  });
};

// ============================================================================
// Subscription/Premium Events
// ============================================================================

/**
 * Track when a subscription is purchased
 */
export const trackSubscriptionPurchased = (params: {
  productId: string;
  source?: string;
  price?: string;
}): void => {
  const props = {
    product_id: params.productId,
    source: params.source ?? '',
    price: params.price ?? '',
  };
  logEvent('app_subscription_purchased', props);
  posthog.capture('subscription_purchased', props);
};

/**
 * Track when a subscription is restored
 */
export const trackSubscriptionRestored = (): void => {
  logEvent('app_subscription_restored', {});
  posthog.capture('subscription_restored');
};

/**
 * Track when the paywall screen is viewed
 */
export const trackPaywallViewed = (source: string): void => {
  logEvent('app_paywall_viewed', { source });
  posthog.capture('paywall_viewed', { source });
};

/**
 * Track when the paywall screen is dismissed
 */
export const trackPaywallDismissed = (source: string): void => {
  logEvent('app_paywall_dismissed', { source });
  posthog.capture('paywall_dismissed', { source });
};

/**
 * Track when subscription status changes
 */
export const trackSubscriptionStatusChanged = (isPremium: boolean): void => {
  logEvent('app_subscription_status_changed', { is_premium: isPremium });
  posthog.capture('subscription_status_changed', { is_premium: isPremium });
};

// ============================================================================
// App Update Events
// ============================================================================

/**
 * Track when an OTA bundle update is applied
 * Sends composite platform + version/build identifier
 */
export const trackAppUpdate = (): void => {
  const { platform, appVersion, buildNumber, platformBuildId } = getAppVersionInfo();

  const props = {
    platform,
    app_version: appVersion,
    build_number: buildNumber,
    platform_build_id: platformBuildId,
  };
  logEvent('app_update', props);
  posthog.capture('app_updated', props);
};

// ============================================================================
// Story Events
// ============================================================================

export const trackStoryOpen = (params: {
  category: string;
  factCount: number;
  isMix: boolean;
  // Story THEMES (query-based collections) reuse this event but must be
  // distinguishable from a plain category open or the all-categories mix.
  isTheme?: boolean;
  themeSlug?: string;
  sourceType?: 'theme' | 'mix' | 'category';
}): void => {
  const props = {
    category: params.category,
    fact_count: params.factCount,
    is_mix: params.isMix,
    is_theme: params.isTheme ?? false,
    theme_slug: params.themeSlug ?? '',
    source_type: params.sourceType ?? (params.isMix ? 'mix' : 'category'),
  };
  logEvent('app_story_open', props);
  posthog.capture('story_opened', props);
};

export const trackStoryFactView = (params: {
  factId: number;
  category: string;
  index: number;
}): void => {
  const props = { fact_id: params.factId, category: params.category, index: params.index };
  logEvent('app_story_fact_view', props);
  posthog.capture('story_fact_viewed', props);
};

export const trackStoryReadMore = (params: { factId: number; category: string }): void => {
  const props = { fact_id: params.factId, category: params.category };
  logEvent('app_story_read_more', props);
  posthog.capture('story_read_more', props);
};

export const trackStoryClose = (params: {
  category: string;
  factsViewed: number;
  totalFacts: number;
}): void => {
  const props = {
    category: params.category,
    facts_viewed: params.factsViewed,
    total_facts: params.totalFacts,
  };
  logEvent('app_story_close', props);
  posthog.capture('story_closed', props);
};

// ============================================================================
// Badge Events
// ============================================================================

/**
 * Track when user opens a badge detail sheet
 */
export const trackBadgeDetailView = (params: {
  badgeId: string;
  category: string;
  earnedStars: number;
}): void => {
  logEvent('app_badge_detail_view', {
    badge_id: params.badgeId,
    category: params.category,
    earned_stars: params.earnedStars,
  });
};

// ============================================================================
// Carousel Events
// ============================================================================

export type CarouselSection = 'latest' | 'on_this_day' | 'onboarding_welcome';

/**
 * Track when user swipes to a new card in a home screen carousel
 */
export const trackCarouselSwipe = (params: {
  section: CarouselSection;
  index: number;
  factId?: number;
}): void => {
  const props = { section: params.section, index: params.index, fact_id: params.factId || 0 };
  logEvent('app_carousel_swipe', props);
  posthog.capture('carousel_swiped', props);
};

// ============================================================================
// App Review Events
// ============================================================================

/**
 * Track when satisfaction modal is shown to the user
 */
export const trackSatisfactionPromptShown = (): void => {
  logEvent('app_satisfaction_prompt_shown');
  posthog.capture('satisfaction_prompt_shown');
};

/**
 * Track the OUTCOME of the satisfaction prompt: love_it routes to the native
 * review flow, not_really opens a feedback email, dismissed closes it.
 */
export const trackSatisfactionPromptResult = (params: {
  result: 'love_it' | 'not_really' | 'dismissed';
  nativeReviewRequested?: boolean;
  openedFeedbackEmail?: boolean;
}): void => {
  const props = {
    result: params.result,
    native_review_requested: params.nativeReviewRequested ?? false,
    opened_feedback_email: params.openedFeedbackEmail ?? false,
  };
  logEvent('app_satisfaction_result', props);
  posthog.capture('satisfaction_prompt_result', props);
};

// ============================================================================
// Comments / UGC Events (Apple 1.2 controls + engagement funnel)
// ============================================================================

/** A new comment was posted successfully. */
export const trackCommentPosted = (params: {
  factId: number;
  commentId: number;
  bodyLength: number;
  locale: string;
}): void => {
  const props = {
    fact_id: params.factId,
    comment_id: params.commentId,
    body_length: params.bodyLength,
    locale: params.locale,
  };
  logEvent('app_comment_posted', props);
  posthog.capture('comment_posted', props);
};

/** Comment post failed (cooldown 429 / moderation 422 / other). */
export const trackCommentPostFailed = (params: {
  factId: number;
  reason: 'cooldown' | 'rejected' | 'error';
  statusCode?: number;
}): void => {
  const props = {
    fact_id: params.factId,
    reason: params.reason,
    status_code: params.statusCode ?? 0,
  };
  logEvent('app_comment_post_failed', props);
  posthog.capture('comment_post_failed', props);
};

/** The comments thread for a fact was opened / first page loaded (exposure). */
export const trackCommentsViewed = (params: {
  factId: number;
  totalCount: number;
  hasComments: boolean;
  loadError?: boolean;
}): void => {
  const props = {
    fact_id: params.factId,
    total_count: params.totalCount,
    has_comments: params.hasComments,
    load_error: params.loadError ?? false,
  };
  logEvent('app_comments_viewed', props);
  posthog.capture('comments_viewed', props);
};

/** Tapped "show more comments" to page the thread. */
export const trackCommentsLoadMore = (params: {
  factId: number;
  loadedCount: number;
  totalCount: number;
}): void => {
  logEvent('app_comments_load_more', {
    fact_id: params.factId,
    loaded_count: params.loadedCount,
    total_count: params.totalCount,
  });
};

/** A comment was reported for moderation (Apple 1.2). */
export const trackCommentReported = (params: { commentId: number; factId: number }): void => {
  const props = { comment_id: params.commentId, fact_id: params.factId };
  logEvent('app_comment_reported', props);
  posthog.capture('comment_reported', props);
};

/** A comment's author was blocked (Apple 1.2). */
export const trackCommentAuthorBlocked = (params: {
  commentId: number;
  factId: number;
}): void => {
  const props = { comment_id: params.commentId, fact_id: params.factId };
  logEvent('app_comment_author_blocked', props);
  posthog.capture('comment_author_blocked', props);
};

/** A previously-blocked user was unblocked from the blocked-users screen. */
export const trackUserUnblocked = (params: {
  source: 'blocked_list';
  remainingBlockedCount?: number;
}): void => {
  const props = {
    source: params.source,
    remaining_blocked_count: params.remainingBlockedCount ?? 0,
  };
  logEvent('app_user_unblocked', props);
  posthog.capture('user_unblocked', props);
};

/** Outcome of the one-time comment EULA / community-rules prompt (Apple 1.2). */
export const trackCommentEulaResult = (params: {
  result: 'agree' | 'view_terms' | 'cancel';
  factId: number;
}): void => {
  const props = { result: params.result, fact_id: params.factId };
  logEvent('app_comment_eula_result', props);
  posthog.capture('comment_eula_result', props);
};

/** The "join the conversation" CTA (opens screen-name claim) was tapped. */
export const trackCommentJoinCtaTapped = (params: { factId: number }): void => {
  const props = { fact_id: params.factId, source: 'comments' };
  logEvent('app_comment_join_cta', props);
  posthog.capture('comment_join_cta_tapped', props);
};

// ============================================================================
// Identity / Account Events
// ============================================================================

/**
 * A screen name was claimed (first identity) or renamed. This is the app's only
 * registration/identity event and the gate for UGC + leaderboard ranking.
 */
export const trackScreenNameClaimed = (params: {
  isFirstClaim: boolean;
  source: 'comments' | 'leaderboard' | 'settings';
  nameLength: number;
  usedRandomizer?: boolean;
  hadTakenCollision?: boolean;
}): void => {
  const props = {
    is_first_claim: params.isFirstClaim,
    source: params.source,
    name_length: params.nameLength,
    used_randomizer: params.usedRandomizer ?? false,
    had_taken_collision: params.hadTakenCollision ?? false,
  };
  logEvent('app_screen_name_claimed', props);
  posthog.capture('screen_name_claimed', props);
};

/** Account deletion executed (Apple 5.1.1(v)) — hard churn + compliance signal. */
export const trackAccountDeleted = (params: {
  result: 'confirmed' | 'failed';
  hadScreenName: boolean;
}): void => {
  const props = {
    result: params.result,
    had_screen_name: params.hadScreenName,
    source: 'settings',
  };
  logEvent('app_account_deleted', props);
  posthog.capture('account_deleted', props);
};

// ============================================================================
// Audio / TTS Narration Events
// ============================================================================

export type AudioSource = 'local' | 'remote';

/** User started (or resumed) fact narration. */
export const trackFactAudioPlay = (params: {
  factId: number;
  categorySlug?: string;
  locale: string;
  source: AudioSource;
  isResume: boolean;
}): void => {
  const props = {
    fact_id: params.factId,
    category_slug: params.categorySlug ?? '',
    locale: params.locale,
    source: params.source,
    is_resume: params.isResume,
  };
  logEvent('app_fact_audio_play', props);
  posthog.capture('fact_audio_play', props);
};

/** Fact narration reached the end (true completion; looping is disabled). */
export const trackFactAudioCompleted = (params: {
  factId: number;
  categorySlug?: string;
  locale: string;
  durationSeconds: number;
}): void => {
  const props = {
    fact_id: params.factId,
    category_slug: params.categorySlug ?? '',
    locale: params.locale,
    duration_seconds: Math.round(params.durationSeconds),
  };
  logEvent('app_fact_audio_completed', props);
  posthog.capture('fact_audio_completed', props);
};

/** User paused narration mid-playback. */
export const trackFactAudioPause = (params: {
  factId: number;
  locale: string;
  positionSeconds: number;
  durationSeconds: number;
}): void => {
  logEvent('app_fact_audio_pause', {
    fact_id: params.factId,
    locale: params.locale,
    position_seconds: Math.round(params.positionSeconds),
    duration_seconds: Math.round(params.durationSeconds),
  });
};

/** Narration playback errored (otherwise only __DEV__-logged and silently reset). */
export const trackFactAudioError = (params: {
  factId: number;
  locale: string;
  source: AudioSource;
  errorMessage: string;
}): void => {
  logEvent('app_fact_audio_error', {
    fact_id: params.factId,
    locale: params.locale,
    source: params.source,
    error_message: params.errorMessage.substring(0, 200),
  });
};

// ============================================================================
// Story Button / Home Rail Events
// ============================================================================

/** A story button on the home rail was tapped (category, all-mix, or theme). */
export const trackStoryButtonTap = (params: {
  slug: string;
  buttonKind: 'mix' | 'category' | 'theme';
  isTheme: boolean;
  themeId?: number;
  position?: number;
}): void => {
  const props = {
    slug: params.slug,
    button_kind: params.buttonKind,
    is_theme: params.isTheme,
    theme_id: params.themeId ?? 0,
    position: params.position ?? -1,
  };
  logEvent('app_story_button_tap', props);
  posthog.capture('story_button_tapped', props);
};

// ============================================================================
// Trivia Leaderboard / Question Events
// ============================================================================

/** Leaderboard window (today / week / all-time) switched. */
export const trackLeaderboardWindowSwitched = (params: {
  window: 'today' | 'week' | 'all';
  hasScreenName: boolean;
  viewerRank?: number;
}): void => {
  const props = {
    window: params.window,
    has_screen_name: params.hasScreenName,
    viewer_rank: params.viewerRank ?? 0,
  };
  logEvent('app_leaderboard_window', props);
  posthog.capture('trivia_leaderboard_window_switched', props);
};

/** A single trivia question was answered (high-volume; Firebase only). */
export const trackTriviaQuestionAnswered = (params: {
  mode: TriviaMode;
  questionIndex: number;
  isCorrect: boolean;
  questionType?: string;
  categorySlug?: string;
}): void => {
  logEvent('app_trivia_answer', {
    mode: params.mode,
    question_index: params.questionIndex,
    is_correct: params.isCorrect,
    question_type: params.questionType ?? '',
    category_slug: params.categorySlug ?? '',
  });
};

/** A trivia streak milestone was reached. */
export const trackTriviaStreakMilestone = (params: {
  bestStreak: number;
  mode: TriviaMode;
  milestoneThreshold: number;
}): void => {
  const props = {
    best_streak: params.bestStreak,
    mode: params.mode,
    milestone_threshold: params.milestoneThreshold,
  };
  logEvent('app_trivia_streak_milestone', props);
  posthog.capture('trivia_streak_milestone', props);
};

// ============================================================================
// Paywall / Purchase Funnel Events
// ============================================================================

/** A subscription plan tile was selected on the paywall. */
export const trackPaywallPlanSelected = (params: {
  productId: string;
  source: string;
  isDefault: boolean;
  displayPrice?: string;
}): void => {
  logEvent('app_paywall_plan_selected', {
    product_id: params.productId,
    source: params.source,
    is_default: params.isDefault,
    display_price: params.displayPrice ?? '',
  });
};

/** Purchase initiated (Start Premium tapped, requestPurchase called). */
export const trackPaywallPurchaseInitiated = (params: {
  productId: string;
  source: string;
  displayPrice?: string;
}): void => {
  const props = {
    product_id: params.productId,
    source: params.source,
    display_price: params.displayPrice ?? '',
  };
  logEvent('app_purchase_initiated', props);
  posthog.capture('paywall_purchase_initiated', props);
};

/** Purchase failed (non-cancel store error). */
export const trackPaywallPurchaseFailed = (params: {
  productId: string;
  source: string;
  errorCode?: string;
  errorMessage?: string;
}): void => {
  const props = {
    product_id: params.productId,
    source: params.source,
    error_code: params.errorCode ?? '',
    error_message: (params.errorMessage ?? '').substring(0, 200),
  };
  logEvent('app_purchase_failed', props);
  posthog.capture('paywall_purchase_failed', props);
};

/** Purchase cancelled by the user (store sheet dismissed). */
export const trackPaywallPurchaseCancelled = (params: {
  productId: string;
  source: string;
}): void => {
  const props = { product_id: params.productId, source: params.source };
  logEvent('app_purchase_cancelled', props);
  posthog.capture('paywall_purchase_cancelled', props);
};

/** Restore Purchases tapped. */
export const trackRestorePurchasesTapped = (params: {
  source: 'paywall' | 'settings';
}): void => {
  logEvent('app_restore_tapped', { source: params.source });
  posthog.capture('restore_purchases_tapped', { source: params.source });
};

/** Restore Purchases result. */
export const trackRestorePurchasesResult = (params: {
  result: 'restored' | 'none' | 'error';
  source: 'paywall' | 'settings';
  errorMessage?: string;
}): void => {
  const props = {
    result: params.result,
    source: params.source,
    error_message: (params.errorMessage ?? '').substring(0, 200),
  };
  logEvent('app_restore_result', props);
  posthog.capture('restore_purchases_result', props);
};

/** Manage / cancel subscription row tapped (deep-links to OS subscriptions). */
export const trackManageSubscriptionTapped = (params: { source: 'settings' }): void => {
  logEvent('app_manage_subscription', { source: params.source });
  posthog.capture('manage_subscription_tapped', { source: params.source });
};

// ============================================================================
// Ad Reliability Events (fill rate, clicks, skips)
// ============================================================================

/** Native ad failed to load (no-fill or rate-limit backoff). */
export const trackNativeAdLoadFailed = (params: {
  reason: 'no_fill' | 'rate_limit';
  aspectRatio?: string;
  attemptNumber?: number;
  retryInMs?: number;
}): void => {
  logEvent('app_native_ad_load_failed', {
    reason: params.reason,
    aspect_ratio: params.aspectRatio ?? '',
    attempt_number: params.attemptNumber ?? 0,
    retry_in_ms: params.retryInMs ?? 0,
  });
};

/** Native ad clicked / opened. */
export const trackNativeAdClick = (params: {
  placement: 'feed' | 'story' | 'inline';
  aspectRatio?: string;
  slotKey?: string;
}): void => {
  const props = {
    placement: params.placement,
    aspect_ratio: params.aspectRatio ?? '',
    slot_key: params.slotKey ?? '',
  };
  logEvent('app_native_ad_click', props);
  posthog.capture('native_ad_click', props);
};

/** An interstitial was requested but skipped (cooldown / no-fill / timeout / error). */
export const trackInterstitialSkipped = (params: {
  source: InterstitialSource;
  reason: 'cooldown' | 'no_fill' | 'load_timeout' | 'show_error';
}): void => {
  logEvent('app_interstitial_skipped', { source: params.source, reason: params.reason });
};

/** App-open ad failed to load / no-fill. */
export const trackAppOpenAdLoadFailed = (params: {
  source: 'foreground';
  errorMessage?: string;
}): void => {
  logEvent('app_open_ad_load_failed', {
    source: params.source,
    error_message: (params.errorMessage ?? '').substring(0, 200),
  });
};

export type AdFormat = 'native' | 'banner' | 'interstitial' | 'app_open' | 'rewarded';

/**
 * Ad revenue paid-event (AdMob onPaidEvent), fired per impression that earns.
 * `value` is in MAJOR currency units — the SDK reports valueMicros and the
 * RN library hands us valueMicros * 1e-6, so we also re-derive value_micros
 * for integer-safe aggregation. precision is RevenuePrecisions (0 unknown,
 * 1 estimated, 2 publisher-provided, 3 precise). High-volume technical signal,
 * so Firebase only — matching trackNativeAdImpression.
 */
export const trackAdRevenue = (params: {
  format: AdFormat;
  value: number;
  currency: string;
  precision: number;
  placement?: string;
  adUnitId?: string;
}): void => {
  logEvent('app_ad_revenue', {
    format: params.format,
    value: params.value,
    value_micros: Math.round((params.value || 0) * 1e6),
    currency: params.currency || '',
    precision: params.precision,
    placement: params.placement ?? '',
    ad_unit_id: params.adUnitId ?? '',
  });
};

// ============================================================================
// Push Notification Events (out-of-onboarding)
// ============================================================================

export type PushTrigger =
  | 'foreground'
  | 'time_save'
  | 'category_change'
  | 'identity_claim'
  | 'cold_start'
  | 'settings';

/** Push permission requested + resolved OUTSIDE onboarding. */
export const trackPushPermissionResult = (params: {
  status: 'granted' | 'denied';
  trigger: PushTrigger;
  previouslyGranted?: boolean;
}): void => {
  const props = {
    status: params.status,
    trigger: params.trigger,
    previously_granted: params.previouslyGranted ?? false,
  };
  logEvent('app_push_permission', props);
  posthog.capture('push_permission_result', props);
};

/** Push registration (token → backend) succeeded or short-circuited. */
export const trackPushRegisterResult = (params: {
  success: boolean;
  reason:
    | 'ok'
    | 'permission_denied'
    | 'permission_undetermined'
    | 'no_token'
    | 'no_times'
    | 'not_device'
    | 'error';
  trigger?: PushTrigger;
  timesCount?: number;
}): void => {
  logEvent('app_push_register', {
    success: params.success,
    reason: params.reason,
    trigger: params.trigger ?? '',
    times_count: params.timesCount ?? 0,
  });
};

// ============================================================================
// Settings / Misc Action Events
// ============================================================================

/** Rate-app row tapped in Settings (native review with store fallback). */
export const trackRateAppTapped = (params: {
  source: 'settings';
  shown?: boolean;
  fellBackToStore?: boolean;
}): void => {
  logEvent('app_rate_app_tapped', {
    source: params.source,
    shown: params.shown ?? false,
    fell_back_to_store: params.fellBackToStore ?? false,
  });
  posthog.capture('rate_app_tapped', { source: params.source });
};

/** Language row tapped (opens OS per-app language settings). */
export const trackLanguageSettingsOpened = (params: {
  currentLocale: string;
  source: 'settings';
}): void => {
  logEvent('app_language_settings_opened', {
    current_locale: params.currentLocale,
    source: params.source,
  });
};

/** The category filter was cleared on the Discover screen. */
export const trackDiscoverCategoryFilterCleared = (params: {
  category: string;
  source: 'header_x' | 'scope_chip' | 'scroll_top';
}): void => {
  logEvent('app_discover_filter_cleared', {
    category: params.category,
    source: params.source,
  });
  posthog.capture('discover_category_filter_cleared', {
    category: params.category,
    source: params.source,
  });
};

/** Reading-streak indicator in the home header tapped (→ Reading Stats). */
export const trackReadingStreakIndicatorTap = (params: { streak: number }): void => {
  logEvent('app_reading_streak_tap', { streak: params.streak, source: 'home_header' });
  posthog.capture('reading_streak_indicator_tap', { streak: params.streak });
};

/** Infinite-scroll load-more in the home Keep Reading feed. */
export const trackHomeFeedLoadMore = (params: {
  pageIndex: number;
  loadedCount: number;
}): void => {
  logEvent('app_home_feed_load_more', {
    page_index: params.pageIndex,
    loaded_count: params.loadedCount,
  });
};

/** A category filter chip was toggled on the Favorites screen. */
export const trackFavoritesCategoryFilter = (params: {
  category: string;
  resultCount: number;
  totalFavorites: number;
}): void => {
  logEvent('app_favorites_category_filter', {
    category: params.category,
    result_count: params.resultCount,
    total_favorites: params.totalFavorites,
  });
};

// ============================================================================
// Onboarding Reliability Events
// ============================================================================

/** Onboarding init / category-metadata load failed (dead-end retry screen). */
export const trackOnboardingLoadError = (params: {
  reason: 'init_error' | 'metadata_empty' | 'metadata_fetch_failed';
  retry: boolean;
  locale: string;
}): void => {
  const props = { reason: params.reason, retry: params.retry, locale: params.locale };
  logEvent('app_onboarding_load_error', props);
  posthog.capture('onboarding_load_error', props);
};
