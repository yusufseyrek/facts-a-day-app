import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { FlashListRef } from '@shopify/flash-list';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { EmptyState, ScreenContainer } from '../../../src/components';
import { ReadingStreakIndicator } from '../../../src/components/badges/ReadingStreakIndicator';
import { CategoryStoryButtonsRef } from '../../../src/components/CategoryStoryButtons';
import { HomeListHeader, LocaleChangeOverlay } from '../../../src/components/home';
import { KeepReadingList } from '../../../src/components/home/KeepReadingList';
import { YStack } from '../../../src/components/Stacks';
import { PAYWALL_PROMPT } from '../../../src/config/app';
import { queryClient } from '../../../src/config/queryClient';
import { usePremium, useScrollToTopHandler } from '../../../src/contexts';
import { factKeys, localStateKeys, metadataKeys } from '../../../src/hooks/queryKeys';
import { useFocusFeedRefresh } from '../../../src/hooks/useFocusFeedRefresh';
import { useHomeFeed } from '../../../src/hooks/useHomeFeed';
import { useHomeFeedEvents } from '../../../src/hooks/useHomeFeedEvents';
import { useKeepReading } from '../../../src/hooks/useKeepReading';
import { useReadingStreak } from '../../../src/hooks/useReadingStreak';
import { useTranslation } from '../../../src/i18n';
import {
  Screens,
  trackFeedRefresh,
  trackHomeFeedLoadMore,
  trackReadingStreakIndicatorTap,
  trackScreenView,
} from '../../../src/services/analytics';
import { isModalScreenActive } from '../../../src/services/badges';
import { triggerFeedRefresh } from '../../../src/services/contentRefresh';
import { factDetailBasePath } from '../../../src/services/factMorph';
import { primePool } from '../../../src/services/nativeAdPool';
import { shouldShowPaywall } from '../../../src/services/paywallTiming';
import { useTheme } from '../../../src/theme';

