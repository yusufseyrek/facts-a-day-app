import React, { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Alert, ScrollView, Linking } from "react-native";
import { styled } from "@tamagui/core";
import { YStack, Text } from "tamagui";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import {
  Globe,
  Palette,
  Grid,
  Signal,
  Bell,
  Plus,
  TestTube,
  Contrast,
  RotateCcw,
  FileText,
  Shield,
} from "@tamagui/lucide-icons";
import { tokens } from "../../src/theme/tokens";
import { H1, H2 } from "../../src/components";
import { SettingsRow } from "../../src/components/SettingsRow";
import { LanguagePickerModal } from "../../src/components/settings/LanguagePickerModal";
import { ThemePickerModal } from "../../src/components/settings/ThemePickerModal";
import { TimePickerModal } from "../../src/components/settings/TimePickerModal";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import { TranslationKeys } from "../../src/i18n/translations";
import * as onboardingService from "../../src/services/onboarding";
import * as database from "../../src/services/database";
import { buildNotificationContent } from "../../src/services/notifications";
import { useOnboarding } from "../../src/contexts";
import { showSettingsInterstitial } from "../../src/services/adManager";
import { Sentry } from "../../src/config/sentry";

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: "$background",
  edges: ["top"],
});

const ContentContainer = styled(YStack, {
  paddingHorizontal: tokens.space.xl,
  paddingTop: tokens.space.md,
  gap: tokens.space.lg,
  flex: 1,
});

const SectionContainer = styled(YStack, {
  gap: tokens.space.md,
  marginBottom: tokens.space.xl,
});

const SectionTitle = styled(H2, {
  marginBottom: tokens.space.sm,
});

const SettingsGroup = styled(YStack, {
  gap: tokens.space.md,
});

const VersionText = styled(Text, {
  textAlign: "center",
  fontSize: tokens.fontSize.small,
  marginBottom: tokens.space.xl,
  opacity: 0.6,
});

// Helper to get language display name
const getLanguageName = (code: string): string => {
  const languages: Record<string, string> = {
    de: "Deutsch",
    en: "English",
    es: "Español",
    fr: "Français",
    ja: "日本語",
    ko: "한국어",
    tr: "Türkçe",
    zh: "中文",
  };
  return languages[code] || code;
};

// Helper to get theme display name
const getThemeName = (
  mode: string,
  t: (key: TranslationKeys) => string
): string => {
  const themeNames: Record<string, string> = {
    light: t("settingsThemeLight"),
    dark: t("settingsThemeDark"),
    system: t("settingsThemeSystem"),
  };
  return themeNames[mode] || mode;
};

