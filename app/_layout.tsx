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

import { AppCheckBlockingScreen } from '../src/components/AppCheckBlockingScreen';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { SplashOverlay } from '../src/components/SplashOverlay';
import { STORAGE_KEYS, TIMING } from '../src/config/app';
import { isAppCheckInitFailed, subscribeAppCheckFailure } from '../src/config/appCheckState';
import { enableCrashlyticsConsoleLogging, initializeFirebase, retryAppCheckInit } from '../src/config/firebase';
import {
  OnboardingProvider,
  PreloadedDataProvider,
  PremiumProvider,
  ScrollToTopProvider,
  setLocaleRefreshPending,
  setPreloadedFactsBeforeMount,
  setPreloadedRecommendationsBeforeMount,
  signalLocaleRefreshDone,
  useOnboarding,
} from '../src/contexts';
import { getLocaleFromCode, I18nProvider } from '../src/i18n';
import { initializeAdsForReturningUser } from '../src/services/ads';
import { setIsPremium } from '../src/services/premiumState';
import { getCachedPremiumStatus, initIAPConnection, checkAndUpdatePremiumStatus } from '../src/services/purchases';
import { initAnalytics } from '../src/services/analytics';
import * as contentRefresh from '../src/services/contentRefresh';
import * as database from '../src/services/database';
import {
  ensureImagesDirExists,
  prefetchFactImage,
  prefetchFactImagesWithLimit,
} from '../src/services/images';
import * as notificationService from '../src/services/notifications';
import * as onboardingService from '../src/services/onboarding';
import * as updates from '../src/services/updates';
import { AppThemeProvider, hexColors, useTheme } from '../src/theme';

// Prevent "multiple linking listeners" error during Fast Refresh
// This tells expo-router the initial route, helping it manage navigation state properly
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Initialize Firebase Crashlytics and Analytics as early as possible
initializeFirebase();

// Forward console logs to Crashlytics in production
// This captures console.log/warn/error as breadcrumbs for crash reports
enableCrashlyticsConsoleLogging();

// Initialize analytics with device info and user properties
initAnalytics();

// Keep native splash visible until SplashOverlay is ready to take over
SplashScreen.preventAutoHideAsync();

// Log update status on app start for debugging OTA issues
if (!__DEV__) {
  updates.logUpdateStatus();
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
function IAPSafeProvider({ children }: { children: React.ReactNode }) {
  if (__DEV__ && !Device.isDevice) {
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

            // Prefetch image before navigation for faster modal display
            const fact = await database.getFactById(Number(factId));
            if (fact?.image_url) {
              prefetchFactImage(fact.image_url, fact.id);
            }

            router.push(`/fact/${factId}?source=notification`);

            // Sync notification schedule (check/repair/top-up)
            const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
            console.log('🔔 Notification opened, syncing schedule...');
            notificationService
              .syncNotificationSchedule(getLocaleFromCode(deviceLocale))
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
      // Only run when app transitions from background/inactive to active (foreground)
      if (
        appStateRef.current.match(/inactive|background/) &&
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
          .syncNotificationSchedule(getLocaleFromCode(deviceLocale))
          .catch((error) => {
            console.error('Notification sync failed:', error);
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
      // Initialize database first with timeout (10 seconds)
      const dbPromise = database.openDatabase();
      const dbTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database initialization timed out')), 10000)
      );

      await Promise.race([dbPromise, dbTimeoutPromise]);
      setIsDbReady(true);

      // Pre-warm image cache directory (fire-and-forget)
      ensureImagesDirExists().catch(() => {});

      // Configure notifications on app start
      notificationService.configureNotifications();

      // Clean up notification images for already-delivered notifications
      notificationService.cleanupOldNotificationImages().catch(() => {});

      // Check onboarding status with timeout (5 seconds)
      const onboardingPromise = onboardingService.isOnboardingComplete();
      const onboardingTimeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Onboarding status check timed out')), 5000)
      );

      const isComplete = await Promise.race([onboardingPromise, onboardingTimeoutPromise]);

      // Only initialize ads and pre-load data for returning users
      // New users will have ads initialized during the onboarding success screen
      if (isComplete) {
        // Initialize IAP and check premium status before ads
        // First use cached status for instant check, then verify with store
        const cachedPremium = await getCachedPremiumStatus();
        setIsPremium(cachedPremium);

        try {
          await initIAPConnection();
          await checkAndUpdatePremiumStatus();
        } catch (error) {
          console.error('Failed to initialize IAP:', error);
        }

        const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
        const locale = getLocaleFromCode(deviceLocale);

        // Check if locale changed (e.g. user changed app language in device settings)
        const localeStatus = await contentRefresh.hasLocaleChanged();

        if (localeStatus.changed) {
          // Locale changed (OS cold-restarted the app)
          // Gate the splash so it stays visible during refresh + app open ad.
          // We set onboarding status early so the JS splash overlay mounts,
          // but the splash won't fade out until signalLocaleRefreshDone() is called.
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

          // Run content refresh + app open ad in parallel
          // Splash stays visible because localeRefreshPromise is still pending
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
            prefetchFactImagesWithLimit(facts);
          } catch (error) {
            console.error('Failed to re-load home screen data:', error);
          }

          // Now let splash fade out
          signalLocaleRefreshDone();
        } else {
          // No locale change - normal startup flow
          // Pre-load home screen data during splash time
          try {
            await database.markDeliveredFactsAsShown(locale);
            const facts = await database.getFactsGroupedByDate(locale);
            setPreloadedFactsBeforeMount(facts);
            prefetchFactImagesWithLimit(facts);

            // Preload carousel recommendations so images start loading during splash
            const recs = await database.getRandomUnscheduledFacts(6, locale);
            setPreloadedRecommendationsBeforeMount(recs);
            prefetchFactImagesWithLimit(recs);
          } catch (error) {
            console.error('Failed to pre-load home screen data:', error);
          }

          // Let splash close, then do the rest in background
          setInitialOnboardingStatus(isComplete);

          // Initialize ads in background - skip for premium users
          if (!cachedPremium) {
            initializeAdsForReturningUser().catch((error) => {
              console.error('Failed to initialize ads for returning user:', error);
            });
          }

          // Refresh content in background
          contentRefresh.refreshAppContent().catch((error) => {
            console.error('Background refresh failed:', error);
          });
        }

        // Clear notification badge on app launch
        Notifications.setBadgeCountAsync(0);

        // Sync notification schedule (check/repair/top-up)
        // This runs asynchronously and doesn't block app startup
        notificationService
          .syncNotificationSchedule(locale)
          .catch((error) => {
            // Silently handle errors - notifications continue with existing schedule
            console.error('Notification sync failed:', error);
          });

        // Check for OTA updates in the background
        // This runs asynchronously and doesn't block app startup
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
      } else {
        // New user - no ads/preloading needed, just set status
        setInitialOnboardingStatus(false);
      }

      // Log update status in development for debugging
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

  // Keep splash screen visible while loading
  if (!isDbReady || initialOnboardingStatus === null || !fontsLoaded) {
    return null;
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
                        <AppContent />
                      </NavigationThemeWrapper>
                    </AppThemeProvider>
                  </ScrollToTopProvider>
                </IAPSafeProvider>
              </OnboardingProvider>
            </PreloadedDataProvider>
          </I18nProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
      {showSplashOverlay && (
        <SplashOverlay onHidden={() => setShowSplashOverlay(false)} />
      )}
    </View>
  );
}
