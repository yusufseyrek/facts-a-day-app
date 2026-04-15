import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { FlashListRef } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { YStack } from 'tamagui';

import { EmptyState, LoadingContainer, ScreenContainer } from '../../src/components';
import { CategoryStoryButtonsRef } from '../../src/components/CategoryStoryButtons';
import { HomeHeader, HomeListHeader, LocaleChangeOverlay } from '../../src/components/home';
import { KeepReadingList } from '../../src/components/home/KeepReadingList';
import { PAYWALL_PROMPT } from '../../src/config/app';
import { queryClient } from '../../src/config/queryClient';
import { usePremium, useScrollToTopHandler } from '../../src/contexts';
import { homeKeys } from '../../src/hooks/queryKeys';
import { useHomeFeed } from '../../src/hooks/useHomeFeed';
import { useHomeFeedEvents } from '../../src/hooks/useHomeFeedEvents';
import { useKeepReading } from '../../src/hooks/useKeepReading';
import { useReadingStreak } from '../../src/hooks/useReadingStreak';
import { useTranslation } from '../../src/i18n';
import { Screens, trackFeedRefresh, trackScreenView } from '../../src/services/analytics';
import { isModalScreenActive } from '../../src/services/badges';
import { consumeFeedRefreshPending, forceRefreshContent } from '../../src/services/contentRefresh';
import { loadDailyFeedSections } from '../../src/services/dailyFeed';
import { clearGlobalProgress, setGlobalProgress } from '../../src/services/globalProgress';
import { preCacheOfflineImages } from '../../src/services/images';
import { shouldShowPaywall } from '../../src/services/paywallTiming';
import { hexColors, useTheme } from '../../src/theme';

import type { FactViewSource } from '../../src/services/analytics';
import type { FactWithRelations } from '../../src/services/database';

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { isPremium } = usePremium();

  // Data hooks
  const { latestFacts, latestFactIds, onThisDayFacts, onThisDayIsWeekFallback, isLoading } =
    useHomeFeed(locale);
  const { facts: keepReadingFacts, fetchNextPage, isFetchingNextPage } = useKeepReading(locale);
  const { streak } = useReadingStreak();

  // Local state
  const [refreshing, setRefreshing] = useState(false);

  // Refs
  const preCacheDateRef = useRef<string | null>(null);
  const paywallCheckRef = useRef(false);
  const keepReadingListRef = useRef<FlashListRef<any>>(null);
  const latestListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const onThisDayListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const storyButtonsRef = useRef<CategoryStoryButtonsRef>(null);

  const { backgroundRefreshStatus } = useHomeFeedEvents(locale, {
    latestListRef,
    onThisDayListRef,
  });

  // Scroll-to-top handler for tab re-tap
  useScrollToTopHandler(
    'index',
    useCallback(() => {
      keepReadingListRef.current?.scrollToOffset({ offset: 0, animated: true });
      latestListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, [])
  );

  // Focus effect: pending feed refresh, image pre-cache, paywall check
  useFocusEffect(
    useCallback(() => {
      if (consumeFeedRefreshPending()) {
        loadDailyFeedSections(locale, true).then((sections) => {
          queryClient.setQueryData(homeKeys.dailyFeed(locale), sections);
        });
      }

      const idleId = requestIdleCallback(() => {
        const today = getLocalDateString();
        if (preCacheDateRef.current !== today) {
          preCacheDateRef.current = today;
          preCacheOfflineImages(undefined, setGlobalProgress)
            .then(() => setTimeout(clearGlobalProgress, 1000))
            .catch(clearGlobalProgress);
        }
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
      if (factIdList && factIdList.length > 1 && indexInList !== undefined) {
        router.push(
          `/fact/${fact.id}?source=${source}&factIds=${JSON.stringify(factIdList)}&currentIndex=${indexInList}`
        );
      } else {
        router.push(`/fact/${fact.id}?source=${source}`);
      }
    },
    [router]
  );

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    trackFeedRefresh('pull');
    try {
      await forceRefreshContent();
    } catch {
      // Ignore
    }
    try {
      const sections = await loadDailyFeedSections(locale, true);
      queryClient.setQueryData(homeKeys.dailyFeed(locale), sections);
    } catch {
      // Ignore
    }
    queryClient.invalidateQueries({ queryKey: homeKeys.keepReading(locale) });
    queryClient.invalidateQueries({ queryKey: homeKeys.readingStreak() });
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

  const handleScroll = useCallback((_y: number) => {
    // Reserved for future scroll-dependent behavior (e.g. header collapse)
  }, []);

  const hasAnyContent = latestFacts.length > 0 || onThisDayFacts.length > 0;

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
    ]
  );

  return (
    <ScreenContainer edges={['top']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      <YStack flex={1}>
        {isLoading ? (
          <LoadingContainer>
            <ActivityIndicator size="large" color={hexColors[theme].primary} />
          </LoadingContainer>
        ) : !hasAnyContent ? (
          <EmptyState title={t('emptyStateTitle')} description={t('emptyStateDescription')} />
        ) : (
          <>
            <HomeHeader isPremium={isPremium} streak={streak} />

            <View style={{ flex: 1 }}>
              <KeepReadingList
                ref={keepReadingListRef}
                facts={keepReadingFacts}
                onFactPress={handleKeepReadingPress}
                onEndReached={fetchNextPage}
                isFetchingMore={isFetchingNextPage}
                isPremium={isPremium}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                onScroll={handleScroll}
                ListHeaderComponent={listHeader}
              />
            </View>
          </>
        )}

        <LocaleChangeOverlay status={backgroundRefreshStatus} />
      </YStack>
    </ScreenContainer>
  );
}

function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default HomeScreen;
