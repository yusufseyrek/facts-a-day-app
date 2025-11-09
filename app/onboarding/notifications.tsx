import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform, ScrollView, Alert } from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Bell } from "@tamagui/lucide-icons";
import { tokens } from "../../src/theme/tokens";
import { H1, BodyText, Button, ProgressIndicator } from "../../src/components";
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
  padding: tokens.space.lg,
  borderRadius: tokens.radius.md,
  gap: tokens.space.md,
  borderWidth: 1,
  borderColor: "$border",
  overflow: "hidden",
});

const IOSPickerWrapper = styled(YStack, {
  borderRadius: tokens.radius.md,
  overflow: "hidden",
});

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { notificationTime, setNotificationTime, isDownloadingFacts, waitForDownloadComplete } = useOnboarding();
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    // On Android, hide the picker when user confirms or cancels
    if (Platform.OS === "android") {
      setShowAndroidPicker(false);
    }

    // Only update time if user confirmed (not cancelled)
    if (event.type === "set" && selectedDate) {
      setNotificationTime(selectedDate);
    }
  };

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

        // Step 4: Schedule notifications
        const result = await notificationService.scheduleInitialNotifications(
          notificationTime,
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
            <ProgressIndicator currentStep={4} totalSteps={4} />

            <Header>
              <IconContainer>
                <Bell size={60} color={tokens.color.light.primary} />
              </IconContainer>

              <YStack gap="$sm" alignItems="center">
                <H1 textAlign="center">{t("stayInformed")}</H1>
                <BodyText textAlign="center" color="$textSecondary">
                  {t("notificationRequired")}
                </BodyText>
              </YStack>
            </Header>

            {/* Time Picker */}
            <TimePickerContainer>
              <BodyText
                fontWeight={tokens.fontWeight.semibold}
                textAlign="center"
              >
                {t("selectNotificationTime")}
              </BodyText>

              {Platform.OS === "ios" ? (
                <IOSPickerWrapper>
                  <DateTimePicker
                    value={notificationTime}
                    mode="time"
                    is24Hour={false}
                    display="spinner"
                    onChange={handleTimeChange}
                    style={{ width: "100%" }}
                    textColor={theme === "dark" ? "#FFFFFF" : "#1A1D2E"}
                    themeVariant={theme}
                  />
                </IOSPickerWrapper>
              ) : (
                <>
                  <Button onPress={() => setShowAndroidPicker(true)}>
                    {notificationTime.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </Button>
                  {showAndroidPicker && (
                    <DateTimePicker
                      value={notificationTime}
                      mode="time"
                      is24Hour={false}
                      display="default"
                      onChange={handleTimeChange}
                    />
                  )}
                </>
              )}

              <BodyText
                fontSize={tokens.fontSize.small}
                color="$textSecondary"
                textAlign="center"
                lineHeight={18}
              >
                {t("oneNotificationPerDay")}
              </BodyText>
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
