import React, { useState, useEffect, useCallback, useMemo } from "react";
import { StatusBar } from "expo-status-bar";
import { Alert, SectionList, Linking, Platform, AppState, View } from "react-native";
import { YStack } from "tamagui";
import { useRouter, useFocusEffect } from "expo-router";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import {
  Globe,
  Palette,
  Grid,
  Bell,
  Plus,
  TestTube,
  Contrast,
  RotateCcw,
  FileText,
  Shield,
  Bug,
  Settings,
  Star,
  Trash2,
} from "@tamagui/lucide-icons";
import { tokens } from "../../src/theme/tokens";
import {
  H2,
  SmallText,
  ScreenContainer,
  ScreenHeader,
  SectionHeaderContainer,
  ContentContainer,
  useIconColor,
} from "../../src/components";
import { SettingsRow } from "../../src/components/SettingsRow";
import { ThemePickerModal } from "../../src/components/settings/ThemePickerModal";
import { TimePickerModal } from "../../src/components/settings/TimePickerModal";
import { useTheme } from "../../src/theme";
import { useTranslation } from "../../src/i18n";
import { TranslationKeys } from "../../src/i18n/translations";
import * as onboardingService from "../../src/services/onboarding";
import * as database from "../../src/services/database";
import { buildNotificationContent } from "../../src/services/notifications";
import { useOnboarding } from "../../src/contexts";
import { openInAppBrowser } from "../../src/utils/browser";
import { trackScreenView, Screens } from "../../src/services/analytics";
import { requestReview } from "../../src/services/appReview";
import { clearAllCachedImages, getCachedImagesSize } from "../../src/services/images";

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
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);

  // Preferences state
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [notificationTimes, setNotificationTimes] = useState<Date[]>([
    new Date(),
  ]);
  
  // Notification permission state
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState(true);
  
  // Image cache size state
  const [imageCacheSize, setImageCacheSize] = useState<number>(0);

  // Check notification permission status
  const checkNotificationPermission = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setNotificationPermissionGranted(status === "granted");
    } catch (error) {
      console.error("Error checking notification permission:", error);
    }
  };

  // Load image cache size
  const loadImageCacheSize = async () => {
    try {
      const size = await getCachedImagesSize();
      setImageCacheSize(size);
    } catch (error) {
      console.error("Error loading image cache size:", error);
    }
  };

  // Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
    checkNotificationPermission();
    loadImageCacheSize();
  }, []);

  // Track screen view, reload preferences, and re-check permission when screen is focused
  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.SETTINGS);
      checkNotificationPermission();
      // Reload preferences to get updated category count and notification times
      loadPreferences();
      // Reload image cache size
      loadImageCacheSize();
    }, [])
  );

  // Listen for app state changes (when user returns from system settings)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        // Re-check permission when app becomes active (user may have changed it in system settings)
        checkNotificationPermission();
      }
    });

    return () => {
      subscription.remove();
    };
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

  const handleCategoriesPress = () => {
    router.push("/settings/categories");
  };

  const handleLanguagePress = async () => {
    // Open device app settings where user can change app language
    // On iOS: Settings > Facts a Day > Language
    // On Android: Settings > Apps > Facts a Day > Language
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else {
        await Linking.openSettings();
      }
    } catch (error) {
      console.error('Error opening app settings:', error);
      Alert.alert(t('error'), t('cannotOpenUrl'), [
        { text: t('ok'), style: 'default' },
      ]);
    }
  };

  const handleTimePress = () => {
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

      const content = await buildNotificationContent(fact, locale);
      // Add isTest flag to data
      content.data = { ...content.data, isTest: true };

      const notificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          repeats: false,
        },
      });

      console.log("✅ Notification scheduled with ID:", notificationId);

      Alert.alert(
        t("testNotificationScheduled"),
        t("testNotificationIn5Seconds"),
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
      const url = `https://factsaday.com/privacy/${locale}`;
      await openInAppBrowser(url, { theme });
    } catch (error) {
      console.error("Error opening privacy policy:", error);
      Alert.alert(t("error"), t("cannotOpenUrl"), [
        { text: t("ok"), style: "default" },
      ]);
    }
  };

  const handleTermsOfServicePress = async () => {
    try {
      const url = `https://factsaday.com/terms/${locale}`;
      await openInAppBrowser(url, { theme });
    } catch (error) {
      console.error("Error opening terms of service:", error);
      Alert.alert(t("error"), t("cannotOpenUrl"), [
        { text: t("ok"), style: "default" },
      ]);
    }
  };

  const handleReviewApp = async () => {
    await requestReview();
  };

  const handleClearImageCache = async () => {
    Alert.alert(
      t("settingsClearImageCache"),
      t("settingsClearImageCacheConfirm"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("ok"),
          style: "destructive",
          onPress: async () => {
            try {
              const result = await clearAllCachedImages();
              setImageCacheSize(0);
              Alert.alert(
                t("success"),
                t("settingsClearImageCacheSuccess", {
                  count: result.deletedCount,
                  size: formatBytes(result.freedBytes),
                }),
                [{ text: t("ok"), style: "default" }]
              );
            } catch (error) {
              console.error("Error clearing image cache:", error);
              Alert.alert(t("error"), t("error"), [
                { text: t("ok"), style: "default" },
              ]);
            }
          },
        },
      ]
    );
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
      const message = t("factsAddedDescription", { count: facts.length });
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

  const handleScheduleDuplicateNotifications = async () => {
    try {
      console.log("🐛 Creating buggy notification schedule to test repair...");

      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t("notificationPermissionRequired"),
          t("notificationPermissionMessage"),
          [{ text: t("ok"), style: "default" }]
        );
        return;
      }

      // Step 1: Clear all existing notifications from OS and DB
      console.log("🐛 Clearing existing notifications...");
      await Notifications.cancelAllScheduledNotificationsAsync();
      await database.clearAllScheduledFactsCompletely();

      // Step 2: Get enough facts to fill up to 64 notifications
      const facts = await database.getRandomUnscheduledFacts(64, locale);
      console.log("📚 Facts found:", facts.length);

      if (facts.length < 64) {
        Alert.alert("Not enough facts", `Need 64 unscheduled facts to test, found ${facts.length}`, [
          { text: t("ok"), style: "default" },
        ]);
        return;
      }

      const now = new Date();
      let scheduledCount = 0;
      let factIndex = 0;
      
      // Step 3: Schedule notifications with duplicates (simulating the bug)
      // For first 10 days, schedule 3 notifications per day (30 total - duplicates!)
      // For next 34 days, schedule 1 notification per day (34 total)
      // Total: 64 notifications
      
      console.log("🐛 Scheduling with duplicates for first 10 days...");
      
      // First 10 days: 3 notifications each (this is the bug scenario)
      for (let day = 1; day <= 10; day++) {
        for (let slot = 0; slot < 3; slot++) {
          if (factIndex >= facts.length) break;
          
          const fact = facts[factIndex];
          const scheduledDate = new Date(now);
          scheduledDate.setDate(scheduledDate.getDate() + day);
          scheduledDate.setHours(9 + slot * 2, 0, 0, 0); // 9:00, 11:00, 13:00

          const content = await buildNotificationContent(fact, locale, scheduledDate);
          const notificationId = await Notifications.scheduleNotificationAsync({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: scheduledDate,
            },
          });

          if (notificationId) {
            await database.markFactAsScheduled(fact.id, scheduledDate.toISOString(), notificationId);
            scheduledCount++;
            factIndex++;
          }
        }
      }
      
      // Next 34 days: 1 notification each (normal)
      console.log("🐛 Scheduling normal notifications for remaining days...");
      for (let day = 11; day <= 44 && factIndex < facts.length; day++) {
        const fact = facts[factIndex];
        const scheduledDate = new Date(now);
        scheduledDate.setDate(scheduledDate.getDate() + day);
        scheduledDate.setHours(9, 0, 0, 0);

        const content = await buildNotificationContent(fact, locale, scheduledDate);
        const notificationId = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: scheduledDate,
          },
        });

        if (notificationId) {
          await database.markFactAsScheduled(fact.id, scheduledDate.toISOString(), notificationId);
          scheduledCount++;
          factIndex++;
        }
      }

      // Verify
      const osCount = await Notifications.getAllScheduledNotificationsAsync();
      console.log(`🐛 Created buggy schedule: ${scheduledCount} notifications (OS: ${osCount.length})`);
      console.log("🐛 Days 1-10 have 3 notifications each (bug), days 11-44 have 1 each (normal)");

      Alert.alert(
        "Buggy Schedule Created",
        `Scheduled ${scheduledCount} notifications:\n` +
        `• Days 1-10: 3 per day (bug!)\n` +
        `• Days 11-44: 1 per day (normal)\n\n` +
        `OS has ${osCount.length} notifications.\n\n` +
        `Restart the app to trigger the repair check.`,
        [{ text: t("ok"), style: "default" }]
      );
    } catch (error) {
      console.error("❌ Error scheduling duplicate notifications:", error);
      Alert.alert(
        t("error"),
        error instanceof Error ? error.message : "Unknown error",
        [{ text: t("ok"), style: "default" }]
      );
    }
  };

  const headerIconColor = useIconColor();

  // Define settings items for each section
  type SettingsItem = {
    id: string;
    label: string;
    value?: string;
    icon: React.ReactNode;
    onPress: () => void;
    showExternalLink?: boolean;
    showWarning?: boolean;
  };

  type SettingsSection = {
    title: string;
    data: SettingsItem[];
  };

  // Build sections dynamically
  const sections = useMemo((): SettingsSection[] => {
    const userPreferencesSection: SettingsSection = {
      title: t("settingsUserPreferences"),
      data: [
        {
          id: "language",
          label: t("settingsLanguage"),
          value: getLanguageName(locale),
          icon: <Globe size={20} color={iconColor} />,
          onPress: handleLanguagePress,
          showExternalLink: true,
        },
        {
          id: "theme",
          label: t("settingsThemeTitle"),
          value: getThemeName(themeMode, t),
          icon: <Palette size={20} color={iconColor} />,
          onPress: () => setShowThemeModal(true),
        },
        {
          id: "categories",
          label: t("settingsCategories"),
          value: `${selectedCategories.length} ${t("settingsSelected")}`,
          icon: <Grid size={20} color={iconColor} />,
          onPress: handleCategoriesPress,
        },
        {
          id: "notificationTime",
          label: t("settingsNotificationTime"),
          value:
            notificationTimes.length === 1
              ? notificationTimes[0].toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              : t("settingsNotificationTimesCount", { count: notificationTimes.length }),
          icon: <Bell size={20} color={iconColor} />,
          onPress: handleTimePress,
          showWarning: !notificationPermissionGranted,
        },
      ],
    };

    const storageSection: SettingsSection = {
      title: t("settingsStorage"),
      data: [
        {
          id: "clearImageCache",
          label: t("settingsClearImageCache"),
          value: imageCacheSize > 0 ? t("settingsImageCacheSize", { size: formatBytes(imageCacheSize) }) : undefined,
          icon: <Trash2 size={20} color={iconColor} />,
          onPress: handleClearImageCache,
        },
      ],
    };

    const developerSection: SettingsSection = {
      title: t("developerSettings"),
      data: [
        {
          id: "add10Facts",
          label: t("add10RandomFacts"),
          icon: <Plus size={20} color={iconColor} />,
          onPress: handleAdd10RandomFacts,
        },
        {
          id: "testNotification",
          label: t("testNotification"),
          icon: <TestTube size={20} color={iconColor} />,
          onPress: handleTestNotification,
        },
        {
          id: "duplicateNotifications",
          label: "Schedule Duplicate Notifications",
          icon: <Bug size={20} color={iconColor} />,
          onPress: handleScheduleDuplicateNotifications,
        },
        {
          id: "toggleTheme",
          label: t("toggleTheme"),
          value: theme,
          icon: <Contrast size={20} color={iconColor} />,
          onPress: toggleTheme,
        },
        {
          id: "resetOnboarding",
          label: t("resetOnboarding"),
          icon: <RotateCcw size={20} color={iconColor} />,
          onPress: handleResetOnboarding,
        },
      ],
    };

    const supportSection: SettingsSection = {
      title: t("settingsSupport"),
      data: [
        {
          id: "reviewApp",
          label: t("settingsReviewApp", { appName: t("appName") }),
          icon: <Star size={20} color={iconColor} />,
          onPress: handleReviewApp,
        },
      ],
    };

    const legalSection: SettingsSection = {
      title: t("settingsLegal"),
      data: [
        {
          id: "privacyPolicy",
          label: t("settingsPrivacyPolicy"),
          icon: <Shield size={20} color={iconColor} />,
          onPress: handlePrivacyPolicyPress,
        },
        {
          id: "termsOfService",
          label: t("settingsTermsOfService"),
          icon: <FileText size={20} color={iconColor} />,
          onPress: handleTermsOfServicePress,
        },
      ],
    };

    const result: SettingsSection[] = [userPreferencesSection];
    result.push(storageSection);
    if (isDevelopment) {
      result.push(developerSection);
    }
    result.push(supportSection);
    result.push(legalSection);

    return result;
  }, [
    t,
    locale,
    iconColor,
    themeMode,
    selectedCategories,
    notificationTimes,
    notificationPermissionGranted,
    isDevelopment,
    theme,
    imageCacheSize,
  ]);

  const renderFooter = () => (
    <Animated.View entering={FadeInDown.delay(300).duration(300)}>
      <ContentContainer>
        <YStack alignItems="center" marginVertical={tokens.space.lg}>
          <SmallText textAlign="center" color={iconColor} style={{ opacity: 0.6, marginBottom: tokens.space.xs }}>
            Version {Constants.expoConfig?.version || "1.0.0"} ({Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber || 'N/A' : Constants.expoConfig?.android?.versionCode || 'N/A'})
          </SmallText>
          <SmallText textAlign="center" color={iconColor} style={{ opacity: 0.6, marginBottom: tokens.space.xs }}>
            {t("settingsCopyright").replace("{appName}", t("appName"))}
          </SmallText>
        </YStack>
      </ContentContainer>
    </Animated.View>
  );

  return (
    <ScreenContainer edges={["top"]}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Animated.View entering={FadeIn.duration(300)}>
        <ScreenHeader
          icon={<Settings size={28} color={headerIconColor} />}
          title={t("settings")}
        />
      </Animated.View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section: { title }, section }) => {
          const sectionIndex = sections.indexOf(section);
          return (
            <Animated.View entering={FadeInDown.delay(sectionIndex * 50).duration(300)}>
              <SectionHeaderContainer>
                <H2>{title}</H2>
              </SectionHeaderContainer>
            </Animated.View>
          );
        }}
        renderItem={({ item, section, index }) => {
          const sectionIndex = sections.indexOf(section);
          const animationDelay = sectionIndex * 50 + (index + 1) * 30;
          return (
            <Animated.View entering={FadeInDown.delay(animationDelay).duration(300)}>
              <ContentContainer marginBottom={tokens.space.sm}>
                <SettingsRow
                  label={item.label}
                  value={item.value}
                  icon={item.icon}
                  onPress={item.onPress}
                  showExternalLink={item.showExternalLink}
                  showWarning={item.showWarning}
                />
              </ContentContainer>
            </Animated.View>
          );
        }}
        ListFooterComponent={renderFooter}
        stickySectionHeadersEnabled={true}
        showsVerticalScrollIndicator={false}
      />

      {/* Modals */}
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
        hasNotificationPermission={notificationPermissionGranted}
      />
    </ScreenContainer>
  );
}
