import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppThemeProvider } from '../src/theme';
import { I18nProvider, getLocaleFromCode } from '../src/i18n';
import { OnboardingProvider, useOnboarding } from '../src/contexts';
import * as onboardingService from '../src/services/onboarding';
import * as notificationService from '../src/services/notifications';
import * as database from '../src/services/database';
import * as contentRefresh from '../src/services/contentRefresh';
import { initializeAdsForReturningUser } from '../src/services/ads';
import { ActivityIndicator, View, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import { initializeFirebase, enableCrashlyticsConsoleLogging } from '../src/config/firebase';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { initAnalytics } from '../src/services/analytics';
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
} from '@expo-google-fonts/montserrat';

// Initialize Firebase Crashlytics and Analytics as early as possible
initializeFirebase();

// Forward console logs to Crashlytics in production
// This captures console.log/warn/error as breadcrumbs for crash reports
enableCrashlyticsConsoleLogging();

// Initialize analytics with device_key user property
initAnalytics();

const NOTIFICATION_TRACK_KEY = 'last_processed_notification_id';

// Inner component that uses OnboardingContext for routing logic
function AppContent() {
  const router = useRouter();
  const segments = useSegments();
  const { isOnboardingComplete, setIsOnboardingComplete } = useOnboarding();

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
            
            // Top up notifications since one was just consumed
            // This ensures we always have 64 scheduled notifications
            const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
            console.log('🔔 Notification opened, checking if top-up needed...');
            notificationService.checkAndTopUpNotifications(
              getLocaleFromCode(deviceLocale)
            ).catch((error) => {
              console.error('Notification top-up after open failed:', error);
            });
          }
        });
      }
    }
  }, [lastNotificationResponse, isOnboardingComplete, router]);

  const screenOptions = {
    headerShown: false as const,
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
        }}
      />
      <Stack.Screen
        name="trivia/game"
        options={{
          presentation: 'fullScreenModal',
          headerShown: false,
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [initialOnboardingStatus, setInitialOnboardingStatus] = useState<boolean | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    Montserrat_900Black,
  });

  useEffect(() => {
    if (fontError) {
      console.error('Font loading error:', fontError);
    }
  }, [fontError]);

  // Track previous app state to detect foreground transitions
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    initializeApp();
  }, []);

  // Listen for app state changes to top up notifications when app enters foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // Only run when app transitions from background/inactive to active (foreground)
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        initialOnboardingStatus === true
      ) {
        console.log('📱 App entered foreground, checking notifications...');
        const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
        notificationService.checkAndTopUpNotifications(
          getLocaleFromCode(deviceLocale)
        ).catch((error) => {
          console.error('Notification top-up failed:', error);
        });
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [initialOnboardingStatus]);

  const initializeApp = async () => {
    try {
      // Initialize database first
      await database.openDatabase();
      setIsDbReady(true);

      // Configure notifications on app start
      notificationService.configureNotifications();
      
      // Clean up old notification images (older than 7 days)
      // This runs asynchronously and doesn't block app startup
      notificationService.cleanupOldNotificationImages(7).catch((error) => {
        console.error('Notification image cleanup failed:', error);
      });

      // Check onboarding status
      const isComplete = await onboardingService.isOnboardingComplete();
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

        // Check and top up notifications to 64 if enabled
        // This runs asynchronously and doesn't block app startup
        const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
        notificationService.checkAndTopUpNotifications(
          getLocaleFromCode(deviceLocale)
        ).catch((error) => {
          // Silently handle errors - notifications continue with existing schedule
          console.error('Notification top-up failed:', error);
        });
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      // Still set db ready to true to allow app to continue
      setIsDbReady(true);
      setInitialOnboardingStatus(false);
    }
  };

  // Show loading while initializing app, loading fonts, and checking onboarding status
  if (!isDbReady || initialOnboardingStatus === null || !fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <I18nProvider>
          <OnboardingProvider initialComplete={initialOnboardingStatus}>
            <AppThemeProvider>
              <AppContent />
            </AppThemeProvider>
          </OnboardingProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}