import type { FactViewSource } from '../../../src/services/analytics';
import type { FactWithRelations } from '../../../src/services/database';

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { isPremium } = usePremium();

  // Data hooks
  const { latestFacts, latestFactIds, onThisDayFacts, onThisDayIsWeekFallback, isLoading } =
    useHomeFeed(locale);
  const {
    facts: keepReadingFacts,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useKeepReading(locale);
  const { streak } = useReadingStreak();

  // Reading streak lives in the native header (replaces the old HomeHeader row).
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <ReadingStreakIndicator
          streak={streak}
          onPress={() => {
            trackReadingStreakIndicatorTap({ streak });
            router.push('/stats');
          }}
        />
      ),
    });
  }, [navigation, streak, router]);

  // Local state
  const [refreshing, setRefreshing] = useState(false);

  // Refs
  const paywallCheckRef = useRef(false);
  const loadMorePageRef = useRef(0);
  const keepReadingListRef = useRef<FlashListRef<any>>(null);
  const latestListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const onThisDayListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const storyButtonsRef = useRef<CategoryStoryButtonsRef>(null);

  const { backgroundRefreshStatus } = useHomeFeedEvents(locale, {
    latestListRef,
    onThisDayListRef,
    outerListRef: keepReadingListRef,
  });

  // Silent stale-while-revalidate on every focus — no spinner, scroll untouched.
  useFocusFeedRefresh(locale);

  // Scroll-to-top handler for tab re-tap (Android only; iOS re-tap scrolls the
  // outer list natively — see the tabPress listener in (tabs)/_layout.tsx)
  useScrollToTopHandler(
    'index',
    useCallback(() => {
      keepReadingListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, [])
  );

  // Every home tab press (switch-to or re-tap, both platforms) scrolls the
  // horizontal rows — story buttons and the Latest carousel — back to start.
  useScrollToTopHandler(
    'index-horizontal',
    useCallback(() => {
      storyButtonsRef.current?.scrollToStart();
      latestListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, [])
  );

  // Focus effect: image pre-cache, paywall check. The feed is served on demand
  // from the API and cached by React Query, so there's no pending-refresh flag
  // to consume here anymore.
  useFocusEffect(
    useCallback(() => {
      primePool();

      const idleId = requestIdleCallback(() => {
        trackScreenView(Screens.HOME);
      });

      let timer: ReturnType<typeof setTimeout> | undefined;
      if (!isPremium && !paywallCheckRef.current) {
        timer = setTimeout(async () => {
          try {
            if (isModalScreenActive()) return;
            if (await shouldShowPaywall()) {
              paywallCheckRef.current = true;
              router.push('/paywall?source=auto');
            }
          } catch {
            // silently ignore
          }
        }, PAYWALL_PROMPT.DELAY_MS);
      }

      return () => {
        cancelIdleCallback(idleId);
        if (timer) clearTimeout(timer);
      };
    }, [locale, isPremium])
  );

  // Fact press handler
  const handleFactPress = useCallback(
    (
      fact: FactWithRelations,
      source: FactViewSource,
      factIdList?: number[],
      indexInList?: number
    ) => {
      // Cards that registered a morph source on press-in (ImageFactCard) open
      // via the card→detail morph; everything else keeps the card presentation.
      const base = factDetailBasePath(fact.id);
      if (factIdList && factIdList.length > 1 && indexInList !== undefined) {
        router.push(
          `${base}/${fact.id}?source=${source}&factIds=${JSON.stringify(factIdList)}&currentIndex=${indexInList}`
        );
      } else {
        router.push(`${base}/${fact.id}?source=${source}`);
      }
    },
    [router]
  );

  // Pull-to-refresh — re-fetch the on-demand feed sections from the API.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    trackFeedRefresh('pull');
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: factKeys.feed(locale) }),
        queryClient.invalidateQueries({ queryKey: factKeys.onThisDay(locale) }),
        queryClient.invalidateQueries({ queryKey: localStateKeys.readingStreak() }),
        // Story themes ride a separate cache fetched imperatively by the button
        // row, not a useQuery observer — so invalidating alone won't refetch it.
        // Mark it stale here, then triggerFeedRefresh re-runs loadCategories,
        // whose fetchQuery now sees the stale entry and hits the network.
        queryClient.invalidateQueries({ queryKey: metadataKeys.storyThemes(locale) }),
      ]);
    } catch {
      // Ignore
    }
    triggerFeedRefresh();
    setRefreshing(false);
  }, [locale]);

  // Keep Reading press handler
  const keepReadingIds = useMemo(() => keepReadingFacts.map((f) => f.id), [keepReadingFacts]);
  const handleKeepReadingPress = useCallback(
    (fact: FactWithRelations, index: number) => {
      handleFactPress(fact, 'home_keep_reading', keepReadingIds, index);
    },
    [handleFactPress, keepReadingIds]
  );

  // Infinite-scroll load-more. useKeepReading guards the actual fetch (only when
  // there's a next page and not already fetching), so mirror that guard here to
  // track only when a next page is really fetched.
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      loadMorePageRef.current += 1;
      trackHomeFeedLoadMore({
        pageIndex: loadMorePageRef.current,
        loadedCount: keepReadingFacts.length,
      });
    }
    fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, keepReadingFacts.length]);

  const handleScroll = useCallback((_y: number) => {
    // Reserved for future scroll-dependent behavior (e.g. header collapse)
  }, []);

  const hasAnyContent = latestFacts.length > 0 || onThisDayFacts.length > 0;

  // NOTE: the old "snap to offset 0 after first load" workaround is gone. The
  // drift it papered over was FlashList v2's default maintainVisibleContentPosition
  // anchoring (now disabled in KeepReadingList), and offset 0 is no longer the
  // true top under the translucent native header anyway.

  // Compose list header from extracted components (memoized to prevent FlashList re-layout)
  const listHeader = useMemo(
    () => (
      <HomeListHeader
        latestFacts={latestFacts}
        latestFactIds={latestFactIds}
        onThisDayFacts={onThisDayFacts}
        onThisDayIsWeekFallback={onThisDayIsWeekFallback}
        keepReadingCount={keepReadingFacts.length}
        isPremium={isPremium}
        onFactPress={handleFactPress}
        storyButtonsRef={storyButtonsRef}
        latestListRef={latestListRef}
        onThisDayListRef={onThisDayListRef}
        isLoading={isLoading}
      />
    ),
    [
      latestFacts,
      latestFactIds,
      onThisDayFacts,
      onThisDayIsWeekFallback,
      keepReadingFacts.length,
      isPremium,
      handleFactPress,
      isLoading,
    ]
  );

  return (
    <ScreenContainer edges={[]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      <YStack flex={1}>
        {!isLoading && !hasAnyContent ? (
          <EmptyState title={t('emptyStateTitle')} description={t('emptyStateDescription')} />
        ) : (
          <View style={{ flex: 1 }}>
            <KeepReadingList
              ref={keepReadingListRef}
              facts={keepReadingFacts}
              onFactPress={handleKeepReadingPress}
              onEndReached={handleEndReached}
              isFetchingMore={isFetchingNextPage}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onScroll={handleScroll}
              ListHeaderComponent={listHeader}
            />
          </View>
        )}

        <LocaleChangeOverlay status={backgroundRefreshStatus} />
      </YStack>
    </ScreenContainer>
  );
}

export default HomeScreen;
