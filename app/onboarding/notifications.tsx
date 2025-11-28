import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform, ScrollView, Alert, useWindowDimensions } from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { Bell } from "@tamagui/lucide-icons";
import { tokens } from "../../src/theme/tokens";
import { H1, BodyText, Button, ProgressIndicator, MultiTimePicker } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import { useOnboarding } from "../../src/contexts";
import * as notificationService from "../../src/services/notifications";

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
});

const ContentContainer = styled(YStack, {
  padding: tokens.space.xl,
  gap: tokens.space.xl,
  flex: 1,
  justifyContent: "space-between",
});

const Header = styled(YStack, {
  gap: tokens.space.md,
  alignItems: "center",
  paddingVertical: tokens.space.xxl,
});

const IconContainer = styled(XStack, {
  width: 120,
  height: 120,
  borderRadius: tokens.radius.full,
  backgroundColor: "$primaryLight",
  alignItems: "center",
  justifyContent: "center",
});

const TimePickerContainer = styled(YStack, {
  backgroundColor: "$surface",
  padding: tokens.space.xl,
  borderRadius: tokens.radius.lg,
  gap: tokens.space.md,
  borderWidth: 1,
  borderColor: "$border",
});

// Tablet breakpoint (iPad mini is 768px wide)
const TABLET_BREAKPOINT = 768;

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { notificationTimes, setNotificationTimes, isDownloadingFacts, waitForDownloadComplete } = useOnboarding();
  const [isScheduling, setIsScheduling] = useState(false);
  const { width } = useWindowDimensions();

  // Responsive sizing for tablets
  const isTablet = width >= TABLET_BREAKPOINT;
  const secondaryFontSize = isTablet ? tokens.fontSize.bodyTablet : tokens.fontSize.body;

  const handleEnableNotifications = async () => {
    try {
      // Step 1: Request notification permissions IMMEDIATELY (don't wait for download)
      const { status } = await Notifications.requestPermissionsAsync();

      if (status !== "granted") {
        // Permission denied - show alert
        Alert.alert(
          t("notificationPermissionRequired"),
          t("notificationPermissionMessage"),
          [{ text: t("ok"), style: "default" }]
        );
        return;
      }

      // Step 2: Permission granted - now start scheduling process
      setIsScheduling(true);

      try {
        // Step 3: Wait for facts download to complete if still in progress
        if (isDownloadingFacts) {
          await waitForDownloadComplete();
        }

        // Step 4: Mark one fact as shown immediately for new users (BEFORE scheduling)
        console.log('🎯 Calling showImmediateFact with locale:', locale);
        const immediateFactResult = await notificationService.showImmediateFact(locale);
        if (immediateFactResult.success) {
          console.log('✅ Successfully marked immediate fact:', immediateFactResult.fact?.id);
        } else {
          console.error('❌ Failed to mark immediate fact:', immediateFactResult.error);
        }

        // Step 5: Schedule notifications (will exclude the fact marked as shown)
        // Use multiple times if more than 1, otherwise use single time for backward compatibility
        const result = notificationTimes.length > 1
          ? await notificationService.rescheduleNotificationsMultiple(
              notificationTimes,
              locale
            )
          : await notificationService.scheduleInitialNotifications(
              notificationTimes[0],
              locale
            );

        if (result.success) {
          // Successfully scheduled notifications - navigate to success screen
          console.log(`Scheduled ${result.count} notifications`);

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
    } catch (error) {
      console.error("Error requesting notification permissions:", error);
      Alert.alert(
        t("notificationPermissionRequired"),
        t("notificationPermissionMessage"),
        [{ text: t("ok"), style: "default" }]
      );
    }
  };

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ContentContainer>
        <ScrollView showsVerticalScrollIndicator={false}>
          <YStack gap="$md" paddingBottom="$xl">
            <ProgressIndicator currentStep={3} totalSteps={3} />

            <Header>
              <IconContainer>
                <Bell size={60} color={tokens.color.light.primary} />
              </IconContainer>

              <YStack gap="$sm" alignItems="center">
                <H1 textAlign="center">{t("stayInformed")}</H1>
                <BodyText textAlign="center" color="$textSecondary" fontSize={secondaryFontSize}>
                  {t("notificationRequired")}
                </BodyText>
              </YStack>
            </Header>

            {/* Multi-Time Picker */}
            <TimePickerContainer>
              <MultiTimePicker
                times={notificationTimes}
                onTimesChange={setNotificationTimes}
                maxTimes={3}
                minTimes={1}
              />
            </TimePickerContainer>
          </YStack>
        </ScrollView>

        <Button
          onPress={handleEnableNotifications}
          loading={isScheduling}
          disabled={isScheduling}
        >
          {isScheduling ? t("gettingAppReady") : t("enableNotifications")}
        </Button>
      </ContentContainer>
    </Container>
  );
}
