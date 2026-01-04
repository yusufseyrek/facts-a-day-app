import { useEffect, useState, useRef, useCallback } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppThemeProvider, useTheme } from '../src/theme';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { tokens } from '../src/theme/tokens';
import { I18nProvider, getLocaleFromCode } from '../src/i18n';
import { OnboardingProvider, useOnboarding } from '../src/contexts';
import * as onboardingService from '../src/services/onboarding';
import * as notificationService from '../src/services/notifications';
import * as database from '../src/services/database';
import * as contentRefresh from '../src/services/contentRefresh';
import { initializeAdsForReturningUser } from '../src/services/ads';
import * as updates from '../src/services/updates';
import { View, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import * as SplashScreen from 'expo-splash-screen';
import { initializeFirebase, enableCrashlyticsConsoleLogging } from '../src/config/firebase';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { initAnalytics } from '../src/services/analytics';
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_400Regular_Italic,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from '@expo-google-fonts/montserrat';


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

const NOTIFICATION_TRACK_KEY = 'last_processed_notification_id';

// Custom dark theme with our app's colors
const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: tokens.color.dark.background,
    card: tokens.color.dark.surface,
    border: tokens.color.dark.border,
    primary: tokens.color.dark.primary,
    text: tokens.color.dark.text,
  },
};

// Custom light theme with our app's colors
const CustomLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: tokens.color.light.background,
    card: tokens.color.light.surface,
    border: tokens.color.light.border,
    primary: tokens.color.light.primary,
    text: tokens.color.light.text,
  },
};

// Component that wraps content with navigation ThemeProvider based on app theme
function NavigationThemeWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const navigationTheme = theme === 'dark' ? CustomDarkTheme : CustomLightTheme;
  
  return (
    <ThemeProvider value={navigationTheme}>
      {children}
    </ThemeProvider>
  );
}

// Inner component that uses OnboardingContext for routing logic
function AppContent() {
  const router = useRouter();
  const segments = useSegments();
  const { isOnboardingComplete, setIsOnboardingComplete } = useOnboarding();
  const { theme } = useTheme();
  
  // Get theme-aware background color for screens and modals
  const backgroundColor = theme === 'dark' 
    ? tokens.color.dark.background 
    : tokens.color.light.background;

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
        AsyncStorage.getItem(NOTIFICATION_TRACK_KEY).then(async (lastId) => {
          if (lastId !== notificationId) {
            // New notification - mark as processed and navigate
            await AsyncStorage.setItem(NOTIFICATION_TRACK_KEY, notificationId);
            router.push(`/fact/${factId}?source=notification`);
            
            // Sync notification schedule (check/repair/top-up)
            const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
            console.log('🔔 Notification opened, syncing schedule...');
            notificationService.syncNotificationSchedule(
              getLocaleFromCode(deviceLocale)
            ).catch((error) => {
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
      <Stack.Screen name="trivia" />
    </Stack>
  );
}

export default function RootLayout() {
  const [initialOnboardingStatus, setInitialOnboardingStatus] = useState<boolean | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_400Regular_Italic,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
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
  
  // Interval for periodic OTA update checks (30 minutes)
  const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;

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
        const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
        notificationService.syncNotificationSchedule(
          getLocaleFromCode(deviceLocale)
        ).catch((error) => {
          console.error('Notification sync failed:', error);
        });

        // Check for OTA updates when app enters foreground
        console.log('📦 Checking for OTA updates on foreground...');
        updates.checkAndDownloadUpdate().then((result) => {
          if (result.updateAvailable && result.downloaded) {
            console.log('📦 OTA update downloaded, marking as pending for next foreground');
            pendingUpdateRef.current = true;
          }
        }).catch((error) => {
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
        updates.checkAndDownloadUpdate().then((result) => {
          if (result.updateAvailable && result.downloaded) {
            console.log('📦 OTA update downloaded, marking as pending for next foreground');
            pendingUpdateRef.current = true;
          }
        }).catch((error) => {
          console.error('Periodic OTA update check failed:', error);
        });
      }
    };

    const intervalId = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

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

      // Configure notifications on app start
      notificationService.configureNotifications();
      
      // Clean up old notification images (older than 7 days)
      notificationService.cleanupOldNotificationImages(7).catch(() => {});

      // Check onboarding status with timeout (5 seconds)
      const onboardingPromise = onboardingService.isOnboardingComplete();
      const onboardingTimeoutPromise = new Promise<boolean>((_, reject) => 
        setTimeout(() => reject(new Error('Onboarding status check timed out')), 5000)
      );
      
      const isComplete = await Promise.race([onboardingPromise, onboardingTimeoutPromise]);
      setInitialOnboardingStatus(isComplete);

      // Only initialize ads for returning users (those who already completed onboarding)
      // New users will have ads initialized during the onboarding success screen
      // after they go through the consent flow
      if (isComplete) {
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

        // Sync notification schedule (check/repair/top-up)
        // This runs asynchronously and doesn't block app startup
        const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
        notificationService.syncNotificationSchedule(
          getLocaleFromCode(deviceLocale)
        ).catch((error) => {
          // Silently handle errors - notifications continue with existing schedule
          console.error('Notification sync failed:', error);
        });

        // Check for OTA updates in the background
        // This runs asynchronously and doesn't block app startup
        updates.checkAndDownloadUpdate().then((result) => {
          if (result.updateAvailable && result.downloaded) {
            console.log('📦 OTA update downloaded on cold start, marking as pending for next foreground');
            pendingUpdateRef.current = true;
          } else if (result.error) {
            console.error('OTA update check failed:', result.error);
          }
        }).catch((error) => {
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

  // Hide splash screen once app is fully loaded
  const onLayoutRootView = useCallback(async () => {
    if (isDbReady && initialOnboardingStatus !== null && fontsLoaded) {
      // Hide splash screen with a slight delay to ensure smooth transition
      await SplashScreen.hideAsync();
    }
  }, [isDbReady, initialOnboardingStatus, fontsLoaded]);

  // Keep splash screen visible while loading
  if (!isDbReady || initialOnboardingStatus === null || !fontsLoaded) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <I18nProvider>
            <OnboardingProvider initialComplete={initialOnboardingStatus}>
              <AppThemeProvider>
                <NavigationThemeWrapper>
                  <AppContent />
                </NavigationThemeWrapper>
              </AppThemeProvider>
            </OnboardingProvider>
          </I18nProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </View>
  );
}