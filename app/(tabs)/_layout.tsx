import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { GlobalProgressBar } from '../../src/components/GlobalProgressBar';
import { OfflinePaywallSheet } from '../../src/components/OfflinePaywallSheet';
import { useScrollToTop } from '../../src/contexts';
import { InsideTabsProvider } from '../../src/contexts/InsideTabsContext';
import { useOfflineAccess } from '../../src/hooks/useOfflineAccess';
import { useTranslation } from '../../src/i18n';
import * as triviaService from '../../src/services/trivia';
import { hexColors, useTheme } from '../../src/theme';

// Paths for jumping to a tab programmatically (keyed by the TAB_IDS values).
const TAB_PATHS: Record<string, string> = {
  index: '/',
  search: '/search',
  trivia: '/trivia',
  favorites: '/favorites',
  settings: '/settings',
};

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
    '(search)': 'search',
    trivia: 'trivia',
    '(favorites)': 'favorites',
    '(settings)': 'settings',
  };

  // iOS 26 Liquid Glass splits the role="search" tab into the standalone
  // trailing search button; while the search tab is active that button renders
  // as ✕ ("close search"). UIKit delivers the ✕ press as a REPEATED selection
  // of the search tab — react-native-screens blocks the native effect (it
  // interferes with JS-controlled tabs) and re-emits it as `tabPress`, so the
  // "return to where the user came from" policy has to be implemented here.
  // Track the last non-search TAB (guarded by TAB_PATHS so non-tab routes like
  // /fact/123 never get recorded) to know where ✕ should land.
  const router = useRouter();
  const useSeparatedSearchTab = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const lastNonSearchTabRef = useRef('index');
  useEffect(() => {
    if (currentTab !== 'search' && TAB_PATHS[currentTab]) {
      lastNonSearchTabRef.current = currentTab;
    }
  }, [currentTab]);

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
    <InsideTabsProvider value={true}>
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
              const tabId = TAB_IDS[route.name] ?? route.name;

              // iOS 26: a re-tap of the ACTIVE search tab is the separated
              // search button's ✕ — exit search mode by jumping back to the
              // tab the user was on (its stack/scroll state is preserved by
              // the native tabs, so home resumes exactly where it was).
              if (
                useSeparatedSearchTab &&
                tabId === 'search' &&
                currentTab === 'search'
              ) {
                router.navigate(TAB_PATHS[lastNonSearchTabRef.current] ?? '/');
                return;
              }

              // Android only below: iOS re-tap scrolls natively, and UIKit lands
              // at the ADJUSTED top (negative offset under the translucent
              // large-title header). The JS handlers scroll to offset 0, which is
              // BELOW that — they'd override the native scroll and cut off the
              // list header.
              if (Platform.OS !== 'android') return;
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

          {/* role="search" splits this tab into the standalone trailing search
            button next to the Liquid Glass bar on iOS 26; Android ignores the
            role and keeps a regular tab (hence the explicit icon/label). */}
          <NativeTabs.Trigger name="(search)" role="search">
            <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
            <NativeTabs.Trigger.Label>{t('search')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          {/* Android: an empty <Badge /> reaches rn-screens as badgeValue ' '
            (space), which Material renders as an oversized TEXT badge; only
            the literal '' takes the small-dot path, so override it natively.
            iOS keeps the plain Badge child. */}
          <NativeTabs.Trigger
            name="trivia"
            unstable_nativeProps={
              Platform.OS === 'android' && hasDailyTrivia ? { badgeValue: '' } : undefined
            }
          >
            <NativeTabs.Trigger.Icon sf="brain" md="psychology" />
            <NativeTabs.Trigger.Label>{t('trivia')}</NativeTabs.Trigger.Label>
            {/* Empty badge renders as a dot when daily trivia is available */}
            {hasDailyTrivia ? <NativeTabs.Trigger.Badge /> : null}
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="(favorites)">
            <NativeTabs.Trigger.Icon
              sf={{ default: 'heart', selected: 'heart.fill' }}
              md="favorite"
            />
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
    </InsideTabsProvider>
  );
}
