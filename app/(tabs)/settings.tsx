import React, { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Alert, ScrollView } from "react-native";
import { styled } from "@tamagui/core";
import { YStack } from "tamagui";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
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
} from "@tamagui/lucide-icons";
import { tokens } from "../../src/theme/tokens";
import { H1, H2 } from "../../src/components";
import { SettingsRow } from "../../src/components/SettingsRow";
import { LanguagePickerModal } from "../../src/components/settings/LanguagePickerModal";
import { ThemePickerModal } from "../../src/components/settings/ThemePickerModal";
import { DifficultyPickerModal } from "../../src/components/settings/DifficultyPickerModal";
import { TimePickerModal } from "../../src/components/settings/TimePickerModal";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import { TranslationKeys } from "../../src/i18n/translations";
import * as onboardingService from "../../src/services/onboarding";
import * as database from "../../src/services/database";

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

// Helper to get difficulty display name
const getDifficultyName = (
  difficulty: string,
  t: (key: TranslationKeys) => string
): string => {
  const difficultyNames: Record<string, string> = {
    beginner: t("easyDifficulty"),
    intermediate: t("mediumDifficulty"),
    advanced: t("hardDifficulty"),
    all: t("allDifficulties"),
  };
  return difficultyNames[difficulty] || difficulty;
};

export default function SettingsPage() {
  const { theme, themeMode, toggleTheme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();

  // Check if running in development mode
  const isDevelopment = __DEV__;

  // Use white icons in dark mode for better contrast
  const iconColor = theme === 'dark' ? '#FFFFFF' : tokens.color[theme].text;

  // Modal visibility state
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);

  // Preferences state
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<string>("all");
  const [notificationTime, setNotificationTime] = useState<Date>(new Date());

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const categories = await onboardingService.getSelectedCategories();
      const diff = await onboardingService.getDifficultyPreference();
      const time = await onboardingService.getNotificationTime();

      setSelectedCategories(categories);
      setDifficulty(diff);
      if (time) {
        setNotificationTime(new Date(time));
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
    }
  };

  const handleCategoriesPress = () => {
    router.push("/settings/categories");
  };

  const handleResetOnboarding = async () => {
    try {
      await onboardingService.resetOnboarding();
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
        Alert.alert(
          t("noFactAvailable"),
          "There are no facts available to test notifications.",
          [{ text: t("ok"), style: "default" }]
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

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: fact.title || t("todaysFact"),
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
        "You should receive a test notification in 2 seconds!",
        [{ text: t("ok"), style: "default" }]
      );
    } catch (error) {
      console.error("❌ Error scheduling test notification:", error);
      Alert.alert(
        "Error",
        `Failed to schedule test notification: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        [{ text: t("ok"), style: "default" }]
      );
    }
  };

  const handleAdd10RandomFacts = async () => {
    try {
      console.log("📚 Starting to send 10 random fact notifications...");

      // Check notification permissions
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t("notificationPermissionRequired"),
          t("notificationPermissionMessage"),
          [{ text: t("ok"), style: "default" }]
        );
        return;
      }

      // Get 10 random facts
      const facts = await database.getAllFacts(locale);
      console.log("📚 Total facts found:", facts.length);

      if (facts.length === 0) {
        Alert.alert(t("noFactAvailable"), "There are no facts available.", [
          { text: t("ok"), style: "default" },
        ]);
        return;
      }

      // Select up to 10 random facts
      const shuffled = facts.sort(() => 0.5 - Math.random());
      const selectedFacts = shuffled.slice(0, Math.min(10, facts.length));

      console.log(`📚 Scheduling ${selectedFacts.length} notifications...`);

      const now = new Date();

      // Schedule all 10 notifications immediately (staggered by 2 seconds each)
      // AND mark them as scheduled in the database so they appear in the home feed
      for (let i = 0; i < selectedFacts.length; i++) {
        const fact = selectedFacts[i];

        // Schedule notification
        await Notifications.scheduleNotificationAsync({
          content: {
            title: fact.title || t("didYouKnow"),
            body: fact.summary || fact.content.substring(0, 100),
            data: { factId: fact.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 2 + i * 2, // Stagger by 2 seconds each
            repeats: false,
          },
        });

        // Mark fact as scheduled with today's date so it appears in home feed
        const scheduledDate = new Date(now);
        scheduledDate.setHours(
          now.getHours(),
          now.getMinutes(),
          now.getSeconds() + (2 + i * 2),
          0
        );
        const notificationId = `manual_${fact.id}_${Date.now()}_${i}`;

        await database.markFactAsScheduled(
          fact.id,
          scheduledDate.toISOString(),
          notificationId
        );

        console.log(`✅ Scheduled notification ${i + 1} for fact ${fact.id}`);
      }

      // Show success message
      const message = t("factsAddedDescription").replace(
        "{count}",
        selectedFacts.length.toString()
      );
      Alert.alert(t("factsAdded"), message, [
        { text: t("ok"), style: "default" },
      ]);
    } catch (error) {
      console.error("❌ Error sending notifications:", error);
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
                onPress={() => setShowLanguageModal(true)}
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
                label={t("settingsDifficulty")}
                value={getDifficultyName(difficulty, t)}
                icon={<Signal size={20} color={iconColor} />}
                onPress={() => setShowDifficultyModal(true)}
              />

              <SettingsRow
                label={t("settingsNotificationTime")}
                value={notificationTime.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
                icon={<Bell size={20} color={iconColor} />}
                onPress={() => setShowTimeModal(true)}
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
              </SettingsGroup>
            </SectionContainer>
          )}
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

      <DifficultyPickerModal
        visible={showDifficultyModal}
        onClose={() => setShowDifficultyModal(false)}
        currentDifficulty={difficulty}
        onDifficultyChange={(newDifficulty) => {
          setDifficulty(newDifficulty);
        }}
      />

      <TimePickerModal
        visible={showTimeModal}
        onClose={() => setShowTimeModal(false)}
        currentTime={notificationTime}
        onTimeChange={(newTime) => {
          setNotificationTime(newTime);
        }}
      />
    </Container>
  );
}
