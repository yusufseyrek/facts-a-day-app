import React, { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  Alert,
  ScrollView,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { styled } from "@tamagui/core";
import { YStack, XStack } from "tamagui";
import { useRouter, useFocusEffect } from "expo-router";
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
  Crown,
  RefreshCw,
  Sparkles,
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
import {
  useIsPremium,
  useSubscription,
} from "../../src/contexts/SubscriptionContext";
import { showSettingsInterstitial } from "../../src/services/adManager";

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

export default function SettingsPage() {
  const { theme, themeMode, toggleTheme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const isPremium = useIsPremium();
  const { subscriptionTier, restorePurchases, checkSubscription } =
    useSubscription();

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
  const [notificationTime, setNotificationTime] = useState<Date>(new Date());

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  // Refresh subscription status when screen comes into focus
  // This ensures premium status updates after returning from paywall
  useFocusEffect(
    React.useCallback(() => {
      checkSubscription();
    }, [])
  );

  const loadPreferences = async () => {
    try {
      const categories = await onboardingService.getSelectedCategories();
      const time = await onboardingService.getNotificationTime();

      setSelectedCategories(categories);
      if (time) {
        setNotificationTime(new Date(time));
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
    }
  };

  const handleCategoriesPress = async () => {
    await showSettingsInterstitial(isPremium);
    router.push("/settings/categories");
  };

  const handleLanguagePress = async () => {
    await showSettingsInterstitial(isPremium);
    setShowLanguageModal(true);
  };

  const handleTimePress = async () => {
    await showSettingsInterstitial(isPremium);
    setShowTimeModal(true);
  };

  const handleUpgradePress = () => {
    router.push("/paywall");
  };

  const handleRestorePurchases = async () => {
    try {
      Alert.alert(t("restorePurchases"), t("restoringPurchases"), [
        { text: t("ok") },
      ]);

      const hasPremium = await restorePurchases();

      if (hasPremium) {
        Alert.alert(t("success"), t("purchasesRestoredSuccessfully"), [
          { text: t("ok") },
        ]);
      } else {
        Alert.alert(t("noPurchasesFound"), t("noPurchasesToRestore"), [
          { text: t("ok") },
        ]);
      }
    } catch (error) {
      console.error("Error restoring purchases:", error);
      Alert.alert(t("error"), t("restorePurchasesFailed"), [{ text: t("ok") }]);
    }
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
        Alert.alert(t("noFactAvailable"), t("noFactsAvailable"), [
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
                value={notificationTime.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
                icon={<Bell size={20} color={iconColor} />}
                onPress={handleTimePress}
              />
            </SettingsGroup>
          </SectionContainer>

          {/* Subscription Section */}
          <SectionContainer>
            <SectionTitle>{t("subscription")}</SectionTitle>

            <SettingsGroup>
              {isPremium ? (
                <>
                  <SettingsRow
                    label={t("currentPlan")}
                    value={t("premium")}
                    icon={<Crown size={20} color={iconColor} />}
                  />
                  <SettingsRow
                    label={t("restorePurchases")}
                    icon={<RefreshCw size={20} color={iconColor} />}
                    onPress={handleRestorePurchases}
                  />
                </>
              ) : (
                <>
                  <SettingsRow
                    label={t("currentPlan")}
                    value={t("free")}
                    icon={<Crown size={20} color={iconColor} />}
                  />

                  {/* Premium Upgrade Button */}
                  <Pressable
                    onPress={handleUpgradePress}
                    style={({ pressed }) => [
                      styles.premiumButton,
                      {
                        backgroundColor:
                          theme === "dark" ? "#FFA500" : "#FFD700",
                        opacity: pressed ? 0.9 : 1,
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      },
                    ]}
                    android_ripple={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    <View style={styles.premiumContent}>
                      <View style={styles.premiumLeftContent}>
                        <View
                          style={[
                            styles.premiumIconContainer,
                            {
                              backgroundColor:
                                theme === "dark"
                                  ? "rgba(255,255,255,0.2)"
                                  : "rgba(255,255,255,0.3)",
                            },
                          ]}
                        >
                          <Crown
                            size={24}
                            color={theme === "dark" ? "#FFFFFF" : "#000000"}
                          />
                          <Sparkles
                            size={14}
                            color={theme === "dark" ? "#FFD700" : "#FFA500"}
                            style={styles.sparkleIcon}
                          />
                        </View>
                        <View style={styles.premiumTextContainer}>
                          <Text
                            style={[
                              styles.premiumTitle,
                              {
                                color: theme === "dark" ? "#FFFFFF" : "#000000",
                              },
                            ]}
                          >
                            {t("upgradeToPremium")}
                          </Text>
                          <Text
                            style={[
                              styles.premiumSubtitle,
                              {
                                color:
                                  theme === "dark"
                                    ? "rgba(255,255,255,0.8)"
                                    : "rgba(0,0,0,0.7)",
                              },
                            ]}
                          >
                            {t("removeAds3Facts")}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.premiumBadge}>
                        <Text style={styles.premiumBadgeText}>{t("new")}</Text>
                      </View>
                    </View>
                  </Pressable>
                  <SettingsRow
                    label={t("restorePurchases")}
                    icon={<RefreshCw size={20} color={iconColor} />}
                    onPress={handleRestorePurchases}
                  />
                </>
              )}
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

const styles = StyleSheet.create({
  premiumButton: {
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    marginBottom: tokens.space.sm,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  premiumContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  premiumLeftContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    flex: 1,
  },
  premiumIconContainer: {
    position: "relative",
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkleIcon: {
    position: "absolute",
    top: -4,
    right: -4,
  },
  premiumTextContainer: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  premiumSubtitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  premiumBadge: {
    backgroundColor: "#FF6B00",
    paddingHorizontal: tokens.space.sm,
    paddingVertical: 4,
    borderRadius: tokens.radius.sm,
  },
  premiumBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
