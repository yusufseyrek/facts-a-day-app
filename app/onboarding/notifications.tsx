import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, ScrollView } from 'react-native';

import { styled } from '@tamagui/core';
import { Bell } from '@tamagui/lucide-icons';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import { Button, MultiTimePicker, ProgressIndicator, ScreenContainer, Text } from '../../src/components';
import { LAYOUT } from '../../src/config/app';
import { useOnboarding } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackOnboardingNotificationsEnabled,
  trackOnboardingNotificationsSkipped,
  trackScreenView,
} from '../../src/services/analytics';
import * as notificationService from '../../src/services/notifications';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

const ContentContainer = styled(YStack, {
  flex: 1,
  justifyContent: 'space-between',
});

const Header = styled(YStack, {
  alignItems: 'center',
});

const IconContainer = styled(XStack, {
  borderRadius: 9999,
  backgroundColor: '$primaryLight',
  alignItems: 'center',
  justifyContent: 'center',
});

const TimePickerContainer = styled(YStack, {
  backgroundColor: '$surface',
  borderWidth: 1,
  borderColor: '$border',
});

const SECONDARY_HITSLOP = { top: 12, bottom: 12, left: 24, right: 24 };

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { notificationTimes, setNotificationTimes } = useOnboarding();
  const [isScheduling, setIsScheduling] = useState(false);

  // Responsive sizing - hook handles tablet detection
  const { iconSizes, spacing, radius } = useResponsive();

  // Enter animations
  const progressOpacity = useRef(new Animated.Value(0)).current;
  const progressTranslateY = useRef(new Animated.Value(-20)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const iconRotation = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const pickerOpacity = useRef(new Animated.Value(0)).current;
  const pickerTranslateY = useRef(new Animated.Value(30)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonTranslateY = useRef(new Animated.Value(30)).current;

  // Track screen view on mount and run enter animations
  useEffect(() => {
    trackScreenView(Screens.ONBOARDING_NOTIFICATIONS);

    // Start enter animations - run in parallel with staggered delays
    // Progress indicator (immediate)
    Animated.parallel([
      Animated.timing(progressOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progressTranslateY, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Icon with bounce (slight delay)
    Animated.parallel([
      Animated.spring(iconScale, {
        toValue: 1,
        tension: 80,
        friction: 6,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(iconRotation, {
        toValue: 1,
        duration: 250,
        delay: 200,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
    ]).start();

    // Title and subtitle (overlapping with icon)
    Animated.parallel([
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 200,
        delay: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(titleTranslateY, {
        toValue: 0,
        duration: 200,
        delay: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Time picker (overlapping with title)
    Animated.parallel([
      Animated.timing(pickerOpacity, {
        toValue: 1,
        duration: 250,
        delay: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(pickerTranslateY, {
        toValue: 0,
        tension: 80,
        friction: 8,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Button animation
    Animated.parallel([
      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 200,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(buttonTranslateY, {
        toValue: 0,
        duration: 200,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleEnableNotifications = async () => {
    try {
      // Step 1: Request notification permissions IMMEDIATELY (don't wait for download)
      const { status } = await Notifications.requestPermissionsAsync();

      if (status !== 'granted') {
        // Permission denied - proceed without notifications
        proceedWithoutNotifications();
        return;
      }

      // Step 2: Permission granted - schedule notifications (DB-only, OS sync on success screen)
      await scheduleNotificationsAndProceed();
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      // On error, still allow continuing without notifications
      proceedWithoutNotifications();
    }
  };

  const proceedWithoutNotifications = () => {
    trackOnboardingNotificationsSkipped();
    router.push('/onboarding/success');
  };

  const scheduleNotificationsAndProceed = async () => {
    setIsScheduling(true);

    try {
      // Schedule notifications (DB-only, OS sync happens on success screen)
      const result = await notificationService.ensureNotificationSchedule(locale, 'unknown', {
        forceReschedule: true,
        skipToday: true,
        skipOsSync: true,
      });

      if (result.success) {
        if (__DEV__) console.log(`Scheduled ${result.count} notifications`);
        trackOnboardingNotificationsEnabled(notificationTimes.length);
        router.push('/onboarding/success');
      } else {
        setIsScheduling(false);
        Alert.alert(t('notificationSchedulingFailed'), t('notificationSchedulingFailedMessage'), [
          { text: t('ok'), style: 'default' },
        ]);
      }
    } catch (error) {
      console.error('Error in notification flow:', error);
      setIsScheduling(false);
      Alert.alert(
        t('notificationSchedulingFailed'),
        error instanceof Error ? error.message : t('notificationSchedulingFailedMessage'),
        [{ text: t('ok'), style: 'default' }]
      );
    }
  };

  // Bell icon shake animation
  const bellRotate = iconRotation.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '-15deg', '0deg', '15deg', '0deg'],
  });

  return (
    <ScreenContainer>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <ContentContainer paddingHorizontal={spacing.lg} paddingTop={spacing.lg} paddingBottom={spacing.sm} gap={spacing.md}>
        <Animated.View
          style={{
            opacity: progressOpacity,
            transform: [{ translateY: progressTranslateY }],
          }}
        >
          <ProgressIndicator currentStep={3} totalSteps={3} />
        </Animated.View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        >
          <YStack
            gap={spacing.md}
            paddingBottom={spacing.xl}
            width="100%"
            maxWidth={LAYOUT.TABLET_BREAKPOINT}
            alignSelf="center"
          >
            <Header gap={spacing.md} paddingVertical={spacing.xxl}>
              <Animated.View
                style={{
                  transform: [{ scale: iconScale }, { rotate: bellRotate }],
                }}
              >
                <IconContainer
                  width={iconSizes.hero + spacing.xl}
                  height={iconSizes.hero + spacing.xl}
                >
                  <Bell size={iconSizes.hero} color={hexColors.light.primary} />
                </IconContainer>
              </Animated.View>

              <Animated.View
                style={{
                  opacity: titleOpacity,
                  transform: [{ translateY: titleTranslateY }],
                }}
              >
                <YStack gap={spacing.sm} alignItems="center">
                  <Text.Headline textAlign="center">{t('stayInformed')}</Text.Headline>
                  <Text.Body textAlign="center" color="$textSecondary">
                    {t('notificationRequired')}
                  </Text.Body>
                </YStack>
              </Animated.View>
            </Header>

            {/* Multi-Time Picker */}
            <Animated.View
              style={{
                opacity: pickerOpacity,
                transform: [{ translateY: pickerTranslateY }],
              }}
            >
              <TimePickerContainer padding={spacing.xl} borderRadius={radius.lg} gap={spacing.md}>
                <MultiTimePicker
                  times={notificationTimes}
                  onTimesChange={setNotificationTimes}
                  maxTimes={3}
                  minTimes={1}
                />
              </TimePickerContainer>
            </Animated.View>
          </YStack>
        </ScrollView>

        <Animated.View
          style={{
            opacity: buttonOpacity,
            transform: [{ translateY: buttonTranslateY }],
          }}
        >
          <YStack gap={spacing.md} alignItems="center">
            <Button onPress={handleEnableNotifications}>{t('enableNotifications')}</Button>
            <Pressable
              disabled={isScheduling}
              onPress={proceedWithoutNotifications}
              hitSlop={SECONDARY_HITSLOP}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text.Caption color="$textSecondary">{t('maybeLater')}</Text.Caption>
            </Pressable>
          </YStack>
        </Animated.View>
      </ContentContainer>
    </ScreenContainer>
  );
}
