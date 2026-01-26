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
import * as Localization from 'expo-localization';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';

import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { SplashOverlay } from '../src/components/SplashOverlay';
import { STORAGE_KEYS, TIMING } from '../src/config/app';
import { enableCrashlyticsConsoleLogging, initializeFirebase } from '../src/config/firebase';
import {
  OnboardingProvider,
  PreloadedDataProvider,
  ScrollToTopProvider,
  setPreloadedFactsBeforeMount,
  useOnboarding,
} from '../src/contexts';
import { getLocaleFromCode, I18nProvider } from '../src/i18n';
import { initializeAdsForReturningUser } from '../src/services/ads';
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
      <Stack.Screen name="trivia" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [initialOnboardingStatus, setInitialOnboardingStatus] = useState<boolean | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);

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
      setInitialOnboardingStatus(isComplete);

      // Only initialize ads and pre-load data for returning users
      // New users will have ads initialized during the onboarding success screen
      if (isComplete) {
        const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
        const locale = getLocaleFromCode(deviceLocale);

        // Pre-load home screen data during splash time
        // This eliminates the loading spinner on home screen
        try {
          await database.markDeliveredFactsAsShown(locale);
          const facts = await database.getFactsGroupedByDate(locale);
          setPreloadedFactsBeforeMount(facts);
          // Start prefetching images in background
          prefetchFactImagesWithLimit(facts);
        } catch (error) {
          console.error('Failed to pre-load home screen data:', error);
        }

        // Initialize ads using consent obtained in the previous session
        initializeAdsForReturningUser().catch((error) => {
          console.error('Failed to initialize ads for returning user:', error);
        });

        // Refresh content in background
        // This runs asynchronously and doesn't block app startup
        contentRefresh.refreshAppContent().catch((error) => {
          // Silently handle errors - app continues with cached data
          console.error('Background refresh failed:', error);
        });

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
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <I18nProvider>
            <PreloadedDataProvider>
              <OnboardingProvider initialComplete={initialOnboardingStatus}>
                <ScrollToTopProvider>
                  <AppThemeProvider>
                    <NavigationThemeWrapper>
                      <AppContent />
                    </NavigationThemeWrapper>
                  </AppThemeProvider>
                </ScrollToTopProvider>
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
