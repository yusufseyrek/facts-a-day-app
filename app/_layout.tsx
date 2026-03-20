import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  Montserrat_400Regular,
  Montserrat_400Regular_Italic,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/montserrat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Device from 'expo-device';
import * as Localization from 'expo-localization';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { showAppOpenAdOnForeground } from '../src/components/ads/AppOpenAd';
import { AppCheckBlockingScreen } from '../src/components/AppCheckBlockingScreen';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { SplashOverlay } from '../src/components/SplashOverlay';
import { DEV_FORCE_PREMIUM, STORAGE_KEYS, TIMING } from '../src/config/app';
import { isAppCheckInitFailed, subscribeAppCheckFailure } from '../src/config/appCheckState';
import {
  enableCrashlyticsConsoleLogging,
  initializeFirebase,
  retryAppCheckInit,
} from '../src/config/firebase';
import {
  BadgeToastProvider,
  OnboardingProvider,
  PreloadedDataProvider,
  PremiumProvider,
  ScrollToTopProvider,
  setLocaleRefreshPending,
  setPreloadedFactsBeforeMount,
  signalLocaleRefreshDone,
  useOnboarding,
} from '../src/contexts';
import { getLocaleFromCode, I18nProvider } from '../src/i18n';
import { initializeAdsForReturningUser } from '../src/services/ads';
import { initAnalytics } from '../src/services/analytics';
import { registerBackgroundSync } from '../src/services/backgroundSync';
import * as contentRefresh from '../src/services/contentRefresh';
import { loadDailyFeedSections } from '../src/services/dailyFeed';
import * as database from '../src/services/database';
import { ensureImagesDirExists } from '../src/services/images';
import { startNetworkMonitoring } from '../src/services/network';
import * as notificationService from '../src/services/notifications';
import * as onboardingService from '../src/services/onboarding';
import { setIsPremium } from '../src/services/premiumState';
import {
  checkAndUpdatePremiumStatus,
  getCachedPremiumStatus,
  initIAPConnection,
} from '../src/services/purchases';
import * as updates from '../src/services/updates';
import { AppThemeProvider, hexColors, useTheme } from '../src/theme';

// Prevent "multiple linking listeners" error during Fast Refresh
// This tells expo-router the initial route, helping it manage navigation state properly
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Initialize Firebase Crashlytics and Analytics as early as possible
try {
  initializeFirebase();
} catch (error) {
  console.error('Failed to initialize Firebase:', error);
}

// Forward console logs to Crashlytics in production
try {
  enableCrashlyticsConsoleLogging();
} catch (error) {
  console.error('Failed to enable Crashlytics console logging:', error);
}

// Initialize analytics with device info and user properties
try {
  initAnalytics();
} catch (error) {
  console.error('Failed to initialize analytics:', error);
}

// Start background network connectivity monitoring
try {
  startNetworkMonitoring();
} catch (error) {
  console.error('Failed to start network monitoring:', error);
}

// Keep native splash visible until SplashOverlay is ready to take over
try {
  SplashScreen.preventAutoHideAsync();
} catch (error) {
  console.error('Failed to prevent splash screen auto-hide:', error);
}

// Log update status on app start for debugging OTA issues
try {
  if (!__DEV__) {
    updates.logUpdateStatus();
  }
} catch (error) {
  console.error('Failed to log update status:', error);
}

// Custom dark theme with our app's colors
const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: hexColors.dark.background,
    card: hexColors.dark.surface,
    border: hexColors.dark.border,
    primary: hexColors.dark.primary,
    text: hexColors.dark.text,
  },
};

// Custom light theme with our app's colors
const CustomLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: hexColors.light.background,
    card: hexColors.light.surface,
    border: hexColors.light.border,
    primary: hexColors.light.primary,
    text: hexColors.light.text,
  },
};

// Skip PremiumProvider on emulators in dev mode — IAP can't work without a real store
// Exception: when DEV_FORCE_PREMIUM is on, always mount PremiumProvider so usePremium() works
function IAPSafeProvider({ children }: { children: React.ReactNode }) {
  if (__DEV__ && !Device.isDevice && !DEV_FORCE_PREMIUM) {
    return <>{children}</>;
  }
  return <PremiumProvider>{children}</PremiumProvider>;
}

// Component that wraps content with navigation ThemeProvider based on app theme
function NavigationThemeWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const navigationTheme = theme === 'dark' ? CustomDarkTheme : CustomLightTheme;

  return <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>;
}

