import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { FlashListRef } from '@shopify/flash-list';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { EmptyState, ScreenContainer } from '../../../src/components';
import { ReadingStreakIndicator } from '../../../src/components/badges/ReadingStreakIndicator';
import { CategoryStoryButtonsRef } from '../../../src/components/CategoryStoryButtons';
import { HomeListHeader, LocaleChangeOverlay } from '../../../src/components/home';
import { KeepReadingList } from '../../../src/components/home/KeepReadingList';
import { HomeQueueButton } from '../../../src/components/player/HomeQueueButton';
import { XStack, YStack } from '../../../src/components/Stacks';
import { queryClient } from '../../../src/config/queryClient';
import { useAudioQueue, usePremium, useScrollToTopHandler } from '../../../src/contexts';
import { localStateKeys } from '../../../src/hooks/queryKeys';
import { useHomeContentRefresh } from '../../../src/hooks/useHomeContentRefresh';
import { useHomeFeed } from '../../../src/hooks/useHomeFeed';
import { useHomeFeedEvents } from '../../../src/hooks/useHomeFeedEvents';
import { useKeepReading } from '../../../src/hooks/useKeepReading';
import { useReadingStreak } from '../../../src/hooks/useReadingStreak';
import { useTranslation } from '../../../src/i18n';
import {
  Screens,
  trackHomeFeedLoadMore,
  trackReadingStreakIndicatorTap,
  trackScreenView,
} from '../../../src/services/analytics';
import { refreshHomeContent } from '../../../src/services/contentRefresh';
import { openFactDetail } from '../../../src/services/factMorph';
import { useTheme } from '../../../src/theme';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { FactViewSource } from '../../../src/services/analytics';
import type { FactWithRelations } from '../../../src/services/database';

/**
 * Wires the iOS upper-left queue-player button into the home header WITHOUT
 * subscribing the heavy HomeScreen to audio state (this trivial component
 * absorbs the audio-state re-renders instead). headerLeft is set only while the
 * queue is non-empty — a headerLeft function that returns null still leaves an
 * empty native bar-button slot on iOS, so we hand back `undefined` to clear it
 * outright. Renders nothing.
 */
function HomeQueueHeaderSlot() {
  const navigation = useNavigation();
  const { queue } = useAudioQueue();
  const hasQueue = queue.length > 0;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    navigation.setOptions({
      headerLeft: hasQueue ? () => <HomeQueueButton /> : undefined,
    });
  }, [navigation, hasQueue]);

  return null;
}

/**
 * Home header-right cluster. The reading-streak flame is always shown; on
 * Android the queue-player mini control sits right next to it (iOS keeps that
 * control in the upper-left via HomeQueueHeaderSlot). HomeQueueButton self-hides
 * when the queue is empty and lives inside this small header component, so audio
 * state never re-renders the heavy HomeScreen.
 */
function HomeHeaderRight({
  streak,
  onStreakPress,
}: {
  streak: number;
  onStreakPress: () => void;
}) {
  const { spacing } = useResponsive();
  return (
    <XStack alignItems="center" gap={spacing.sm}>
      {Platform.OS === 'android' && <HomeQueueButton />}
      <ReadingStreakIndicator streak={streak} onPress={onStreakPress} />
    </XStack>
  );
}

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
  // headerRight pairs the streak flame with the queue-player mini control on
  // Android (see HomeHeaderRight). iOS keeps that control in the upper-left
  // (headerLeft) via <HomeQueueHeaderSlot/> below.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HomeHeaderRight
          streak={streak}
          onStreakPress={() => {
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

  // Silent stale-while-revalidate when home becomes visible or the app returns
  // to the foreground — no spinner, scroll untouched.
  useHomeContentRefresh(locale);

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

  // Focus effect: track the screen view. The feed is served on demand from the
  // API and cached by React Query, so there's no pending-refresh flag to consume.
  useFocusEffect(
    useCallback(() => {
      const idleId = requestIdleCallback(() => {
        trackScreenView(Screens.HOME);
      });
      return () => cancelIdleCallback(idleId);
    }, [])
  );

  // Fact press handler
  const handleFactPress = useCallback(
    (
      fact: FactWithRelations,
      source: FactViewSource,
      factIdList?: number[],
      indexInList?: number
    ) => {
      // Cards that registered a morph source on press-in open as the in-tab
      // overlay (the banner stays above); everything else uses the card route.
      openFactDetail(router, fact.id, { source, factIds: factIdList, currentIndex: indexInList });
    },
    [router]
  );

  // Pull-to-refresh — force a full refresh of the home content (feed, On This
  // Day, story buttons) plus the local reading streak, bypassing the age gate.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshHomeContent(locale, { source: 'pull', force: true }),
        queryClient.invalidateQueries({ queryKey: localStateKeys.readingStreak() }),
      ]);
    } catch {
      // Ignore
    }
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
      <HomeQueueHeaderSlot />

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
