import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFocusEffect, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { GlobalProgressBar } from '../../src/components/GlobalProgressBar';
import { OfflinePaywallSheet } from '../../src/components/OfflinePaywallSheet';
import { useScrollToTop } from '../../src/contexts';
import { useOfflineAccess } from '../../src/hooks/useOfflineAccess';
import { useTranslation } from '../../src/i18n';
import * as triviaService from '../../src/services/trivia';
import { hexColors, useTheme } from '../../src/theme';

export default function TabLayout() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const insets = useSafeAreaInsets();
  const { shouldShowOfflineGate } = useOfflineAccess();
  const { scrollToTop } = useScrollToTop();
  const [hasDailyTrivia, setHasDailyTrivia] = useState(false);

  // Current tab from the pathname ("/discover" -> "discover", "/" -> "index"),
  // used to detect re-taps for the JS scroll-to-top contract (Android has no
  // native re-tap scroll-to-top; iOS does both natively and via this, same end
  // state).
  const pathname = usePathname();
  const currentTab = pathname.replace(/^\/(tabs\/)?/, '').split('/')[0] || 'index';

  // Tab routes are groups (so each tab hosts a native-header Stack while URLs
  // stay unchanged); map group route names to the ids the scroll-to-top
  // handlers registered under.
  const TAB_IDS: Record<string, string> = {
    '(home)': 'index',
    '(discover)': 'discover',
    trivia: 'trivia',
    '(favorites)': 'favorites',
    '(settings)': 'settings',
  };

  // Check for daily trivia availability
  const checkDailyTrivia = useCallback(async () => {
    try {
      const [questionsCount, isCompleted] = await Promise.all([
        triviaService.getDailyTriviaQuestionsCount(locale),
        triviaService.isDailyTriviaCompleted(),
      ]);
      setHasDailyTrivia(questionsCount > 0 && !isCompleted);
    } catch {
      // Ignore trivia check errors
    }
  }, [locale]);

  // Check on mount and periodically
  useEffect(() => {
    checkDailyTrivia();
    // Check every 30 seconds in case new facts are shown
    const interval = setInterval(checkDailyTrivia, 30000);
    return () => clearInterval(interval);
  }, [checkDailyTrivia]);

  // Also check when tab is focused
  useFocusEffect(
    useCallback(() => {
      checkDailyTrivia();
    }, [checkDailyTrivia])
  );

  const isDark = theme === 'dark';
  const colors = hexColors[theme];
  // Use neon cyan for active tab - subtle but visible
  const activeTintColor = colors.primary;
  const inactiveTintColor = colors.textSecondary;

  return (
    <View style={{ flex: 1 }}>
      {/* Native tab bar: true Liquid Glass floating bar on iOS 26 (minimizes on
          scroll), system bar on older iOS, Material 3 bottom navigation on
          Android. Re-tap natively pops the tab's stack to root and scrolls the
          first scroll view to top on iOS; the JS listener below keeps the
          existing scroll-to-top contract working on Android too. */}
      <NativeTabs
        tintColor={activeTintColor}
        iconColor={inactiveTintColor}
        labelStyle={{
          default: { color: inactiveTintColor },
          selected: { color: activeTintColor },
        }}
        badgeBackgroundColor={colors.neonRed}
        minimizeBehavior="onScrollDown"
        backgroundColor={Platform.OS === 'android' ? colors.surface : undefined}
        rippleColor={isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}
        indicatorColor={isDark ? colors.neutralLight : colors.primaryLight}
        labelVisibilityMode="labeled"
        screenListeners={({ route }) => ({
          tabPress: () => {
            // Android only: iOS re-tap scrolls natively, and UIKit lands at the
            // ADJUSTED top (negative offset under the translucent large-title
            // header). The JS handlers scroll to offset 0, which is BELOW that
            // — they'd override the native scroll and cut off the list header.
            if (Platform.OS !== 'android') return;
            const tabId = TAB_IDS[route.name] ?? route.name;
            if (tabId === currentTab) {
              scrollToTop(tabId);
            }
          },
        })}
      >
        <NativeTabs.Trigger name="(home)">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'lightbulb', selected: 'lightbulb.fill' }}
            md="lightbulb"
          />
          <NativeTabs.Trigger.Label>{t('home')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(discover)">
          <NativeTabs.Trigger.Icon sf={{ default: 'safari', selected: 'safari.fill' }} md="explore" />
          <NativeTabs.Trigger.Label>{t('discover')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="trivia">
          <NativeTabs.Trigger.Icon sf="brain" md="psychology" />
          <NativeTabs.Trigger.Label>{t('trivia')}</NativeTabs.Trigger.Label>
          {/* Empty badge renders as a dot when daily trivia is available */}
          {hasDailyTrivia ? <NativeTabs.Trigger.Badge /> : null}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(favorites)">
          <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} md="favorite" />
          <NativeTabs.Trigger.Label>{t('favorites')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(settings)">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
            md="settings"
          />
          <NativeTabs.Trigger.Label>{t('settings')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>

      {/* Global progress strip: previously composed above the JS tab bar; the
          native bar can't host JS children, so it now floats under the status
          bar (renders null when idle). */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: insets.top, left: 0, right: 0, zIndex: 500 }}
      >
        <GlobalProgressBar />
      </View>

      {shouldShowOfflineGate && <OfflinePaywallSheet />}
    </View>
  );
}
