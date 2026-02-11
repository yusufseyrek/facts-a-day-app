/**
 * Global test setup — mocks all native modules that crash in Node.js
 */

// ── Expo modules ──

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/documents/',
  cacheDirectory: 'file:///mock/cache/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false, size: 0 }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  downloadAsync: jest.fn().mockResolvedValue({ status: 200, uri: 'file:///mock/download' }),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///mock/documents/',
  cacheDirectory: 'file:///mock/cache/',
  Paths: {
    document: { uri: 'file:///mock/documents/' },
    cache: { uri: 'file:///mock/cache/' },
  },
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false, size: 0 }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  downloadAsync: jest.fn().mockResolvedValue({ status: 200, uri: 'file:///mock/download' }),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notif-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock/manipulated.jpg' }),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { API_BASE_URL: 'https://mock-api.example.com' },
      version: '1.1.0',
      runtimeVersion: '1.1.0',
      updates: { url: 'https://mock-updates.example.com' },
    },
  },
}));

jest.mock('expo-updates', () => ({
  checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: false }),
  fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: false }),
  reloadAsync: jest.fn().mockResolvedValue(undefined),
  readLogEntriesAsync: jest.fn().mockResolvedValue([]),
  setUpdateRequestHeadersOverride: jest.fn(),
  addUpdatesStateChangeListener: jest.fn(() => ({ remove: jest.fn() })),
  updateId: null,
  channel: 'production',
  isEmbeddedLaunch: true,
  isEnabled: true,
  manifest: null,
}));

jest.mock('expo-tracking-transparency', () => ({
  requestTrackingPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', regionCode: 'US' }]),
  locale: 'en-US',
}));

// ── AsyncStorage ──

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    multiGet: jest.fn().mockResolvedValue([]),
    multiSet: jest.fn().mockResolvedValue(undefined),
    multiRemove: jest.fn().mockResolvedValue(undefined),
    getAllKeys: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));

// ── Google Mobile Ads ──

jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    initialize: jest.fn().mockResolvedValue({}),
    setRequestConfiguration: jest.fn().mockResolvedValue(undefined),
    openAdInspector: jest.fn().mockResolvedValue(undefined),
  })),
  AdsConsent: {
    requestInfoUpdate: jest.fn().mockResolvedValue({ status: 'OBTAINED' }),
    getGdprApplies: jest.fn().mockResolvedValue(false),
    gatherConsent: jest.fn().mockResolvedValue({
      canRequestAds: true,
      isConsentFormAvailable: false,
      status: 'OBTAINED',
    }),
    getConsentInfo: jest.fn().mockResolvedValue({ canRequestAds: true }),
    getPurposeConsents: jest.fn().mockResolvedValue('11'),
  },
  AdsConsentStatus: {
    UNKNOWN: 'UNKNOWN',
    REQUIRED: 'REQUIRED',
    NOT_REQUIRED: 'NOT_REQUIRED',
    OBTAINED: 'OBTAINED',
  },
  MaxAdContentRating: { G: 'G', PG: 'PG', T: 'T', MA: 'MA' },
}));

// ── Internal services used as transitive deps ──

jest.mock('../services/analytics', () => ({
  initAnalytics: jest.fn(),
  trackAdsSdkInitialized: jest.fn(),
  trackATTPermissionResult: jest.fn(),
  trackGDPRConsentResult: jest.fn(),
  trackAppUpdate: jest.fn(),
  getAppVersionInfo: jest.fn(() => ({ platformBuildId: 'test-1.0.0' })),
}));

jest.mock('../services/premiumState', () => ({
  shouldShowAds: jest.fn(() => true),
  shouldInitializeAdsSdk: jest.fn(() => true),
  getIsPremium: jest.fn(() => false),
  canShowRewardedAds: jest.fn(() => true),
}));

jest.mock('../config/appCheckState', () => ({
  getAppCheckReady: jest.fn().mockResolvedValue(undefined),
  isAppCheckInitialized: jest.fn(() => true),
  setAppCheckInitialized: jest.fn(),
  resolveAppCheckReady: jest.fn(),
  resetAppCheckReady: jest.fn(),
  isAppCheckInitFailed: jest.fn(() => false),
  setAppCheckInitFailed: jest.fn(),
  subscribeAppCheckFailure: jest.fn(() => jest.fn()),
}));

jest.mock('../services/onboarding', () => ({
  getNotificationTimes: jest.fn().mockResolvedValue([]),
  getSelectedCategories: jest.fn().mockResolvedValue([]),
  isOnboardingComplete: jest.fn().mockResolvedValue(true),
}));

jest.mock('../theme', () => ({
  hexColors: {
    light: { background: '#FFFFFF' },
    dark: { background: '#000000' },
  },
}));

// ── Ad preloader components ──

jest.mock('../components/ads/AppOpenAd', () => ({
  preloadAppOpenAd: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../components/ads/InterstitialAd', () => ({
  preloadInterstitialAd: jest.fn(),
}));

jest.mock('../components/ads/RewardedAd', () => ({
  preloadRewardedAd: jest.fn().mockResolvedValue(undefined),
}));

// ── Silence console output during tests ──
// Source code has logging for diagnostics; suppress it so test output stays clean.
// If you need to debug a specific test, comment these out temporarily.

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

// ── Globals ──

if (typeof global.fetch === 'undefined') {
  (global as any).fetch = jest.fn();
}

if (typeof global.atob === 'undefined') {
  (global as any).atob = (str: string): string => Buffer.from(str, 'base64').toString('binary');
}

if (typeof global.btoa === 'undefined') {
  (global as any).btoa = (str: string): string => Buffer.from(str, 'binary').toString('base64');
}
