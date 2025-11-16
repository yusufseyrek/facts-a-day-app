import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppThemeProvider } from '../src/theme';
import { I18nProvider } from '../src/i18n';
import { OnboardingProvider } from '../src/contexts';
import * as onboardingService from '../src/services/onboarding';
import * as notificationService from '../src/services/notifications';
import * as database from '../src/services/database';
import * as contentRefresh from '../src/services/contentRefresh';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';

export default function RootLayout() {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize database first
      await database.openDatabase();
      setIsDbReady(true);

      // Configure notifications on app start
      notificationService.configureNotifications();

      // Check onboarding status
      await checkOnboardingStatus();

      // Refresh content in background if onboarding is complete
      // This runs asynchronously and doesn't block app startup
      const isComplete = await onboardingService.isOnboardingComplete();
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
    }
  };

  const checkOnboardingStatus = async () => {
    const complete = await onboardingService.isOnboardingComplete();
    setIsOnboardingComplete(complete);
  };

  // Re-check onboarding status when navigating to onboarding paths
  // This ensures the reset onboarding button works correctly
  useEffect(() => {
    const currentPath = segments[0];
    // Only re-check when explicitly navigating TO onboarding, not when leaving it
    if (currentPath === 'onboarding') {
      checkOnboardingStatus();
    }
  }, [segments]);

  useEffect(() => {
    if (isOnboardingComplete === null) return;

    const inOnboarding = segments[0] === 'onboarding';

    if (!isOnboardingComplete && !inOnboarding) {
      // User hasn't completed onboarding, redirect to language selection
      router.replace('/onboarding/language');
    } else if (isOnboardingComplete && inOnboarding) {
      // User has completed onboarding but is in onboarding screens, redirect to main app
      router.replace('/');
    }
  }, [isOnboardingComplete, segments]);

  // Handle notification taps (when app is in foreground or background)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const factId = response.notification.request.content.data.factId;

      // Only navigate if app is ready and onboarding is complete
      if (factId && isDbReady && isOnboardingComplete) {
        router.push(`/fact/${factId}`);
      }
    });

    return () => subscription.remove();
  }, [isDbReady, isOnboardingComplete]);

  // Handle notification taps when app was closed (cold start)
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (lastNotificationResponse) {
      const factId = lastNotificationResponse.notification.request.content.data.factId;

      // Only navigate if app is ready and onboarding is complete
      if (factId && isDbReady && isOnboardingComplete) {
        router.push(`/fact/${factId}`);
      }
    }
  }, [lastNotificationResponse, isDbReady, isOnboardingComplete]);

  const screenOptions = {
    headerShown: false as const,
  };

  // Show loading while initializing app and checking onboarding status
  if (!isDbReady || isOnboardingComplete === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <OnboardingProvider>
          <AppThemeProvider>
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
          </AppThemeProvider>
        </OnboardingProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
