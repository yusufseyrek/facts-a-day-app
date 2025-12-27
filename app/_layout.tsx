import { useEffect, useState, useRef } from 'react';
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
import { ActivityIndicator, View, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import { initializeFirebase, enableCrashlyticsConsoleLogging } from '../src/config/firebase';
// expo-system-ui requires native rebuild - import conditionally
let SystemUI: typeof import('expo-system-ui') | null = null;
try {
  SystemUI = require('expo-system-ui');
} catch {
  // Native module not available (needs prebuild)
}
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { initAnalytics } from '../src/services/analytics';
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_400Regular_Italic,
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

// Initialize analytics with device info and user properties
initAnalytics();

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
// Also syncs the native root view background color with the app theme
function NavigationThemeWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const navigationTheme = theme === 'dark' ? CustomDarkTheme : CustomLightTheme;
  
  // Sync native root view background with app theme (when native module is available)
  useEffect(() => {
    if (SystemUI) {
      const backgroundColor = theme === 'dark' 
        ? tokens.color.dark.background 
        : tokens.color.light.background;
      SystemUI.setBackgroundColorAsync(backgroundColor);
    }
  }, [theme]);
  
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
        console.log('📱 App entered foreground, syncing notifications...');
        const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
        notificationService.syncNotificationSchedule(
          getLocaleFromCode(deviceLocale)
        ).catch((error) => {
          console.error('Notification sync failed:', error);
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

        // Sync notification schedule (check/repair/top-up)
        // This runs asynchronously and doesn't block app startup
        const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
        notificationService.syncNotificationSchedule(
          getLocaleFromCode(deviceLocale)
        ).catch((error) => {
          // Silently handle errors - notifications continue with existing schedule
          console.error('Notification sync failed:', error);
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
  // Use dark background to match splash screen and native root view background
  if (!isDbReady || initialOnboardingStatus === null || !fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: tokens.color.dark.background }}>
        <ActivityIndicator size="large" color={tokens.color.dark.primary} />
      </View>
    );
  }

  return (
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
  );
}