// Inner component that uses OnboardingContext for routing logic
function AppContent() {
  const router = useRouter();
  const segments = useSegments();
  const { isOnboardingComplete, setIsOnboardingComplete } = useOnboarding();
  const { theme } = useTheme();

  // Get theme-aware background color for screens and modals
  const backgroundColor = theme === 'dark' ? hexColors.dark.background : hexColors.light.background;

  // Re-check onboarding status when navigating to onboarding paths
  // This ensures the reset onboarding button works correctly
  useEffect(() => {
    const currentPath = segments[0];
    // Only re-check when explicitly navigating TO onboarding, not when leaving it
    if (currentPath === 'onboarding') {
      onboardingService.isOnboardingComplete().then((complete) => {
        setIsOnboardingComplete(complete);
      });
    }
  }, [segments, setIsOnboardingComplete]);

  // Handle navigation based on onboarding status
  useEffect(() => {
    if (isOnboardingComplete === null) return;

    const inOnboarding = segments[0] === 'onboarding';
    const onSuccessScreen = (segments as string[])[1] === 'success';

    if (!isOnboardingComplete && !inOnboarding) {
      // User hasn't completed onboarding, redirect to categories selection
      router.replace('/onboarding');
    } else if (isOnboardingComplete && inOnboarding && !onSuccessScreen) {
      // User has completed onboarding but is in onboarding screens (except success), redirect to main app
      // Success screen handles its own navigation after showing the completion animation
      router.replace('/');
    }
  }, [isOnboardingComplete, segments, router]);

  // Handle notification taps (all scenarios: foreground, background, and cold start)
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (lastNotificationResponse) {
      const factId = lastNotificationResponse.notification.request.content.data.factId;
      const notificationId = lastNotificationResponse.notification.request.identifier;

      // Only navigate if:
      // 1. App is ready and onboarding is complete
      // 2. We have a valid fact ID
      // 3. We haven't already processed this notification (check persistent storage)
      if (factId && isOnboardingComplete) {
        AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_TRACK).then(async (lastId) => {
          if (lastId !== notificationId) {
            // New notification - mark as processed
            await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_TRACK, notificationId);

            router.push(`/fact/${factId}?source=notification`);

            // Sync notification schedule (check/repair/top-up)
            const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
            console.log('🔔 Notification opened, syncing schedule...');
            notificationService
              .ensureNotificationSchedule(getLocaleFromCode(deviceLocale), 'notification_tap')
              .catch((error) => {
                console.error('Notification sync after open failed:', error);
              });
          }
        });
      }
    }
  }, [lastNotificationResponse, isOnboardingComplete, router]);

  const screenOptions = {
    headerShown: false as const,
    contentStyle: { backgroundColor },
  };

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen
        name="fact/[id]"
        options={{
          presentation: 'modal',
          headerShown: false,
          contentStyle: { backgroundColor },
        }}
      />
      <Stack.Screen
        name="[locale]/fact/[id]"
        options={{
          // This route immediately redirects, so no UI needed
          headerShown: false,
          animation: 'none',
        }}
      />
      <Stack.Screen
        name="story/[category]"
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          headerShown: false,
          gestureEnabled: true,
          contentStyle: { backgroundColor },
        }}
      />
      <Stack.Screen name="badges" options={{ headerShown: false }} />
      <Stack.Screen name="trivia" options={{ gestureEnabled: false }} />
      <Stack.Screen
        name="paywall"
        options={{
          presentation: 'modal',
          headerShown: false,
          contentStyle: { backgroundColor },
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [initialOnboardingStatus, setInitialOnboardingStatus] = useState<boolean | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);
  const [appCheckFailed, setAppCheckFailed] = useState(false);
  const [isRetryingAppCheck, setIsRetryingAppCheck] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_400Regular_Italic,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });

  useEffect(() => {
    if (fontError) {
      console.error('Font loading error:', fontError);
    }
  }, [fontError]);

  // Subscribe to App Check failure state for blocking screen
  useEffect(() => {
    // Check initial state (init may have completed before React mounts)
    const initialFailed = isAppCheckInitFailed();
    console.log(`[AppCheck UI] Initial failure state: ${initialFailed}`);
    setAppCheckFailed(initialFailed);
    const unsubscribe = subscribeAppCheckFailure((failed) => {
      console.log(`[AppCheck UI] Failure state changed: ${failed}`);
      setAppCheckFailed(failed);
    });
    return unsubscribe;
  }, []);

  const handleAppCheckRetry = useCallback(async () => {
    setIsRetryingAppCheck(true);
    try {
      await retryAppCheckInit();
    } finally {
      setIsRetryingAppCheck(false);
    }
  }, []);

  // Safety timeout: If the app is still showing blank screen after 15 seconds,
  // force initialization to complete to prevent infinite blank screen
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      if (!isDbReady || initialOnboardingStatus === null) {
        console.error('App initialization timeout - forcing completion');
        if (!isDbReady) setIsDbReady(true);
        if (initialOnboardingStatus === null) setInitialOnboardingStatus(false);
      }
    }, 15000);

    return () => clearTimeout(safetyTimeout);
  }, [isDbReady, initialOnboardingStatus, fontsLoaded]);

  // Track previous app state to detect foreground transitions
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Track when an OTA update has been downloaded and is ready to apply
  const pendingUpdateRef = useRef<boolean>(false);

  useEffect(() => {
    initializeApp();
  }, []);

  // Listen for app state changes to sync notifications and check for OTA updates when app enters foreground
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      // Only run when app transitions from background to active (foreground)
      // Excludes inactive→active (e.g., notification center, share sheet) to prevent
      // showing app open ads while the user is actively using the app
      if (
        appStateRef.current === 'background' &&
        nextAppState === 'active' &&
        initialOnboardingStatus === true
      ) {
        // If an update was downloaded previously, reload the app immediately
        if (pendingUpdateRef.current) {
          console.log('📦 Pending OTA update detected on foreground, reloading app...');
          pendingUpdateRef.current = false;
          try {
            await updates.reloadApp();
            return; // App will reload, no need to continue
          } catch (error) {
            console.error('Failed to reload app for OTA update:', error);
          }
        }

        console.log('📱 App entered foreground, syncing notifications...');
        Notifications.setBadgeCountAsync(0);
        const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
        notificationService
          .ensureNotificationSchedule(getLocaleFromCode(deviceLocale), 'foreground')
          .catch((error) => {
            console.error('Notification sync failed:', error);
          });

        // Show app open ad on foreground (with cooldown)
        showAppOpenAdOnForeground().catch((error) => {
          console.error('Failed to show app open ad on foreground:', error);
        });

        // Check for OTA updates when app enters foreground
        console.log('📦 Checking for OTA updates on foreground...');
        updates
          .checkAndDownloadUpdate()
          .then((result) => {
            if (result.updateAvailable && result.downloaded) {
              console.log('📦 OTA update downloaded, marking as pending for next foreground');
              pendingUpdateRef.current = true;
            }
          })
          .catch((error) => {
            console.error('OTA update check on foreground failed:', error);
          });
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [initialOnboardingStatus]);

  // Periodically check for OTA updates
  // This helps users who keep the app open for long periods get updates
  useEffect(() => {
    if (!initialOnboardingStatus) return;

    const checkForUpdates = () => {
      // Only check when app is in foreground
      if (AppState.currentState === 'active') {
        console.log('📦 Periodic OTA update check...');
        updates
          .checkAndDownloadUpdate()
          .then((result) => {
            if (result.updateAvailable && result.downloaded) {
              console.log('📦 OTA update downloaded, marking as pending for next foreground');
              pendingUpdateRef.current = true;
            }
          })
          .catch((error) => {
            console.error('Periodic OTA update check failed:', error);
          });
      }
    };

    const intervalId = setInterval(checkForUpdates, TIMING.UPDATE_CHECK_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, [initialOnboardingStatus]);

  const initializeApp = async () => {
    try {
      // ── Phase 1: DB init + AsyncStorage reads in parallel ──
      // These are independent: DB uses SQLite, the rest use AsyncStorage.
      // Fire-and-forget tasks that don't need DB can start immediately.
      notificationService.configureNotifications();
      ensureImagesDirExists().catch(() => {});
      notificationService.cleanupOldNotificationImages().catch(() => {});

      const dbPromise = Promise.race([
        database.openDatabase(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database initialization timed out')), 10000)
        ),
      ]);

      const onboardingPromise = Promise.race([
        onboardingService.isOnboardingComplete(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Onboarding status check timed out')), 5000)
        ),
      ]);

      const [, isComplete, cachedPremium, localeStatus] = await Promise.all([
        dbPromise,
        onboardingPromise,
        getCachedPremiumStatus(),
        contentRefresh.hasLocaleChanged(),
      ]);

      setIsDbReady(true);

      // ── Phase 2: Returning user flow ──
      if (!isComplete) {
        setInitialOnboardingStatus(false);

        if (__DEV__) {
          updates.logUpdateStatus();
        }
        return;
      }

      setIsPremium(cachedPremium);

      // Start IAP connection in background — don't block on it
      const iapPromise = (async () => {
        try {
          await initIAPConnection();
          await checkAndUpdatePremiumStatus();
        } catch (error) {
          console.error('Failed to initialize IAP:', error);
        }
      })();

      const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
      const locale = getLocaleFromCode(deviceLocale);

      if (localeStatus.changed) {
        // Locale changed (OS cold-restarted the app)
        // Gate the splash so it stays visible during refresh + app open ad.
        setLocaleRefreshPending();

        // Pre-load home screen data with OLD language first so the home screen
        // can mount and signal ready (required for splash overlay flow)
        try {
          await database.markDeliveredFactsAsShown(locale);
          const facts = await database.getFactsGroupedByDate(locale);
          setPreloadedFactsBeforeMount(facts);
        } catch (error) {
          console.error('Failed to pre-load home screen data:', error);
        }

        // Let the JS splash overlay mount (replaces native splash)
        setInitialOnboardingStatus(isComplete);

        // Initialize ads SDK (needed before loading app open ad) - skip for premium users
        if (!cachedPremium) {
          try {
            await initializeAdsForReturningUser();
          } catch (error) {
            console.error('Failed to initialize ads for locale change:', error);
          }
        }

        // Run content refresh — splash stays visible because localeRefreshPromise is pending
        try {
          await contentRefresh.refreshAppContent();
        } catch (error) {
          console.error('Language change refresh failed:', error);
        }

        // Re-load home screen data with new language
        try {
          await database.markDeliveredFactsAsShown(locale);
          const facts = await database.getFactsGroupedByDate(locale);
          setPreloadedFactsBeforeMount(facts);
        } catch (error) {
          console.error('Failed to re-load home screen data:', error);
        }

        // Now let splash fade out
        signalLocaleRefreshDone();
      } else {
        // No locale change — normal startup flow
        // Pre-load facts + recommendations in parallel
        try {
          await Promise.all([
            database.markDeliveredFactsAsShown(locale),
            loadDailyFeedSections(locale),
          ]);
        } catch (error) {
          console.error('Failed to pre-load home screen data:', error);
        }

        // Let splash close, then do the rest in background
        setInitialOnboardingStatus(isComplete);

        // ── Phase 3: Background tasks (fire-and-forget) ──
        if (!cachedPremium) {
          initializeAdsForReturningUser().catch((error) => {
            console.error('Failed to initialize ads for returning user:', error);
          });
        }

        contentRefresh.refreshAppContent().catch((error) => {
          console.error('Background refresh failed:', error);
        });
      }

      // Wait for IAP to finish (has been running in parallel since Phase 2 start)
      await iapPromise;

      // Clean up stale daily feed cache entries (older than today)
      database.clearStaleFeedCache().catch(() => {});

      // Register background sync for all users (fact sync)
      registerBackgroundSync().catch((error) => {
        console.error('Failed to register background sync:', error);
      });

      // Clear notification badge on app launch
      Notifications.setBadgeCountAsync(0);

      // Sync notification schedule — fire-and-forget
      notificationService.ensureNotificationSchedule(locale, 'cold_start').catch((error) => {
        console.error('Notification sync failed:', error);
      });

      // Check for OTA updates in the background
      updates
        .checkAndDownloadUpdate()
        .then((result) => {
          if (result.updateAvailable && result.downloaded) {
            console.log(
              '📦 OTA update downloaded on cold start, marking as pending for next foreground'
            );
            pendingUpdateRef.current = true;
          } else if (result.error) {
            console.error('OTA update check failed:', result.error);
          }
        })
        .catch((error) => {
          console.error('OTA update check failed:', error);
        });

      if (__DEV__) {
        updates.logUpdateStatus();
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      // Recover from error to prevent blank screen
      if (!isDbReady) setIsDbReady(true);
      setInitialOnboardingStatus(false);
    }
  };

  // onLayout callback - SplashOverlay handles hiding native splash
  const onLayoutRootView = useCallback(() => {
    // Nothing to do here - SplashOverlay handles the transition
  }, []);

  // Render a minimal View while loading so expo-updates registers "content appeared".
  // Without this, the native module never confirms the OTA update as successfully launched,
  // and on next cold start it rolls back to the embedded bundle.
  // The native splash screen is still visible on top, so users see no difference.
  if (!isDbReady || initialOnboardingStatus === null || !fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#0A1628' }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0A1628' }} onLayout={onLayoutRootView}>
      <ErrorBoundary>
        <SafeAreaProvider>
          {appCheckFailed && (
            <AppCheckBlockingScreen onRetry={handleAppCheckRetry} isRetrying={isRetryingAppCheck} />
          )}
          <I18nProvider>
            <PreloadedDataProvider>
              <OnboardingProvider initialComplete={initialOnboardingStatus}>
                <IAPSafeProvider>
                  <ScrollToTopProvider>
                    <AppThemeProvider>
                      <NavigationThemeWrapper>
                        <BadgeToastProvider>
                          <AppContent />
                        </BadgeToastProvider>
                      </NavigationThemeWrapper>
                    </AppThemeProvider>
                  </ScrollToTopProvider>
                </IAPSafeProvider>
              </OnboardingProvider>
            </PreloadedDataProvider>
          </I18nProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
      {showSplashOverlay && <SplashOverlay onHidden={() => setShowSplashOverlay(false)} />}
    </View>
  );
}
