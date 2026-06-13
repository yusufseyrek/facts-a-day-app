import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, SectionList, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import Constants from 'expo-constants';
import { deepLinkToSubscriptions } from 'expo-iap';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';

import { ContentContainer, ScreenContainer, Text } from '../../../src/components';
import {
  BarChart3,
  Bell,
  ChevronRight,
  Crown,
  Eye,
  FileText,
  Globe,
  Grid,
  Heart,
  Palette,
  RotateCcw,
  Shield,
  Star,
  TestTube,
  Trash2,
  Trophy,
  User,
} from '../../../src/components/icons';
import { ScreenNameModal } from '../../../src/components/ScreenNameModal';
import { ThemePickerModal } from '../../../src/components/settings/ThemePickerModal';
import { TimePickerModal } from '../../../src/components/settings/TimePickerModal';
import { SettingsRow } from '../../../src/components/SettingsRow';
import { XStack, YStack } from '../../../src/components/Stacks';
import { FONT_FAMILIES } from '../../../src/components/Typography';
import { DEV_SETTINGS_ENABLED, LAYOUT, SUBSCRIPTION } from '../../../src/config/app';
import { useOnboarding, usePremium, useScrollToTopHandler } from '../../../src/contexts';
import { useTranslation } from '../../../src/i18n';
import { TranslationKeys } from '../../../src/i18n/translations';
import { openAdDebugMenu } from '../../../src/services/ads';
import { Screens, trackScreenView } from '../../../src/services/analytics';
import * as api from '../../../src/services/api';
import { requestReview } from '../../../src/services/appReview';
import { armDevDualTrigger, triggerTestBadgeToast } from '../../../src/services/badges';
import { onFeedRefresh } from '../../../src/services/contentRefresh';
import { mapApiFactToRelations } from '../../../src/services/database';
import { clearAllCachedImages, getCachedImagesSize } from '../../../src/services/images';
import {
  buildNotificationContent,
  getExpoPushToken,
  sendTestPushToSelf,
} from '../../../src/services/notifications';
import * as onboardingService from '../../../src/services/onboarding';
import { cleanupShareCards } from '../../../src/services/share';
import { clearHintUsage } from '../../../src/services/trivia';
import * as updates from '../../../src/services/updates';
import * as userService from '../../../src/services/user';
import { clearIdentity } from '../../../src/services/userIdentity';
import { hexColors, useTheme } from '../../../src/theme';
import { openInAppBrowser } from '../../../src/utils/browser';
import { darkenColor, getContrastColor } from '../../../src/utils/colors';
import { useResponsive } from '../../../src/utils/useResponsive';

// Helper to get language display name
const getLanguageName = (code: string): string => {
  const languages: Record<string, string> = {
    de: 'Deutsch',
    en: 'English',
    es: 'Español',
    fr: 'Français',
    ja: '日本語',
    ko: '한국어',
    tr: 'Türkçe',
    zh: '中文',
  };
  return languages[code] || code;
};

// Helper to get theme display name
const getThemeName = (mode: string, t: (key: TranslationKeys) => string): string => {
  const themeNames: Record<string, string> = {
    light: t('settingsThemeLight'),
    dark: t('settingsThemeDark'),
    system: t('settingsThemeSystem'),
  };
  return themeNames[mode] || mode;
};

