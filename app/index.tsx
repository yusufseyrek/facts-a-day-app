import React, { useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform, Alert } from "react-native";
import { styled } from "@tamagui/core";
import { YStack } from "tamagui";
import { Lightbulb } from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { tokens } from "../src/theme/tokens";
import { H1, BodyText, Button } from "../src/components";
import { useTheme } from "../src/theme";
import { useTranslation } from "../src/i18n";
import * as onboardingService from "../src/services/onboarding";
import * as notificationService from "../src/services/notifications";
import * as database from "../src/services/database";

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
});

const ContentContainer = styled(YStack, {
  padding: tokens.space.xl,
  gap: tokens.space.xl,
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
});

const IconContainer = styled(YStack, {
  width: 120,
  height: 120,
  borderRadius: tokens.radius.full,
  backgroundColor: "$primaryLight",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: tokens.space.xl,
});

export default function MainApp() {
  const { theme, toggleTheme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();

  // Refresh notifications on app launch if count < 64
  useEffect(() => {
    refreshNotificationsIfNeeded();
  }, []);

  const refreshNotificationsIfNeeded = async () => {
    try {
      // Get scheduled notifications count
      const scheduledCount = await database.getScheduledFactsCount(locale);

      // Only refresh if below 64
      if (scheduledCount < 64) {
        console.log(
          `Scheduled notifications: ${scheduledCount}. Refreshing...`
        );

        // Get saved notification time
        const notificationTime = await onboardingService.getNotificationTime();

        if (notificationTime) {
          const result = await notificationService.refreshNotificationSchedule(
            notificationTime,
            locale
          );

          if (result.success) {
            console.log(
              `Refreshed ${result.count} notifications. Total now: ${
                scheduledCount + result.count
              }`
            );
          } else {
            console.error("Failed to refresh notifications:", result.error);
          }
        }
      } else {
        console.log(
          `Scheduled notifications: ${scheduledCount}. No refresh needed.`
        );
      }
    } catch (error) {
      console.error("Error checking/refreshing notifications:", error);
    }
  };

  const handleResetOnboarding = async () => {
    try {
      // Reset onboarding status
      await onboardingService.resetOnboarding();

      // Navigate to onboarding
      // The layout will re-check onboarding status and handle the flow
      router.replace("/onboarding");
    } catch (error) {
      console.error("Error resetting onboarding:", error);
    }
  };

  const handleTestNotification = async () => {
    try {
      console.log("🔔 Starting test notification...");

      // Request permissions first
      const { status } = await Notifications.getPermissionsAsync();
      console.log("📱 Permission status:", status);

      if (status !== "granted") {
        Alert.alert(
          "Notification Permission Required",
          "Please enable notifications in settings to test this feature.",
          [{ text: "OK", style: "default" }]
        );
        return;
      }

      // Get a random fact from the database
      const facts = await database.getRandomUnscheduledFacts(1, locale);
      console.log("📚 Facts found:", facts.length);

      if (facts.length === 0) {
        Alert.alert(
          "No Facts Available",
          "There are no facts available to test notifications.",
          [{ text: "OK", style: "default" }]
        );
        return;
      }

      const fact = facts[0];
      console.log(
        "✅ Using fact:",
        fact.id,
        "-",
        fact.content.substring(0, 50) + "..."
      );

      // Schedule notification for 2 seconds from now
      // Using exact same format as regular scheduled notifications
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: fact.title || "Today's Fact",
          body: fact.summary || fact.content.substring(0, 100),
          data: { factId: fact.id, isTest: true },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 2,
          repeats: false,
        },
      });

      console.log("✅ Notification scheduled with ID:", notificationId);

      Alert.alert(
        "Test Notification Scheduled",
        "You should receive a test notification in 2 seconds! If the app is in the foreground, it should appear as a banner at the top.",
        [{ text: "OK", style: "default" }]
      );
    } catch (error) {
      console.error("❌ Error scheduling test notification:", error);
      Alert.alert(
        "Error",
        `Failed to schedule test notification: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        [{ text: "OK", style: "default" }]
      );
    }
  };

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <IconContainer>
          <Lightbulb size={60} color={tokens.color.light.primary} />
        </IconContainer>

        <YStack gap="$md" alignItems="center" width="100%">
          <H1 textAlign="center">{t("welcomeToApp")}</H1>
          <BodyText textAlign="center" color="$textSecondary">
            {t("onboardingComplete")}
            {"\n"}
            {t("mainAppPlaceholder")}
          </BodyText>
        </YStack>

        <YStack width="100%" paddingTop="$xl" gap="$md">
          <Button onPress={handleTestNotification}>Test Notification</Button>

          <Button variant="secondary" onPress={toggleTheme}>
            {`Toggle Theme (Current: ${theme})`}
          </Button>

          <Button variant="secondary" onPress={handleResetOnboarding}>
            {t("resetOnboarding")}
          </Button>
        </YStack>
      </ContentContainer>
    </Container>
  );
}
