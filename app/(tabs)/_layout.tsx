import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFocusEffect, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { PersistentTabBarBanner } from '../../src/components/ads/PersistentTabBarBanner';
import { FactMorphOverlayHost } from '../../src/components/factMorph/FactMorphOverlayHost';
import { GlobalProgressBar } from '../../src/components/GlobalProgressBar';
import { useScrollToTop } from '../../src/contexts';
import { InsideTabsProvider } from '../../src/contexts/InsideTabsContext';
import { useTranslation } from '../../src/i18n';
import { emitSearchSessionReset, setLastNonSearchTabPath } from '../../src/services/tabHistory';
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

  // Record the last non-search tab for the iOS 26 search-exit flow (the search
  // screen's ✕/cancel handler navigates back to it — see tabHistory.ts for why
  // the tab bar itself never sees the ✕ press). Guarded by TAB_PATHS so non-tab
  // routes like /fact/123 are never recorded.
  //
  // Also ends the search session when the user leaves the search tab for a
  // real tab: the search screen clears its query/category scope so the next
  // entry targets ALL facts. Leaving to a non-tab route (a fact opened from
  // results) keeps the session — returning from it must not lose the browse.
  const prevTabRef = useRef(currentTab);
  useEffect(() => {
    const prevTab = prevTabRef.current;
    prevTabRef.current = currentTab;
    if (currentTab !== 'search' && TAB_PATHS[currentTab]) {
      setLastNonSearchTabPath(TAB_PATHS[currentTab]);
      if (prevTab === 'search') {
        emitSearchSessionReset();
      }
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
              // Every home press (switch-to or re-tap, both platforms) resets
              // the horizontal rows (story buttons, Latest carousel) to start.
              // Horizontal only, so it never conflicts with the native iOS
              // vertical re-tap scroll.
              if (tabId === 'index') {
                scrollToTop('index-horizontal');
              }
              // Android only: iOS re-tap scrolls natively, and UIKit lands at the
              // ADJUSTED top (negative offset under the translucent large-title
              // header). The JS handlers scroll to offset 0, which is BELOW that
              // — they'd override the native scroll and cut off the list header.
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

          <NativeTabs.Trigger name="(search)">
            <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
            <NativeTabs.Trigger.Label>{t('search')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          {/* Trivia, the prominent action. On iOS 26 role="search" splits it into
            the standalone trailing button next to the Liquid Glass bar, and UIKit
            pins that button to the trailing edge regardless of where the trigger
            sits here. On Android the role is ignored and the trigger renders in
            this JSX slot, so keeping it third of five centers Trivia in the
            Material bottom bar.
            Android badge: an empty <Badge /> reaches rn-screens as badgeValue
            ' ' (space), which Material renders as an oversized TEXT badge; only
            the literal '' takes the small-dot path, so override it natively. */}
          <NativeTabs.Trigger
            name="trivia"
            role="search"
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

        {/* Fact-detail morph, hosted here (below the banner) so the banner
          stays continuous across feed → fact detail instead of being covered
          by a native modal. Renders nothing until a card opens a fact. */}
        <FactMorphOverlayHost />

        {/* Fixed ad banner pinned above the native tab bar; persists across tab
          switches (rendered here, not per screen). Self-positioning. */}
        <PersistentTabBarBanner />
      </View>
    </InsideTabsProvider>
  );
}