// Premium upsell row in the gradient game-tile signature (TriviaGridCard):
// diagonal accent gradient, contrast-colored content, icon on a translucent
// plate, decorative offset circles, accent glow shadow, pressed scale.
function PremiumUpgradeCard({
  label,
  isDark,
  onPress,
}: {
  label: string;
  isDark: boolean;
  onPress: () => void;
}) {
  const { spacing, radius, iconSizes, media } = useResponsive();
  const { t } = useTranslation();
  const gold = isDark ? hexColors.dark.warning : hexColors.light.warning;
  const contrastColor = getContrastColor(gold);
  const platBg = contrastColor === '#000000' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)';
  const plateSize = media.topicCardSize * 0.5;

  return (
    <Pressable
      onPress={onPress}
      role="button"
      accessibilityLabel={label}
      accessibilityHint={t('settingsUpgradeHint')}
      style={({ pressed }) => [
        {
          borderRadius: radius.xl,
          shadowColor: gold,
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.35,
          shadowRadius: 10,
          elevation: 6,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <LinearGradient
        colors={[gold, darkenColor(gold, 0.22)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.xl, overflow: 'hidden' }}
      >
        {/* Layered decorative circles for depth — same as the trivia tiles */}
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: -plateSize * 0.6,
            right: -plateSize * 0.5,
            width: plateSize * 1.8,
            height: plateSize * 1.8,
            borderRadius: plateSize * 0.9,
            backgroundColor:
              contrastColor === '#000000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)',
          }}
        />
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            bottom: -plateSize * 0.7,
            left: -plateSize * 0.4,
            width: plateSize * 1.4,
            height: plateSize * 1.4,
            borderRadius: plateSize * 0.7,
            backgroundColor:
              contrastColor === '#000000' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)',
          }}
        />
        <XStack alignItems="center" gap={spacing.md} padding={spacing.lg}>
          <YStack
            width={plateSize}
            height={plateSize}
            borderRadius={plateSize / 2}
            backgroundColor={platBg}
            justifyContent="center"
            alignItems="center"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Crown size={iconSizes.lg} color={contrastColor} />
          </YStack>
          <Text.Label
            flex={1}
            fontFamily={FONT_FAMILIES.bold}
            color={contrastColor}
            numberOfLines={1}
          >
            {label}
          </Text.Label>
          <ChevronRight size={iconSizes.md} color={contrastColor} opacity={0.55} />
        </XStack>
      </LinearGradient>
    </Pressable>
  );
}

