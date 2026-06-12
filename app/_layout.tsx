import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform, Text as RNText, TextInput, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { DEFAULT_MAX_FONT_SIZE_MULTIPLIER } from '../src/utils/responsive';

// Cap system font scaling globally — catches raw RN Text and third-party libs.
for (const Component of [RNText, TextInput]) {
  const c = Component as { defaultProps?: Record<string, unknown> };
  c.defaultProps = { ...c.defaultProps, maxFontSizeMultiplier: DEFAULT_MAX_FONT_SIZE_MULTIPLIER };
}

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
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { setAudioModeAsync } from 'expo-audio';
import * as Localization from 'expo-localization';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PostHogErrorBoundary, PostHogProvider } from 'posthog-react-native';

import { showAppOpenAdOnForeground } from '../src/components/ads/AppOpenAd';
import { AppCheckBlockingScreen } from '../src/components/AppCheckBlockingScreen';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { SplashOverlay } from '../src/components/SplashOverlay';
import { STORAGE_KEYS, TIMING } from '../src/config/app';
import { isAppCheckInitFailed, subscribeAppCheckFailure } from '../src/config/appCheckState';
import {
  enableCrashlyticsConsoleLogging,
  initializeFirebase,
  retryAppCheckInit,
} from '../src/config/firebase';
import { posthog } from '../src/config/posthog';
import { asyncStoragePersister, persistMaxAge, queryClient } from '../src/config/queryClient';
import {
  BadgeToastProvider,
  OnboardingProvider,
  PremiumProvider,
  ReviewPromptProvider,
  ScrollToTopProvider,
  setFeedLoadPending,
  setHomeRenderPending,
  setLocaleRefreshPending,
  signalLocaleRefreshDone,
  useOnboarding,
  waitForFeedLoaded,
} from '../src/contexts';
import { getLocaleFromCode, I18nProvider } from '../src/i18n';
import { initializeAdsForReturningUser } from '../src/services/ads';
import { initAnalytics } from '../src/services/analytics';
import * as contentRefresh from '../src/services/contentRefresh';
import * as database from '../src/services/database';
import { pruneAudioCacheIfOverLimit } from '../src/services/factAudio';
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
import * as triviaSync from '../src/services/triviaSync';
import * as updates from '../src/services/updates';
import * as userService from '../src/services/user';
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

// Configure audio session so fact narration plays even when the iOS silent
// switch is on (matches YouTube/Spotify behavior). Playback is always
// user-initiated via the play button, so this isn't intrusive.
setAudioModeAsync({ playsInSilentMode: true }).catch((error) => {
  console.error('Failed to set audio mode:', error);
});

