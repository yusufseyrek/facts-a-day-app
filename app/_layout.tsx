import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppThemeProvider } from '../src/theme';
import { I18nProvider } from '../src/i18n';
import { OnboardingProvider, useOnboarding } from '../src/contexts';
import * as onboardingService from '../src/services/onboarding';
import * as notificationService from '../src/services/notifications';
import * as database from '../src/services/database';
import * as contentRefresh from '../src/services/contentRefresh';
import { preloadInterstitialAd } from '../src/components/ads';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { initializeSentry } from '../src/config/sentry';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
} from '@expo-google-fonts/montserrat';

// Initialize Sentry as early as possible
initializeSentry();

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
        AsyncStorage.getItem(NOTIFICATION_TRACK_KEY).then((lastId) => {
          if (lastId !== notificationId) {
            // New notification - mark as processed and navigate
            AsyncStorage.setItem(NOTIFICATION_TRACK_KEY, notificationId);
            router.push(`/fact/${factId}`);
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
    </Stack>
  );
}

export default Sentry.wrap(function RootLayout() {
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

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Preload interstitial ad early so it's ready for locale change detection
      preloadInterstitialAd();
      
      // Initialize database first
      await database.openDatabase();
      setIsDbReady(true);

      // Configure notifications on app start
      notificationService.configureNotifications();

      // Check onboarding status
      const isComplete = await onboardingService.isOnboardingComplete();
      setInitialOnboardingStatus(isComplete);

      // Refresh content in background if onboarding is complete
      // This runs asynchronously and doesn't block app startup
      if (isComplete) {
        // Don't await - run in background
        contentRefresh.refreshAppContent().catch((error) => {
          // Silently handle errors - app continues with cached data
          console.error('Background refresh failed:', error);
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
});