export default function SettingsPage() {
  const { theme, themeMode } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { resetOnboarding } = useOnboarding();
  const { isPremium, restorePurchases, devSetPremium } = usePremium();
  const { iconSizes, spacing, isTablet } = useResponsive();

  // Track if this is the initial mount to prevent re-animation on tab focus
  // We delay setting the flag to allow lazy-rendered items to also animate
  const hasAnimatedRef = useRef(false);
  const shouldAnimate = !hasAnimatedRef.current;

  useEffect(() => {
    // Wait for all initial animations to complete before disabling future animations
    // Max delay (~400ms) + duration (300ms) + buffer
    const timer = setTimeout(() => {
      hasAnimatedRef.current = true;
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to top handler
  const listRef = useRef<SectionList>(null);
  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: true });
  }, []);
  useScrollToTopHandler('settings', scrollToTop);

  const isDevelopment = DEV_SETTINGS_ENABLED;

  // Use white icons in dark mode for better contrast
  const iconColor = theme === 'dark' ? '#FFFFFF' : hexColors[theme].text;
  const colors = hexColors[theme];

  // Modal visibility state
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showScreenNameModal, setShowScreenNameModal] = useState(false);

  // Claimed screen name (null until the user picks one)
  const [screenName, setScreenName] = useState<string | null>(null);
  useEffect(() => {
    userService
      .getProfile()
      .then((profile) => setScreenName(profile?.screenName ?? null))
      .catch(() => {});
  }, []);

  // Preferences state
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [notificationTimes, setNotificationTimes] = useState<Date[]>([new Date()]);

  // Notification permission state
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState(true);

  // Image cache size state
  const [imageCacheSize, setImageCacheSize] = useState<number>(0);

  // OTA update info state
  const [updateInfo, setUpdateInfo] = useState<{
    updateId: string | null;
    runtimeVersion: string;
    isEmbedded: boolean;
  } | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // Check notification permission status
  const checkNotificationPermission = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setNotificationPermissionGranted(status === 'granted');
    } catch (error) {
      console.error('Error checking notification permission:', error);
    }
  };

  // Load image cache size
  const loadImageCacheSize = async () => {
    try {
      const size = await getCachedImagesSize();
      setImageCacheSize(size);
    } catch (error) {
      console.error('Error loading image cache size:', error);
    }
  };

  // Load OTA update info
  const loadUpdateInfo = () => {
    const info = updates.getUpdateInfo();
    setUpdateInfo(info);
  };

  // Get debug info string for OTA updates
  const getUpdateDebugInfo = (): string => {
    const info = updates.getUpdateInfo();
    const reason = updates.getLastCheckReason();
    // Try to get full manifest details
    const manifest = (Updates as any).manifest;
    const createdAt = manifest?.createdAt || 'unknown';
    const manifestId = manifest?.id || 'none';
    const launchAssetUrl = manifest?.launchAsset?.url || 'none';

    return [
      `--- Current Running Update ---`,
      `Runtime: ${info.runtimeVersion}`,
      `Update ID: ${info.updateId || 'null (embedded)'}`,
      `Manifest ID: ${manifestId}`,
      `Created At: ${createdAt}`,
      `Is Embedded: ${info.isEmbedded}`,
      `Channel: ${info.channel || 'default'}`,
      `Platform: ${Platform.OS}`,
      `--- Configuration ---`,
      `URL: ${Constants.expoConfig?.updates?.url || 'not set'}`,
      `Updates Enabled: ${Updates.isEnabled}`,
      `--- Debug ---`,
      `Last Check Reason: ${reason || 'not checked yet'}`,
      `LaunchAsset URL: ${launchAssetUrl}`,
    ].join('\n');
  };

  // Manually fetch manifest to debug
  const fetchManifestDirectly = async (): Promise<string> => {
    try {
      const url = Constants.expoConfig?.updates?.url;
      if (!url) return 'No update URL configured';

      const response = await fetch(url, {
        headers: {
          'expo-protocol-version': '1',
          'expo-platform': Platform.OS,
          'expo-runtime-version': updates.getRuntimeVersion(),
          'expo-current-update-id': updates.getUpdateInfo().updateId || '',
          Accept: 'multipart/mixed',
        },
      });

      const status = response.status;
      const contentType = response.headers.get('content-type') || 'unknown';
      const text = await response.text();

      // Extract key fields from response
      const idMatch = text.match(/"id"\s*:\s*"([^"]+)"/);
      const manifestId = idMatch ? idMatch[1] : 'not found';

      const createdAtMatch = text.match(/"createdAt"\s*:\s*"([^"]+)"/);
      const createdAt = createdAtMatch ? createdAtMatch[1] : 'not found';

      const launchAssetMatch = text.match(/"launchAsset"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/);
      const launchAssetUrl = launchAssetMatch ? launchAssetMatch[1] : 'not found';

      const runtimeMatch = text.match(/"runtimeVersion"\s*:\s*"([^"]+)"/);
      const serverRuntime = runtimeMatch ? runtimeMatch[1] : 'not found';

      const currentInfo = updates.getUpdateInfo();

      return [
        `--- Server Response ---`,
        `HTTP Status: ${status}`,
        `Content-Type: ${contentType}`,
        `Server Manifest ID: ${manifestId}`,
        `Server Created At: ${createdAt}`,
        `Server Runtime: ${serverRuntime}`,
        `Server Bundle URL: ${launchAssetUrl.substring(0, 50)}...`,
        `--- Comparison ---`,
        `Current ID: ${currentInfo.updateId || 'null (embedded)'}`,
        `Current Runtime: ${currentInfo.runtimeVersion}`,
        `IDs Match: ${manifestId === currentInfo.updateId ? 'YES (no update needed)' : 'NO (update available)'}`,
      ].join('\n');
    } catch (error) {
      return `Fetch error: ${error instanceof Error ? error.message : 'unknown'}`;
    }
  };

  // Fetch raw manifest for debugging
  const fetchRawManifest = async (): Promise<string> => {
    try {
      const url = Constants.expoConfig?.updates?.url;
      if (!url) return 'No update URL configured';

      const response = await fetch(url, {
        headers: {
          'expo-protocol-version': '1',
          'expo-platform': Platform.OS,
          'expo-runtime-version': updates.getRuntimeVersion(),
          Accept: 'multipart/mixed',
        },
      });

      const text = await response.text();
      // Try to extract and format the JSON manifest from multipart response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return text.substring(0, 2000) + '...';
        }
      }
      return text.substring(0, 2000) + '...';
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'unknown'}`;
    }
  };

  // Manually check for OTA updates
  const _handleCheckForUpdates = async () => {
    // First fetch manifest directly to compare
    const manifestInfo = await fetchManifestDirectly();
    const debugInfo = getUpdateDebugInfo();
    const nativeLogs = await updates.getFormattedNativeLogs();

    Alert.alert('OTA Update Status', `${debugInfo}\n\n--- Server Check ---\n${manifestInfo}`, [
      { text: 'Close', style: 'cancel' },
      {
        text: 'Raw Manifest',
        style: 'default',
        onPress: async () => {
          const rawManifest = await fetchRawManifest();
          Alert.alert('Raw Server Manifest', rawManifest, [{ text: 'OK', style: 'default' }]);
        },
      },
      {
        text: 'Native Logs',
        style: 'default',
        onPress: () => {
          Alert.alert('Native Expo-Updates Logs', nativeLogs, [{ text: 'OK', style: 'default' }]);
        },
      },
      {
        text: 'Check Now',
        style: 'default',
        onPress: async () => {
          setIsCheckingUpdate(true);
          try {
            const result = await updates.checkAndDownloadUpdate();
            loadUpdateInfo(); // Refresh info after check

            const newDebugInfo = getUpdateDebugInfo();

            if (result.error) {
              Alert.alert('Update Check Failed', `${result.error.message}\n\n${newDebugInfo}`, [
                { text: t('ok'), style: 'default' },
              ]);
            } else if (result.downloaded) {
              Alert.alert(
                'Update Downloaded',
                `A new update has been downloaded.\n\n${newDebugInfo}`,
                [
                  { text: 'Later', style: 'cancel' },
                  {
                    text: 'Restart Now',
                    style: 'default',
                    onPress: async () => {
                      // Use the more robust reload with verification
                      await updates.forceReloadWithVerification();
                    },
                  },
                ]
              );
            } else if (result.updateAvailable) {
              Alert.alert(
                'Update Available',
                `An update is available but failed to download.\n\n${newDebugInfo}`,
                [{ text: t('ok'), style: 'default' }]
              );
            } else {
              // Show native logs for debugging
              const logsAfterCheck = await updates.getFormattedNativeLogs();
              Alert.alert(
                'No Update Found',
                `expo-updates says no update.\n\n${newDebugInfo}\n\n--- Native Logs ---\n${logsAfterCheck}`,
                [{ text: t('ok'), style: 'default' }]
              );
            }
          } catch (error) {
            Alert.alert(
              'Error',
              `${error instanceof Error ? error.message : 'Unknown error'}\n\n${getUpdateDebugInfo()}`,
              [{ text: t('ok'), style: 'default' }]
            );
          } finally {
            setIsCheckingUpdate(false);
          }
        },
      },
    ]);
  };

  // Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
    checkNotificationPermission();
    loadImageCacheSize();
    loadUpdateInfo();
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

  // Reload preferences when premium status changes (downgrade removes premium categories)
  useEffect(() => {
    loadPreferences();
  }, [isPremium]);

  // Reload preferences when feed refreshes (e.g. after downgrade cleanup completes)
  useEffect(() => {
    return onFeedRefresh(() => {
      loadPreferences();
    });
  }, []);

  // Listen for app state changes (when user returns from system settings)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
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
      console.error('Error loading preferences:', error);
    }
  };

  const handleCategoriesPress = () => {
    router.push('/settings/categories');
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
      Alert.alert(t('error'), t('cannotOpenUrl'), [{ text: t('ok'), style: 'default' }]);
    }
  };

  const handleTimePress = () => {
    setShowTimeModal(true);
  };

  const handleResetOnboarding = async () => {
    try {
      await resetOnboarding();
      await clearHintUsage();
      // Forget the claimed screen name so comments start from the join CTA
      // again (local only — re-claiming the same name needs the backend row
      // gone, since the secret is unrecoverable).
      await clearIdentity();
      // Clear cached images on disk
      const { clearAllCachedImages } = await import('../../../src/services/images');
      await clearAllCachedImages();
      // Reset ad consent state so GDPR/ATT prompts show again
      const { AdsConsent } = await import('react-native-google-mobile-ads');
      AdsConsent.reset();
      router.replace('/onboarding');
    } catch (error) {
      console.error('Error resetting onboarding:', error);
    }
  };

  const handleTestNotification = async () => {
    try {
      if (__DEV__) console.log('🔔 Starting test notification...');

      const { status } = await Notifications.getPermissionsAsync();
      if (__DEV__) console.log('📱 Permission status:', status);

      if (status !== 'granted') {
        Alert.alert(t('notificationPermissionRequired'), t('notificationPermissionMessage'), [
          { text: t('ok'), style: 'default' },
        ]);
        return;
      }

      const feed = await api.getFactsFeed({ language: locale, limit: 1 });
      if (__DEV__) console.log('📚 Facts found:', feed.facts.length);

      if (feed.facts.length === 0) {
        Alert.alert(t('noFactAvailable'), t('noFactsAvailableForTest'), [
          { text: t('ok'), style: 'default' },
        ]);
        return;
      }

      const fact = mapApiFactToRelations(feed.facts[0]);
      if (__DEV__)
        console.log('✅ Using fact:', fact.id, '-', fact.content.substring(0, 50) + '...');

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

      if (__DEV__) console.log('✅ Notification scheduled with ID:', notificationId);

      Alert.alert(t('testNotificationScheduled'), t('testNotificationIn5Seconds'), [
        { text: t('ok'), style: 'default' },
      ]);
    } catch (error) {
      console.error('❌ Error scheduling test notification:', error);
      Alert.alert(
        t('error'),
        `${t('failedToScheduleTestNotification')}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        [{ text: t('ok'), style: 'default' }]
      );
    }
  };

  // DEV: verify the real server-push pipeline (Expo → APNs/FCM → this device),
  // not just a local scheduled notification. Sends a push to this device's own
  // Expo token through Expo's push API — the same transport the backend uses.
  const handleTestServerPush = async () => {
    try {
      const token = await getExpoPushToken();
      if (!token) {
        Alert.alert(
          'No push token',
          'Need a real device with notification permission granted. (Simulators and Expo Go for a custom project cannot get a token.)'
        );
        return;
      }
      const result = await sendTestPushToSelf();
      Alert.alert(
        result.ok ? 'Push sent ✅' : 'Push failed ❌',
        `${result.detail}\n\nToken:\n${token}`,
        [{ text: t('ok'), style: 'default' }]
      );
    } catch (error) {
      Alert.alert(t('error'), error instanceof Error ? error.message : 'Unknown error', [
        { text: t('ok'), style: 'default' },
      ]);
    }
  };

  const handlePrivacyPolicyPress = async () => {
    try {
      const url = `https://factsaday.com/${locale}/privacy`;
      await openInAppBrowser(url, { theme });
    } catch (error) {
      console.error('Error opening privacy policy:', error);
      Alert.alert(t('error'), t('cannotOpenUrl'), [{ text: t('ok'), style: 'default' }]);
    }
  };

  const handleTermsOfServicePress = async () => {
    try {
      const url = `https://factsaday.com/${locale}/terms`;
      await openInAppBrowser(url, { theme });
    } catch (error) {
      console.error('Error opening terms of service:', error);
      Alert.alert(t('error'), t('cannotOpenUrl'), [{ text: t('ok'), style: 'default' }]);
    }
  };

  const handleReviewApp = async () => {
    // Use fallback to open store when in-app review isn't available
    await requestReview(true);
  };

  const handleClearImageCache = async () => {
    Alert.alert(t('settingsClearImageCache'), t('settingsClearImageCacheConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('ok'),
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await clearAllCachedImages();
            // Also clear share card images
            await cleanupShareCards();
            setImageCacheSize(0);
            Alert.alert(
              t('success'),
              t('settingsClearImageCacheSuccess', {
                count: result.deletedCount,
                size: formatBytes(result.freedBytes),
              }),
              [{ text: t('ok'), style: 'default' }]
            );
          } catch (error) {
            console.error('Error clearing image cache:', error);
            Alert.alert(t('error'), t('error'), [{ text: t('ok'), style: 'default' }]);
          }
        },
      },
    ]);
  };

  // Define settings items for each section
  type SettingsItem = {
    id: string;
    label: string;
    value?: string;
    icon: React.ReactNode;
    /** Chip accent behind the icon; the icon is colored with it too. */
    accent: string;
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
    const generalSection: SettingsSection = {
      title: t('settingsGeneral'),
      data: [
        {
          id: 'readingStats',
          label: t('readingStats'),
          icon: <BarChart3 size={iconSizes.md} color={colors.neonCyan} />,
          accent: colors.neonCyan,
          onPress: () => router.push('/stats'),
        },
        {
          id: 'achievements',
          label: t('achievements'),
          icon: <Trophy size={iconSizes.md} color={colors.neonYellow} />,
          accent: colors.neonYellow,
          onPress: () => router.push('/badges'),
        },
      ],
    };

    const userPreferencesSection: SettingsSection = {
      title: t('settingsUserPreferences'),
      data: [
        {
          id: 'screenName',
          label: t('screenName'),
          value: screenName ?? t('screenNameNotSet'),
          icon: <User size={iconSizes.md} color={colors.neonPurple} />,
          accent: colors.neonPurple,
          onPress: () => setShowScreenNameModal(true),
        },
        {
          id: 'language',
          label: t('settingsLanguage'),
          value: getLanguageName(locale),
          icon: <Globe size={iconSizes.md} color={colors.neonGreen} />,
          accent: colors.neonGreen,
          onPress: handleLanguagePress,
          showExternalLink: true,
        },
        {
          id: 'theme',
          label: t('settingsThemeTitle'),
          value: getThemeName(themeMode, t),
          icon: <Palette size={iconSizes.md} color={colors.neonMagenta} />,
          accent: colors.neonMagenta,
          onPress: () => setShowThemeModal(true),
        },
        {
          id: 'categories',
          label: t('settingsCategories'),
          value: `${selectedCategories.length} ${t('settingsSelected')}`,
          icon: <Grid size={iconSizes.md} color={colors.neonOrange} />,
          accent: colors.neonOrange,
          onPress: handleCategoriesPress,
        },
        {
          id: 'notificationTime',
          label: t('settingsNotificationTime'),
          value:
            notificationTimes.length === 1
              ? notificationTimes[0].toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
              : t('settingsNotificationTimesCount', { count: notificationTimes.length }),
          icon: (
            <Bell
              size={iconSizes.md}
              color={notificationPermissionGranted ? colors.neonRed : colors.warning}
            />
          ),
          accent: notificationPermissionGranted ? colors.neonRed : colors.warning,
          onPress: handleTimePress,
          showWarning: !notificationPermissionGranted,
        },
      ],
    };

    const storageSection: SettingsSection = {
      title: t('settingsStorage'),
      data: [
        {
          id: 'clearImageCache',
          label: t('settingsClearImageCache'),
          value:
            imageCacheSize > 0
              ? t('settingsImageCacheSize', { size: formatBytes(imageCacheSize) })
              : undefined,
          icon: <Trash2 size={iconSizes.md} color={colors.error} />,
          accent: colors.error,
          onPress: handleClearImageCache,
        },
      ],
    };

    const developerSection: SettingsSection = {
      title: t('developerSettings'),
      data: [
        {
          id: 'testNotification',
          label: t('testNotification'),
          value: 'local (5s)',
          icon: <TestTube size={iconSizes.md} color={colors.neonGreen} />,
          accent: colors.neonGreen,
          onPress: handleTestNotification,
        },
        {
          id: 'testServerPush',
          label: 'Test Server Push',
          value: 'Expo → APNs/FCM',
          icon: <Bell size={iconSizes.md} color={colors.neonCyan} />,
          accent: colors.neonCyan,
          onPress: handleTestServerPush,
        },
        {
          id: 'adInspector',
          label: 'Ad Inspector',
          value: 'debug ads',
          icon: <Eye size={iconSizes.md} color={colors.neonMagenta} />,
          accent: colors.neonMagenta,
          onPress: openAdDebugMenu,
        },
        {
          id: 'testBadgeToast',
          label: 'Test Badge Toast',
          icon: <Trophy size={iconSizes.md} color={colors.neonYellow} />,
          accent: colors.neonYellow,
          onPress: () => {
            triggerTestBadgeToast();
          },
        },
        {
          id: 'testSatisfactionModal',
          label: 'Test Satisfaction Modal',
          value: 'badge + modal on fact close',
          icon: <Heart size={iconSizes.md} color={colors.neonRed} />,
          accent: colors.neonRed,
          onPress: () => {
            armDevDualTrigger();
            Alert.alert(
              'Armed',
              'Open any fact, then close it. A badge toast and the satisfaction modal will be queued together so you can verify the toast/modal overlap.'
            );
          },
        },
        {
          id: 'devTogglePremium',
          label: isPremium ? 'Dev: Disable Premium' : 'Dev: Enable Premium',
          value: isPremium ? 'on' : 'off',
          icon: <Crown size={iconSizes.md} color={isPremium ? '#FFD700' : colors.warning} />,
          accent: isPremium ? '#FFD700' : colors.warning,
          onPress: async () => {
            const next = !isPremium;
            await devSetPremium(next);
            Alert.alert(
              next ? 'Premium enabled' : 'Premium disabled',
              next
                ? 'Premium is now ON. Restart the app to test cold-start behavior.'
                : 'Premium is now OFF. handlePremiumDowngrade should run — premium categories should be removed.'
            );
          },
        },
        {
          id: 'resetOnboarding',
          label: t('resetOnboarding'),
          icon: <RotateCcw size={iconSizes.md} color={colors.error} />,
          accent: colors.error,
          onPress: handleResetOnboarding,
        },
      ],
    };

    const supportSection: SettingsSection = {
      title: t('settingsSupport'),
      data: [
        {
          id: 'reviewApp',
          label: t('settingsReviewApp', { appName: t('appName') }),
          icon: <Star size={iconSizes.md} color={colors.neonYellow} />,
          accent: colors.neonYellow,
          onPress: handleReviewApp,
        },
      ],
    };

    const legalSection: SettingsSection = {
      title: t('settingsLegal'),
      data: [
        {
          id: 'privacyPolicy',
          label: t('settingsPrivacyPolicy'),
          icon: <Shield size={iconSizes.md} color={colors.neonGreen} />,
          accent: colors.neonGreen,
          onPress: handlePrivacyPolicyPress,
        },
        {
          id: 'termsOfService',
          label: t('settingsTermsOfService'),
          icon: <FileText size={iconSizes.md} color={colors.neutral} />,
          accent: colors.neutral,
          onPress: handleTermsOfServicePress,
        },
      ],
    };

    const premiumSection: SettingsSection = {
      title: t('settingsPremium'),
      data: isPremium
        ? [
            {
              id: 'premiumActive',
              label: t('settingsPremiumActive'),
              icon: <Crown size={iconSizes.md} color="#FFD700" />,
              accent: '#FFD700',
              onPress: () => deepLinkToSubscriptions(),
            },
          ]
        : [
            {
              // Rendered as the gradient PremiumUpgradeCard (see renderItem),
              // not a SettingsRow; icon/accent are unused for this id.
              id: 'upgradePremium',
              label: t('settingsUpgradeToPremium'),
              icon: <Crown size={iconSizes.md} color={colors.warning} />,
              accent: colors.warning,
              onPress: () => router.push('/paywall'),
            },
          ],
    };

    const result: SettingsSection[] = SUBSCRIPTION.ENABLED
      ? [premiumSection, generalSection, userPreferencesSection]
      : [generalSection, userPreferencesSection];
    result.push(storageSection);
    if (isDevelopment) {
      result.push(developerSection);
    }
    // Add restore purchases to support section
    if (SUBSCRIPTION.ENABLED) {
      supportSection.data.push({
        id: 'restorePurchases',
        label: t('settingsRestorePurchases'),
        icon: <RotateCcw size={iconSizes.md} color={colors.neonCyan} />,
        accent: colors.neonCyan,
        onPress: async () => {
          const restored = await restorePurchases();
          Alert.alert(
            restored ? t('settingsRestoreSuccess') : t('settingsRestoreNoSubscription'),
            restored
              ? t('settingsRestoreSuccessMessage')
              : t('settingsRestoreNoSubscriptionMessage')
          );
        },
      });
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
    screenName,
    imageCacheSize,
    updateInfo,
    isCheckingUpdate,
    isPremium,
    restorePurchases,
    devSetPremium,
    router,
  ]);

  const renderFooter = () => (
    <Animated.View entering={shouldAnimate ? FadeInDown.delay(300).duration(300) : undefined}>
      <ContentContainer>
        <YStack alignItems="center" marginVertical={spacing.lg}>
          <Text.Caption
            textAlign="center"
            color={iconColor}
            style={{ opacity: 0.6, marginBottom: spacing.xs }}
          >
            {t('settingsVersionLabel')} {Constants.expoConfig?.version || '1.0.0'} (
            {Platform.OS === 'ios'
              ? Constants.expoConfig?.ios?.buildNumber || 'N/A'
              : Constants.expoConfig?.android?.versionCode || 'N/A'}
            )
          </Text.Caption>
          {updateInfo && (
            <Text.Caption
              textAlign="center"
              color={iconColor}
              style={{ opacity: 0.5, marginBottom: spacing.xs }}
            >
              {updateInfo.isEmbedded
                ? `Bundle: Embedded`
                : `Bundle: ${updateInfo.updateId?.slice(0, 8) ?? 'Embedded'}...`}
            </Text.Caption>
          )}
          <Text.Caption
            textAlign="center"
            color={iconColor}
            style={{ opacity: 0.6, marginBottom: spacing.xs }}
          >
            {t('settingsCopyright').replace('{appName}', t('appName'))}
          </Text.Caption>
        </YStack>
      </ContentContainer>
    </Animated.View>
  );

  return (
    <ScreenContainer edges={[]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <SectionList
        ref={listRef}
        sections={sections}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section: { title }, section }) => {
          const sectionIndex = sections.findIndex((s) => s.title === section.title);
          return (
            <Animated.View
              entering={
                shouldAnimate ? FadeInDown.delay(sectionIndex * 50).duration(300) : undefined
              }
            >
              <YStack width="100%" alignItems="center" backgroundColor="$background">
                <YStack
                  width="100%"
                  maxWidth={isTablet ? LAYOUT.MAX_CONTENT_WIDTH : undefined}
                  paddingHorizontal={spacing.md}
                  paddingVertical={spacing.md}
                >
                  <Text.Title>{title}</Text.Title>
                </YStack>
              </YStack>
            </Animated.View>
          );
        }}
        renderItem={({ item, section, index }) => {
          const sectionIndex = sections.findIndex((s) => s.title === section.title);
          const animationDelay = sectionIndex * 50 + (index + 1) * 30;
          const isLast = index === section.data.length - 1;
          return (
            <Animated.View
              entering={shouldAnimate ? FadeInDown.delay(animationDelay).duration(300) : undefined}
            >
              {/* Rows of a section stack edge-to-edge into one grouped card;
                  only the last row adds the gap before the next section. */}
              <ContentContainer marginBottom={isLast ? spacing.md : 0}>
                {item.id === 'upgradePremium' ? (
                  <PremiumUpgradeCard
                    label={item.label}
                    isDark={theme === 'dark'}
                    onPress={item.onPress}
                  />
                ) : (
                  <SettingsRow
                    label={item.label}
                    value={item.value}
                    icon={item.icon}
                    accentColor={item.accent}
                    isFirst={index === 0}
                    isLast={isLast}
                    onPress={item.onPress}
                    showExternalLink={item.showExternalLink}
                    showWarning={item.showWarning}
                  />
                )}
              </ContentContainer>
            </Animated.View>
          );
        }}
        ListFooterComponent={renderFooter}
        // RN's JS sticky headers pin to the viewport top, ignoring the
        // translucent native header's content inset — they'd float above the
        // large title. Non-sticky headers scroll with content instead.
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />

      {/* Modals */}
      <ThemePickerModal visible={showThemeModal} onClose={() => setShowThemeModal(false)} />

      <ScreenNameModal
        visible={showScreenNameModal}
        onClose={() => setShowScreenNameModal(false)}
        onSaved={(name) => setScreenName(name)}
        currentName={screenName}
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