// Keep native splash visible until SplashOverlay is ready to take over
try {
  SplashScreen.preventAutoHideAsync();
  if (Platform.OS === 'ios') {
    // iOS-only crossfade to mask the native→JS splash handoff.
    SplashScreen.setOptions({ duration: 250, fade: true });
  } else {
    // Android v56 ALWAYS runs an alpha-0 exit animation over `duration` ms
    // (see expo-splash-screen's SplashScreenManager.kt setOnExitAnimationListener).
    // The default 400ms fade is where the white flash appears — during the
    // crossfade the system swaps the activity theme from Theme.App.SplashScreen
    // to AppTheme, and any default-color frame in that window becomes visible.
    // Set duration to 0 so the splash is removed instantly (matching v3/SDK 54
    // behavior). Our JS SplashOverlay is already painted underneath, so the
    // handoff is invisible.
    SplashScreen.setOptions({ duration: 0, fade: false });
  }
} catch (error) {
  console.error('Failed to prevent splash screen auto-hide:', error);
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

function IAPSafeProvider({ children }: { children: React.ReactNode }) {
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
    // The sample-fact preview (fact/sample/[id]) belongs to the onboarding
    // flow but lives on the root stack so its morph can cover the whole
    // window — don't bounce it back to /onboarding.
    const inSamplePreview = segments[0] === 'fact' && (segments as string[])[1] === 'sample';

    if (!isOnboardingComplete && !inOnboarding && !inSamplePreview) {
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
      const factId = lastNotificationResponse.notification.request.content.data?.factId;
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
    <>
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen
          name="fact/[id]"
          options={{
            // Card presentation gives the iOS left-edge swipe-back to dismiss.
            // A horizontal gesture never conflicts with the screen's vertical
            // scroll/parallax (unlike a modal's swipe-down), and
            // fullScreenGestureEnabled lets the swipe start from anywhere across
            // the screen — friendliest while browsing facts.
            //
            // The ONE place this can't be used is the story screen (a
            // fullScreenModal): on iOS a card pushed over a full-screen modal
            // lands BEHIND it, so the story navigates to fact/modal/[id] (below)
            // instead — same screen, modal presentation.
            presentation: 'card',
            headerShown: false,
            gestureEnabled: true,
            gestureDirection: 'horizontal',
            animation: 'slide_from_right',
            fullScreenGestureEnabled: true,
            contentStyle: { backgroundColor },
          }}
        />
        <Stack.Screen
          name="fact/modal/[id]"
          options={{
            // Modal-presented twin of fact/[id], used only when opening fact
            // detail from the story screen (see comment above). Dismiss
            // gestures: the native modal swipe-down plus FactModal's own
            // pull-down-to-close.
            presentation: 'modal',
            headerShown: false,
            gestureEnabled: true,
            contentStyle: { backgroundColor },
          }}
        />
        <Stack.Screen
          name="fact/morph/[id]"
          options={{
            // Morph-presented twin of fact/[id]: a card→detail container
            // transform. transparentModal keeps the feed visible behind while
            // the screen expands from the pressed card's rect; animation:'none'
            // because FactMorphContainer drives ALL motion (open, close, and
            // Android back). Native gestures are off — dismissal goes through
            // the morph controller (X button, pull-down-to-close, hardware
            // back) so the reverse morph always plays.
            presentation: 'transparentModal',
            animation: 'none',
            headerShown: false,
            gestureEnabled: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="fact/sample/[id]"
          options={{
            // Onboarding sample-fact preview, morphing from a pressed welcome
            // carousel card (same container transform as fact/morph/[id]).
            // Registered on the root stack — not the onboarding one — so the
            // expanding screen covers the whole window including the
            // onboarding layout's progress bar, which stays visible (dimmed)
            // behind the transparent modal.
            presentation: 'transparentModal',
            animation: 'none',
            headerShown: false,
            gestureEnabled: false,
            contentStyle: { backgroundColor: 'transparent' },
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
        <Stack.Screen
          name="story/morph/[category]"
          options={{
            // Morph-presented twin of story/[category]: a story-button→story
            // container transform (same pattern as fact/morph/[id]).
            // transparentModal keeps the home feed visible behind while the
            // screen expands from the pressed circle's rect; animation:'none'
            // because StoryMorphContainer drives ALL motion (open, close, and
            // Android back). Native gestures are off — dismissal goes through
            // the morph controller (X button, left-edge swipe, hardware back)
            // so the reverse morph always plays.
            presentation: 'transparentModal',
            animation: 'none',
            headerShown: false,
            gestureEnabled: false,
            contentStyle: { backgroundColor: 'transparent' },
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
    </>
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
    if (__DEV__) console.log(`[AppCheck UI] Initial failure state: ${initialFailed}`);
    setAppCheckFailed(initialFailed);
    const unsubscribe = subscribeAppCheckFailure((failed) => {
      if (__DEV__) console.log(`[AppCheck UI] Failure state changed: ${failed}`);
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
          if (__DEV__)
            console.log('📦 Pending OTA update detected on foreground, reloading app...');
          pendingUpdateRef.current = false;
          try {
            await updates.reloadApp();
            return; // App will reload, no need to continue
          } catch (error) {
            console.error('Failed to reload app for OTA update:', error);
          }
        }

        if (__DEV__) console.log('📱 App entered foreground...');
        Notifications.setBadgeCountAsync(0);
        const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
        // Re-register push (covers timezone/travel changes); best-effort.
        notificationService.registerForPush(getLocaleFromCode(deviceLocale)).catch((error) => {
          console.error('Push re-registration on foreground failed:', error);
        });

        // Show app open ad on foreground (with cooldown)
        showAppOpenAdOnForeground().catch((error) => {
          console.error('Failed to show app open ad on foreground:', error);
        });

        // Check for OTA updates when app enters foreground
        if (__DEV__) console.log('📦 Checking for OTA updates on foreground...');
        updates
          .checkAndDownloadUpdate()
          .then((result) => {
            if (result.updateAvailable && result.downloaded) {
              if (__DEV__)
                console.log('📦 OTA update downloaded, marking as pending for next foreground');
              pendingUpdateRef.current = true;
            }
          })
          .catch((error) => {
            console.error('OTA update check on foreground failed:', error);
          });

        // Refresh the on-demand feed cache so returning users see new facts.
        contentRefresh.triggerFeedRefresh();
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
        if (__DEV__) console.log('📦 Periodic OTA update check...');
        updates
          .checkAndDownloadUpdate()
          .then((result) => {
            if (result.updateAvailable && result.downloaded) {
              if (__DEV__)
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
      pruneAudioCacheIfOverLimit().catch(() => {});

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
        // Locale changed (OS cold-restarted the app). The home feed is fetched
        // on demand from the API by the home screen, so there's nothing to
        // pre-download here — just persist the new locale and gate the splash
        // until the home screen signals it has loaded its feed.
        setLocaleRefreshPending();
        await contentRefresh.saveCurrentLocale(locale);

        // Arm the splash gates, then let the app tree mount under the overlay.
        setHomeRenderPending();
        setInitialOnboardingStatus(isComplete);

        try {
          await initializeAdsForReturningUser();
        } catch (error) {
          console.error('Failed to initialize ads for locale change:', error);
        }

        // The home screen fetches the feed on mount and calls signalFeedLoaded.
        setFeedLoadPending();
        await waitForFeedLoaded();

        signalLocaleRefreshDone();
      } else {
        // No locale change — normal startup. The home screen fetches its feed
        // on mount; the splash overlay holds until it has actually rendered
        // (see setHomeRenderPending / SplashOverlay).
        setHomeRenderPending();
        setInitialOnboardingStatus(isComplete);

        initializeAdsForReturningUser().catch((error) => {
          console.error('Failed to initialize ads for returning user:', error);
        });
      }

      // Wait for IAP to finish (has been running in parallel since Phase 2 start)
      await iapPromise;

      // Clear notification badge on app launch
      Notifications.setBadgeCountAsync(0);

      // Register this device for server-driven push — fire-and-forget.
      notificationService.registerForPush(locale).catch((error) => {
        console.error('Push registration failed:', error);
      });

      // Sync the profile's country flag if the device reading changed — the
      // claim-time capture is otherwise permanent. Fire-and-forget.
      userService.refreshCountryIfStale().catch(() => {});

      // Drain trivia results that didn't reach the leaderboard yet
      // (offline games, prior failures). Fire-and-forget.
      triviaSync.syncTriviaResults().catch(() => {});

      // Check for OTA updates in the background
      updates
        .checkAndDownloadUpdate()
        .then((result) => {
          if (result.updateAvailable && result.downloaded) {
            if (__DEV__)
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

  // The root <View> renders unconditionally (even during loading) for two reasons:
  //  1. expo-updates needs "content appeared" to confirm the OTA launch — without
  //     it, the next cold start rolls back to the embedded bundle.
  //  2. SplashOverlay must mount on first paint so its image starts decoding in
  //     parallel with the heavy initialization work below. On Android (where the
  //     native splash can't crossfade), the JS layer needs to be fully composited
  //     BEFORE SplashScreen.hide() fires, otherwise the native→JS handoff blinks.
  //     Mounting late (only in the success branch) was the cause of the blink.
  // The provider tree mounts under the SplashOverlay once the app is ready, so
  // the user never sees the seam.
  const isAppReady = isDbReady && initialOnboardingStatus !== null && fontsLoaded;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A1628' }} onLayout={onLayoutRootView}>
      {isAppReady && (
        <ErrorBoundary>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            {appCheckFailed && (
              <AppCheckBlockingScreen
                onRetry={handleAppCheckRetry}
                isRetrying={isRetryingAppCheck}
              />
            )}
            <PostHogProvider client={posthog}>
              <PostHogErrorBoundary>
                <I18nProvider>
                  <PersistQueryClientProvider
                    client={queryClient}
                    persistOptions={{
                      persister: asyncStoragePersister,
                      maxAge: persistMaxAge,
                      // Only persist fact/home content — the data we want to
                      // render instantly on cold start. Skip everything else
                      // (stats, etc.) and never persist failed queries.
                      dehydrateOptions: {
                        shouldDehydrateQuery: (query) => {
                          if (query.state.status !== 'success') return false;
                          const root = query.queryKey[0];
                          return root === 'facts' || root === 'home' || root === 'metadata';
                        },
                      },
                    }}
                  >
                    <OnboardingProvider initialComplete={initialOnboardingStatus}>
                      <IAPSafeProvider>
                        <ScrollToTopProvider>
                          <AppThemeProvider>
                            <NavigationThemeWrapper>
                              <ReviewPromptProvider>
                                <BadgeToastProvider>
                                  <AppContent />
                                </BadgeToastProvider>
                              </ReviewPromptProvider>
                            </NavigationThemeWrapper>
                          </AppThemeProvider>
                        </ScrollToTopProvider>
                      </IAPSafeProvider>
                    </OnboardingProvider>
                  </PersistQueryClientProvider>
                </I18nProvider>
              </PostHogErrorBoundary>
            </PostHogProvider>
          </SafeAreaProvider>
        </ErrorBoundary>
      )}
      {showSplashOverlay && (
        <SplashOverlay appReady={isAppReady} onHidden={() => setShowSplashOverlay(false)} />
      )}
    </View>
  );
}
