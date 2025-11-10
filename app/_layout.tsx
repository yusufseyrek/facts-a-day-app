import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppThemeProvider } from '../src/theme';
import { I18nProvider } from '../src/i18n';
import { OnboardingProvider } from '../src/contexts';
import * as onboardingService from '../src/services/onboarding';
import * as notificationService from '../src/services/notifications';
import { ActivityIndicator, View } from 'react-native';

export default function RootLayout() {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Configure notifications on app start
    notificationService.configureNotifications();
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    const complete = await onboardingService.isOnboardingComplete();
    setIsOnboardingComplete(complete);
  };

  // Re-check onboarding status when navigating to root or onboarding paths
  // This ensures the reset onboarding button works correctly
  useEffect(() => {
    const currentPath = segments[0];
    if (currentPath === undefined || currentPath === 'onboarding') {
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

  const screenOptions = {
    headerShown: false as const,
  };

  // Show loading while checking onboarding status
  if (isOnboardingComplete === null) {
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