export default function SettingsPage() {
  const { theme, themeMode, toggleTheme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { resetOnboarding } = useOnboarding();

  // Check if running in development mode
  const isDevelopment = __DEV__;

  // Use white icons in dark mode for better contrast
  const iconColor = theme === "dark" ? "#FFFFFF" : tokens.color[theme].text;

  // Modal visibility state
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);

  // Preferences state
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [notificationTimes, setNotificationTimes] = useState<Date[]>([
    new Date(),
  ]);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const categories = await onboardingService.getSelectedCategories();
      const times = await onboardingService.getNotificationTimes();

      setSelectedCategories(categories);
      if (times && times.length > 0) {
        setNotificationTimes(times.map((t) => new Date(t)));
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
    }
  };

  const handleCategoriesPress = async () => {
    await showSettingsInterstitial();
    router.push("/settings/categories");
  };

  const handleLanguagePress = async () => {
    await showSettingsInterstitial();
    setShowLanguageModal(true);
  };

  const handleTimePress = async () => {
    await showSettingsInterstitial();
    setShowTimeModal(true);
  };

  const handleResetOnboarding = async () => {
    try {
      await resetOnboarding();
      router.replace("/onboarding");
    } catch (error) {
      console.error("Error resetting onboarding:", error);
    }
  };

  const handleTestNotification = async () => {
    try {
      console.log("🔔 Starting test notification...");

      const { status } = await Notifications.getPermissionsAsync();
      console.log("📱 Permission status:", status);

      if (status !== "granted") {
        Alert.alert(
          t("notificationPermissionRequired"),
          t("notificationPermissionMessage"),
          [{ text: t("ok"), style: "default" }]
        );
        return;
      }

      const facts = await database.getRandomUnscheduledFacts(1, locale);
      console.log("📚 Facts found:", facts.length);

      if (facts.length === 0) {
        Alert.alert(t("noFactAvailable"), t("noFactsAvailableForTest"), [
          { text: t("ok"), style: "default" },
        ]);
        return;
      }

      const fact = facts[0];
      console.log(
        "✅ Using fact:",
        fact.id,
        "-",
        fact.content.substring(0, 50) + "..."
      );

      const content = buildNotificationContent(fact);
      // Add isTest flag to data
      content.data = { ...content.data, isTest: true };

      const notificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 2,
          repeats: false,
        },
      });

      console.log("✅ Notification scheduled with ID:", notificationId);

      Alert.alert(
        t("testNotificationScheduled"),
        t("testNotificationIn2Seconds"),
        [{ text: t("ok"), style: "default" }]
      );
    } catch (error) {
      console.error("❌ Error scheduling test notification:", error);
      Alert.alert(
        t("error"),
        `${t("failedToScheduleTestNotification")}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        [{ text: t("ok"), style: "default" }]
      );
    }
  };

  const handlePrivacyPolicyPress = async () => {
    try {
      const url = "https://factsaday.com/privacy";
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(t("error"), t("cannotOpenUrl"), [
          { text: t("ok"), style: "default" },
        ]);
      }
    } catch (error) {
      console.error("Error opening privacy policy:", error);
      Alert.alert(t("error"), t("cannotOpenUrl"), [
        { text: t("ok"), style: "default" },
      ]);
    }
  };

  const handleTermsOfServicePress = async () => {
    try {
      const url = "https://factsaday.com/terms";
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(t("error"), t("cannotOpenUrl"), [
          { text: t("ok"), style: "default" },
        ]);
      }
    } catch (error) {
      console.error("Error opening terms of service:", error);
      Alert.alert(t("error"), t("cannotOpenUrl"), [
        { text: t("ok"), style: "default" },
      ]);
    }
  };

  const handleAdd10RandomFacts = async () => {
    try {
      console.log("📚 Adding 10 random facts with past dates for feed testing...");

      // Get 10 random unscheduled facts
      const facts = await database.getRandomUnscheduledFacts(10, locale);
      console.log("📚 Unscheduled facts found:", facts.length);

      if (facts.length === 0) {
        Alert.alert(t("noFactAvailable"), t("noFactsAvailable"), [
          { text: t("ok"), style: "default" },
        ]);
        return;
      }

      console.log(`📚 Adding ${facts.length} facts with random past dates...`);

      const now = new Date();

      // Add facts with random past dates (spread across last 10 days)
      for (let i = 0; i < facts.length; i++) {
        const fact = facts[i];

        // Generate a random date in the past (0-9 days ago)
        const daysAgo = i; // Each fact gets a different day for variety
        const scheduledDate = new Date(now);
        scheduledDate.setDate(scheduledDate.getDate() - daysAgo);
        // Randomize the hour a bit
        scheduledDate.setHours(9 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);

        const notificationId = `test_${fact.id}_${Date.now()}_${i}`;

        await database.markFactAsScheduled(
          fact.id,
          scheduledDate.toISOString(),
          notificationId
        );

        console.log(`✅ Added fact ${fact.id} with date ${scheduledDate.toISOString().split('T')[0]}`);
      }

      // Show success message
      const message = t("factsAddedDescription").replace(
        "{count}",
        facts.length.toString()
      );
      Alert.alert(t("factsAdded"), message, [
        { text: t("ok"), style: "default" },
      ]);
    } catch (error) {
      console.error("❌ Error adding facts:", error);
      Alert.alert(
        t("errorAddingFacts"),
        error instanceof Error ? error.message : "Unknown error",
        [{ text: t("ok"), style: "default" }]
      );
    }
  };

  return (
    <Container>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <ContentContainer>
          {/* Header */}
          <H1>{t("settings")}</H1>

          {/* User Preferences Section */}
          <SectionContainer>
            <SectionTitle>{t("settingsUserPreferences")}</SectionTitle>

            <SettingsGroup>
              <SettingsRow
                label={t("settingsLanguage")}
                value={getLanguageName(locale)}
                icon={<Globe size={20} color={iconColor} />}
                onPress={handleLanguagePress}
              />

              <SettingsRow
                label={t("settingsThemeTitle")}
                value={getThemeName(themeMode, t)}
                icon={<Palette size={20} color={iconColor} />}
                onPress={() => setShowThemeModal(true)}
              />

              <SettingsRow
                label={t("settingsCategories")}
                value={`${selectedCategories.length} ${t("settingsSelected")}`}
                icon={<Grid size={20} color={iconColor} />}
                onPress={handleCategoriesPress}
              />

              <SettingsRow
                label={t("settingsNotificationTime")}
                value={
                  notificationTimes.length === 1
                    ? notificationTimes[0].toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : t("settingsNotificationTimesCount").replace(
                        "{count}",
                        notificationTimes.length.toString()
                      )
                }
                icon={<Bell size={20} color={iconColor} />}
                onPress={handleTimePress}
              />
            </SettingsGroup>
          </SectionContainer>

          {/* Developer Settings Section - Only visible in development */}
          {isDevelopment && (
            <SectionContainer>
              <SectionTitle>{t("developerSettings")}</SectionTitle>

              <SettingsGroup>
                <SettingsRow
                  label={t("add10RandomFacts")}
                  icon={<Plus size={20} color={iconColor} />}
                  onPress={handleAdd10RandomFacts}
                />

                <SettingsRow
                  label={t("testNotification")}
                  icon={<TestTube size={20} color={iconColor} />}
                  onPress={handleTestNotification}
                />

                <SettingsRow
                  label={t("toggleTheme")}
                  value={theme}
                  icon={<Contrast size={20} color={iconColor} />}
                  onPress={toggleTheme}
                />

                <SettingsRow
                  label={t("resetOnboarding")}
                  icon={<RotateCcw size={20} color={iconColor} />}
                  onPress={handleResetOnboarding}
                />
                <SettingsRow
                  label={"Trigger Sentry Error"}
                  onPress={() => {
                    Sentry.captureException(new Error("First error"));
                  }}
                />
              </SettingsGroup>
            </SectionContainer>
          )}

          {/* Legal Section */}
          <SectionContainer>
            <SectionTitle>{t("settingsLegal")}</SectionTitle>

            <SettingsGroup>
              <SettingsRow
                label={t("settingsPrivacyPolicy")}
                icon={<Shield size={20} color={iconColor} />}
                onPress={handlePrivacyPolicyPress}
              />

              <SettingsRow
                label={t("settingsTermsOfService")}
                icon={<FileText size={20} color={iconColor} />}
                onPress={handleTermsOfServicePress}
              />
            </SettingsGroup>
          </SectionContainer>

          {/* App Version */}
          <VersionText color={iconColor}>
            Version {Constants.expoConfig?.version || "1.0.0"}
          </VersionText>
        </ContentContainer>
      </ScrollView>

      {/* Modals */}
      <LanguagePickerModal
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
      />

      <ThemePickerModal
        visible={showThemeModal}
        onClose={() => setShowThemeModal(false)}
      />

      <TimePickerModal
        visible={showTimeModal}
        onClose={async () => {
          setShowTimeModal(false);
          // Reload preferences after modal closes to get updated times
          // Adding a small delay to ensure AsyncStorage write completes
          setTimeout(() => {
            loadPreferences();
          }, 100);
        }}
        currentTime={notificationTimes[0]}
        onTimeChange={() => {
          // No-op: We'll reload preferences when modal closes instead
          // This prevents conflicting state updates
        }}
      />
    </Container>
  );
}
