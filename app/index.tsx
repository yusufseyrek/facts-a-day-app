import React, { useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { styled } from "@tamagui/core";
import { YStack } from "tamagui";
import { Lightbulb } from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
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
  const { theme } = useTheme();
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
        console.log(`Scheduled notifications: ${scheduledCount}. Refreshing...`);

        // Get saved notification time
        const notificationTime = await onboardingService.getNotificationTime();

        if (notificationTime) {
          const result = await notificationService.refreshNotificationSchedule(
            notificationTime,
            locale
          );

          if (result.success) {
            console.log(`Refreshed ${result.count} notifications. Total now: ${scheduledCount + result.count}`);
          } else {
            console.error('Failed to refresh notifications:', result.error);
          }
        }
      } else {
        console.log(`Scheduled notifications: ${scheduledCount}. No refresh needed.`);
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
            {t("onboardingComplete")}{"\n"}
            {t("mainAppPlaceholder")}
          </BodyText>
        </YStack>

        <YStack width="100%" paddingTop="$xl">
          <Button variant="secondary" onPress={handleResetOnboarding}>
            {t("resetOnboarding")}
          </Button>
        </YStack>
      </ContentContainer>
    </Container>
  );
}
