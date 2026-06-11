import { useEffect, useRef } from 'react';
import { Animated, Easing, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Stack, usePathname } from 'expo-router';

import { ProgressIndicator } from '../../src/components';
import { hexColors } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

const TOTAL_STEPS = 3;

/**
 * Step shown in the shared progress bar, per route. Routes not listed (the
 * index redirect and the success celebration) hide the bar. The fact preview
 * is a modal presented over welcome, so it keeps welcome's step.
 */
const STEP_BY_PATH: Record<string, number> = {
  '/onboarding/welcome': 1,
  '/onboarding/fact': 1,
  '/onboarding/questions': 2,
  '/onboarding/notifications': 3,
};

export default function OnboardingLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const { spacing } = useResponsive();

  // Use system color scheme for initial background
  const backgroundColor =
    colorScheme === 'dark' ? hexColors.dark.background : hexColors.light.background;

  // The progress bar lives here, above the Stack, so it stays constant while
  // screens slide underneath it; only the pill fill animates between steps.
  const step = STEP_BY_PATH[pathname];
  const visible = step !== undefined;

  const barOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.timing(barOpacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      barOpacity.setValue(0);
    }
  }, [visible, barOpacity]);

  return (
    <View style={{ flex: 1, backgroundColor }}>
      {visible && (
        <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor }}>
          <Animated.View
            style={{
              opacity: barOpacity,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <ProgressIndicator currentStep={step} totalSteps={TOTAL_STEPS} />
          </Animated.View>
        </SafeAreaView>
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="questions" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="success" />
        <Stack.Screen name="fact" options={{ presentation: 'modal' }} />
      </Stack>
    </View>
  );
}
