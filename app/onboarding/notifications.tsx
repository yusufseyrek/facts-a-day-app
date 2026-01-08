import React, { useState, useEffect, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform, ScrollView, Alert, Animated, Easing } from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { Bell } from "@tamagui/lucide-icons";
import { hexColors, spacing, radius } from "../../src/theme";
import { useResponsive } from "../../src/utils/useResponsive";
import { Text, Button, ProgressIndicator, MultiTimePicker } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import { useOnboarding } from "../../src/contexts";
import * as notificationService from "../../src/services/notifications";
import {
  trackOnboardingNotificationsEnabled,
  trackOnboardingNotificationsSkipped,
  trackScreenView,
  Screens,
} from "../../src/services/analytics";

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
});

const ContentContainer = styled(YStack, {
  padding: spacing.phone.xl,
  gap: spacing.phone.xl,
  flex: 1,
  justifyContent: "space-between",
});

const Header = styled(YStack, {
  gap: spacing.phone.md,
  alignItems: "center",
  paddingVertical: spacing.phone.xxl,
});

const IconContainer = styled(XStack, {
  width: 120,
  height: 120,
  borderRadius: radius.phone.full,
  backgroundColor: "$primaryLight",
  alignItems: "center",
  justifyContent: "center",
});

const TimePickerContainer = styled(YStack, {
  backgroundColor: "$surface",
  padding: spacing.phone.xl,
  borderRadius: radius.phone.lg,
  gap: spacing.phone.md,
  borderWidth: 1,
  borderColor: "$border",
});

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { notificationTimes, setNotificationTimes, isDownloadingFacts, waitForDownloadComplete } = useOnboarding();
  const [isScheduling, setIsScheduling] = useState(false);

  // Responsive sizing - hook handles tablet detection
  const { typography, iconSizes } = useResponsive();

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

      if (status !== "granted") {
        // Permission denied - show friendly message and allow continuing
        Alert.alert(
          t("notificationPermissionSkipped"),
          t("notificationPermissionSkippedMessage"),
          [
            {
              text: t("ok"),
              style: "default",
              onPress: () => proceedWithoutNotifications(),
            },
          ]
        );
        return;
      }

      // Step 2: Permission granted - now start scheduling process
      await scheduleNotificationsAndProceed();
    } catch (error) {
      console.error("Error requesting notification permissions:", error);
      // On error, still allow continuing without notifications
      Alert.alert(
        t("notificationPermissionSkipped"),
        t("notificationPermissionSkippedMessage"),
        [
          {
            text: t("ok"),
            style: "default",
            onPress: () => proceedWithoutNotifications(),
          },
        ]
      );
    }
  };

  const proceedWithoutNotifications = async () => {
    setIsScheduling(true);

    // Track that notifications were skipped
    trackOnboardingNotificationsSkipped();

    try {
      // Wait for facts download to complete if still in progress
      if (isDownloadingFacts) {
        await waitForDownloadComplete();
      }

      // Mark one fact as shown immediately for new users
      console.log('🎯 Calling showImmediateFact with locale:', locale);
      const immediateFactResult = await notificationService.showImmediateFact(locale);
      if (immediateFactResult.success) {
        console.log('✅ Successfully marked immediate fact:', immediateFactResult.fact?.id);
      } else {
        console.error('❌ Failed to mark immediate fact:', immediateFactResult.error);
      }

      // Navigate to success screen without scheduling notifications
      router.push("/onboarding/success");
    } catch (error) {
      console.error("Error proceeding without notifications:", error);
      setIsScheduling(false);
      // Still try to proceed even on error
      router.push("/onboarding/success");
    }
  };

  const scheduleNotificationsAndProceed = async () => {
    setIsScheduling(true);

    try {
      // Wait for facts download to complete if still in progress
      if (isDownloadingFacts) {
        await waitForDownloadComplete();
      }

      // Mark one fact as shown immediately for new users (BEFORE scheduling)
      console.log('🎯 Calling showImmediateFact with locale:', locale);
      const immediateFactResult = await notificationService.showImmediateFact(locale);
      if (immediateFactResult.success) {
        console.log('✅ Successfully marked immediate fact:', immediateFactResult.fact?.id);
      } else {
        console.error('❌ Failed to mark immediate fact:', immediateFactResult.error);
      }

      // Schedule notifications (will exclude the fact marked as shown)
      const result = await notificationService.scheduleNotifications(
        notificationTimes,
        locale
      );

      if (result.success) {
        // Successfully scheduled notifications - navigate to success screen
        console.log(`Scheduled ${result.count} notifications`);

        // Track that notifications were enabled
        trackOnboardingNotificationsEnabled(notificationTimes.length);

        router.push("/onboarding/success");
      } else {
        // Failed to schedule notifications - show error
        setIsScheduling(false);
        Alert.alert(
          t("notificationSchedulingFailed"),
          t("notificationSchedulingFailedMessage"),
          [{ text: t("ok"), style: "default" }]
        );
      }
    } catch (error) {
      console.error("Error in notification flow:", error);
      setIsScheduling(false);
      Alert.alert(
        t("notificationSchedulingFailed"),
        error instanceof Error ? error.message : t("notificationSchedulingFailedMessage"),
        [{ text: t("ok"), style: "default" }]
      );
    }
  };

  // Bell icon shake animation
  const bellRotate = iconRotation.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ["0deg", "-15deg", "0deg", "15deg", "0deg"],
  });

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <ScrollView showsVerticalScrollIndicator={false}>
          <YStack gap={spacing.phone.md} paddingBottom={spacing.phone.xl}>
            <Animated.View
              style={{
                opacity: progressOpacity,
                transform: [{ translateY: progressTranslateY }],
              }}
            >
              <ProgressIndicator currentStep={2} totalSteps={2} />
            </Animated.View>

            <Header>
              <Animated.View
                style={{
                  transform: [
                    { scale: iconScale },
                    { rotate: bellRotate },
                  ],
                }}
              >
                <IconContainer>
                  <Bell size={iconSizes.heroLg} color={hexColors.light.primary} />
                </IconContainer>
              </Animated.View>

              <Animated.View
                style={{
                  opacity: titleOpacity,
                  transform: [{ translateY: titleTranslateY }],
                }}
              >
                <YStack gap={spacing.phone.sm} alignItems="center">
                  <Text.Headline textAlign="center">{t("stayInformed")}</Text.Headline>
                  <Text.Body textAlign="center" color="$textSecondary">
                    {t("notificationRequired")}
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
              <TimePickerContainer>
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
          <Button
            onPress={handleEnableNotifications}
            loading={isScheduling}
            disabled={isScheduling}
          >
            {isScheduling ? t("gettingAppReady") : t("enableNotifications")}
          </Button>
        </Animated.View>
      </ContentContainer>
    </Container>
  );
}
