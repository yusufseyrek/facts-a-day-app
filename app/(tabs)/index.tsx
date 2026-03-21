import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Lightbulb } from '@tamagui/lucide-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { YStack } from 'tamagui';

import {
  EmptyState,
  LoadingContainer,
  ScreenContainer,
  ScreenHeader,
  Text,
} from '../../src/components';
import { InlineNativeAd } from '../../src/components/ads/InlineNativeAd';
import { ReadingStreakIndicator } from '../../src/components/badges/ReadingStreakIndicator';
import { CategoryStoryButtons, CategoryStoryButtonsRef } from '../../src/components/CategoryStoryButtons';
import { ImageFactCard } from '../../src/components/ImageFactCard';
import { PopularFactCard } from '../../src/components/PopularFactCard';
import { ADS_ENABLED, LAYOUT, PAYWALL_PROMPT } from '../../src/config/app';
import { signalFeedLoaded, usePreloadedData, usePremium, useScrollToTopHandler } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackCarouselSwipe,
  trackFeedRefresh,
  trackScreenView,
} from '../../src/services/analytics';
import { getReadingStreak, isModalScreenActive } from '../../src/services/badges';
import {
  forceRefreshContent,
  getRefreshStatus,
  onFeedRefresh,
  consumeFeedRefreshPending,
  onRefreshStatusChange,
  RefreshStatus,
} from '../../src/services/contentRefresh';
import { loadDailyFeedSections } from '../../src/services/dailyFeed';
import { preCacheOfflineImages } from '../../src/services/images';
import { onNetworkChange } from '../../src/services/network';
import { shouldShowPaywall } from '../../src/services/paywallTiming';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactViewSource } from '../../src/services/analytics';
import type { FactWithRelations } from '../../src/services/database';

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { isPremium } = usePremium();
  const { spacing, typography, config, screenWidth, iconSizes } = useResponsive();
  const { signalHomeScreenReady } = usePreloadedData();

  const [freshFacts, setFreshFacts] = useState<FactWithRelations[]>([]);
  const [worthKnowingFacts, setWorthKnowingFacts] = useState<FactWithRelations[]>([]);
  const [onThisDayFacts, setOnThisDayFacts] = useState<FactWithRelations[]>([]);
  const [onThisDayIsWeekFallback, setOnThisDayIsWeekFallback] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [readingStreak, setReadingStreak] = useState(0);
  const [backgroundRefreshStatus, setBackgroundRefreshStatus] = useState<RefreshStatus>(() =>
    getRefreshStatus()
  );
  const [preCacheProgress, setPreCacheProgress] = useState<number | null>(null);
  const preCacheWidth = useSharedValue(0);

  useEffect(() => {
    if (preCacheProgress !== null) {
      preCacheWidth.value = withTiming(preCacheProgress * 100, { duration: 300 });
    } else {
      preCacheWidth.value = 0;
    }
  }, [preCacheProgress]);

  const preCacheBarStyle = useAnimatedStyle(() => ({
    width: `${preCacheWidth.value}%` as any,
  }));

  const preCacheDateRef = useRef<string | null>(null);
  const paywallCheckRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const freshFactsListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const worthKnowingListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const onThisDayListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const storyButtonsRef = useRef<CategoryStoryButtonsRef>(null);
  const scrollYRef = useRef(0);

  // Register scroll-to-top handler
  useScrollToTopHandler(
    'index',
    useCallback(() => {
      if (scrollYRef.current <= 0) {
        // Already at top — reset carousels to index 0
        freshFactsListRef.current?.scrollToOffset({ offset: 0, animated: true });
        worthKnowingListRef.current?.scrollToOffset({ offset: 0, animated: true });
        onThisDayListRef.current?.scrollToOffset({ offset: 0, animated: true });
        storyButtonsRef.current?.scrollToStart();
      } else {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      // Force-refresh if preferences changed while away, otherwise only load if empty
      const forceRefresh = consumeFeedRefreshPending();
      console.log(`📋 [HomeScreen] useFocusEffect fired: forceRefresh=${forceRefresh}, onlyIfEmpty=${!forceRefresh}`);
      loadFeedSections(!forceRefresh, forceRefresh).then(() => {
        const today = getLocalDateString();
        if (preCacheDateRef.current !== today) {
          preCacheDateRef.current = today;
          preCacheOfflineImages(undefined, setPreCacheProgress)
            .then(() => setTimeout(() => setPreCacheProgress(null), 1000))
            .catch(() => setPreCacheProgress(null));
        }
      });
      getReadingStreak()
        .then(setReadingStreak)
        .catch(() => {});
      trackScreenView(Screens.HOME);

      // Auto-show paywall for free users (once every N days)
      if (!isPremium && !paywallCheckRef.current) {
        const timer = setTimeout(async () => {
          try {
            if (isModalScreenActive()) return;
            const should = await shouldShowPaywall();
            if (should) {
              paywallCheckRef.current = true;
              router.push('/paywall?source=auto');
            }
          } catch {
            // silently ignore paywall check errors
          }
        }, PAYWALL_PROMPT.DELAY_MS);
        return () => clearTimeout(timer);
      }
    }, [locale, t, isPremium])
  );

  // Auto-refresh feed when facts change (content sync, preference changes)
  useEffect(() => {
    const unsubscribe = onFeedRefresh(async () => {
      await loadFeedSections(false, true);
      // Reset carousel scroll positions so indices match visible items
      freshFactsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      worthKnowingListRef.current?.scrollToOffset({ offset: 0, animated: false });
      onThisDayListRef.current?.scrollToOffset({ offset: 0, animated: false });
      signalFeedLoaded();
    });
    return () => unsubscribe();
  }, []);

  // Pre-cache images when network comes back online
  useEffect(() => {
    const unsubscribe = onNetworkChange((connected) => {
      if (connected) {
        preCacheOfflineImages(undefined, setPreCacheProgress)
          .then(() => setTimeout(() => setPreCacheProgress(null), 1000))
          .catch(() => setPreCacheProgress(null));
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to background refresh status
  useEffect(() => {
    const unsubscribe = onRefreshStatusChange(setBackgroundRefreshStatus);
    return () => unsubscribe();
  }, []);

  // Signal home screen ready when showing empty state
  useEffect(() => {
    if (!initialLoading && freshFacts.length === 0 && onThisDayFacts.length === 0) {
      signalHomeScreenReady();
    }
  }, [initialLoading, freshFacts.length, onThisDayFacts.length, signalHomeScreenReady]);

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

  // onlyIfEmpty: skip update if section already has data (prevents reshuffling on tab focus)
  // Uses daily feed cache to lock sections for the day (consistent offline experience)
  const loadFeedSections = useCallback(
    async (onlyIfEmpty?: boolean, forceRefresh?: boolean) => {
      try {
        const {
          freshFacts: fresh,
          worthKnowing,
          onThisDay,
          onThisDayIsWeekFallback: isWeek,
        } = await loadDailyFeedSections(locale, forceRefresh);
        console.log(`📋 [HomeScreen] loadFeedSections result: fresh=${fresh.length}, worthKnowing=${worthKnowing.length}, onThisDay=${onThisDay.length}, onlyIfEmpty=${onlyIfEmpty}`);
        if (onlyIfEmpty) {
          setFreshFacts((prev) => (prev.length > 0 ? prev : fresh));
          setWorthKnowingFacts((prev) => (prev.length > 0 ? prev : worthKnowing));
          setOnThisDayFacts((prev) => {
            if (prev.length > 0) return prev;
            setOnThisDayIsWeekFallback(isWeek);
            return onThisDay;
          });
        } else {
          setFreshFacts(fresh);
          setWorthKnowingFacts(worthKnowing);
          setOnThisDayFacts(onThisDay);
          setOnThisDayIsWeekFallback(isWeek);
        }
      } catch (error) {
        console.error('📋 [HomeScreen] loadFeedSections ERROR:', error);
      } finally {
        setInitialLoading(false);
      }
    },
    [locale]
  );



  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    trackFeedRefresh('pull');
    try {
      await forceRefreshContent();
    } catch {
      // Ignore refresh errors
    }
    // Reload from cache — don't force-refresh, which would re-roll random sections.
    // If new facts were synced, refreshAppContent() already emits feedRefresh
    // which triggers a force-refresh via the onFeedRefresh listener.
    await loadFeedSections(false, false);
    setRefreshing(false);
  }, [loadFeedSections]);

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />,
    [refreshing, handleRefresh]
  );

  const colors = hexColors[theme];

  // On tablets, cap content width to MAX_CONTENT_WIDTH (matches ContentContainer)
  const contentWidth = Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH);
  // Horizontal inset so FlashList cards align within content area (centers on tablets)
  const listInset = (screenWidth - contentWidth) / 2 + spacing.md;

  // Carousel card sizing
  const isWideScreen = screenWidth > LAYOUT.MAX_CONTENT_WIDTH;
  const carouselCardWidth = isWideScreen
    ? contentWidth - spacing.lg * 2
    : contentWidth * config.cardWidthMultiplier;
  const carouselCardGap = spacing.sm;
  const carouselSnapInterval = carouselCardWidth + carouselCardGap;

  // Fresh Facts section (1:1 square cards)
  const freshFactsCardHeight = carouselCardWidth; // 1:1 aspect ratio
  const freshFactsIds = useMemo(() => freshFacts.map((f) => f.id), [freshFacts]);

  const freshFactsActiveIndexRef = useRef(0);
  const handleFreshFactsScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / carouselSnapInterval);
      if (index !== freshFactsActiveIndexRef.current) {
        freshFactsActiveIndexRef.current = index;
        trackCarouselSwipe({
          section: 'fresh_facts',
          index,
          factId: freshFacts[index]?.id,
        });
      }
    },
    [carouselSnapInterval, freshFacts]
  );

  const renderFreshFactsItem = useCallback(
    ({ item }: { item: FactWithRelations }) => {
      const factIndex = freshFactsIds.indexOf(item.id);
      return (
        <View style={{ width: carouselCardWidth, paddingBottom: spacing.md }}>
          <ImageFactCard
            title={item.title || item.content.substring(0, 80) + '...'}
            imageUrl={item.image_url!}
            factId={item.id}
            category={item.categoryData || item.category}
            categorySlug={item.categoryData?.slug || item.category}
            onPress={() => handleFactPress(item, 'home_fresh_facts', freshFactsIds, factIndex)}
            cardWidth={carouselCardWidth}
            aspectRatio={1}
          />
        </View>
      );
    },
    [carouselCardWidth, handleFactPress, freshFactsIds, spacing.md]
  );

  const freshFactsKeyExtractor = useCallback((item: FactWithRelations) => `fresh-${item.id}`, []);

  // On This Day section (PopularFactCard thumbnail cards)
  const onThisDayIds = useMemo(() => onThisDayFacts.map((f) => f.id), [onThisDayFacts]);
  const onThisDayListHeight = iconSizes.heroLg + spacing.md * 2 + spacing.md * 2;

  const onThisDayActiveIndexRef = useRef(0);
  const handleOnThisDayScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / carouselSnapInterval);
      if (index !== onThisDayActiveIndexRef.current) {
        onThisDayActiveIndexRef.current = index;
        trackCarouselSwipe({
          section: 'on_this_day',
          index,
          factId: onThisDayFacts[index]?.id,
        });
      }
    },
    [carouselSnapInterval, onThisDayFacts]
  );

  const renderOnThisDayItem = useCallback(
    ({ item, index }: { item: FactWithRelations; index: number }) => (
      <View style={{ paddingBottom: spacing.md }}>
        <PopularFactCard
          fact={item}
          cardWidth={carouselCardWidth}
          onPress={() => handleFactPress(item, 'home_on_this_day', onThisDayIds, index)}
        />
      </View>
    ),
    [carouselCardWidth, handleFactPress, onThisDayIds, spacing.md]
  );

  const onThisDayKeyExtractor = useCallback((item: FactWithRelations) => `otd-${item.id}`, []);

  // Worth Knowing section (3:2 image cards)
  const worthKnowingCardHeight = carouselCardWidth * (2 / 3);
  const worthKnowingIds = useMemo(() => worthKnowingFacts.map((f) => f.id), [worthKnowingFacts]);

  const worthKnowingActiveIndexRef = useRef(0);
  const handleWorthKnowingScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / carouselSnapInterval);
      if (index !== worthKnowingActiveIndexRef.current) {
        worthKnowingActiveIndexRef.current = index;
        trackCarouselSwipe({
          section: 'worth_knowing',
          index,
          factId: worthKnowingFacts[index]?.id,
        });
      }
    },
    [carouselSnapInterval, worthKnowingFacts]
  );

  const renderWorthKnowingItem = useCallback(
    ({ item }: { item: FactWithRelations }) => {
      const factIndex = worthKnowingIds.indexOf(item.id);
      return (
        <View style={{ width: carouselCardWidth, paddingBottom: spacing.md }}>
          <ImageFactCard
            title={item.title || item.content.substring(0, 80) + '...'}
            imageUrl={item.image_url!}
            factId={item.id}
            category={item.categoryData || item.category}
            categorySlug={item.categoryData?.slug || item.category}
            onPress={() => handleFactPress(item, 'home_worth_knowing', worthKnowingIds, factIndex)}
            cardWidth={carouselCardWidth}
            aspectRatio={3 / 2}
          />
        </View>
      );
    },
    [carouselCardWidth, handleFactPress, worthKnowingIds, spacing.md]
  );

  const worthKnowingKeyExtractor = useCallback((item: FactWithRelations) => `wk-${item.id}`, []);

  // Separator for horizontal FlashLists
  const carouselSeparator = useCallback(
    () => <View style={{ width: carouselCardGap }} />,
    [carouselCardGap]
  );

  // Loading state
  if (initialLoading && freshFacts.length === 0) {
    return (
      <ScreenContainer edges={['top']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={hexColors.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  const hasFreshFacts = freshFacts.length > 0;
  const hasWorthKnowingFacts = worthKnowingFacts.length > 0;
  const hasOnThisDayFacts = onThisDayFacts.length > 0;
  const hasAnyContent = hasFreshFacts || hasWorthKnowingFacts || hasOnThisDayFacts;

  return (
    <ScreenContainer edges={['top']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      <YStack flex={1}>
        {!hasAnyContent ? (
          <EmptyState title={t('emptyStateTitle')} description={t('emptyStateDescription')} />
        ) : (
          <>
            {/* Title - fixed above scroll */}
            <Animated.View entering={FadeIn.duration(300)}>
              <ScreenHeader
                icon={<Lightbulb size={iconSizes.lg} color={colors.primary} />}
                title={t('appName')}
                paddingBottom={spacing.sm}
                rightElement={
                  <ReadingStreakIndicator
                    streak={readingStreak}
                    onPress={() => router.push('/badges')}
                  />
                }
              />
            </Animated.View>

            <ScrollView
              ref={scrollViewRef}
              refreshControl={refreshControl}
              showsVerticalScrollIndicator={false}
              onScroll={(e) => {
                scrollYRef.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
            >
              {/* Category Story Buttons */}
              <YStack paddingBottom={spacing.lg}>
                <CategoryStoryButtons ref={storyButtonsRef} />
              </YStack>

              {/* Fresh Facts Section (1:1 square carousel) */}
              {hasFreshFacts && (
                <>
                  <YStack
                    width="100%"
                    maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
                    alignSelf="center"
                    paddingHorizontal={spacing.lg}
                    paddingBottom={spacing.sm}
                  >
                    <Text.Title fontSize={typography.fontSize.body}>{t('newlyAdded')}</Text.Title>
                  </YStack>

                  <View
                    style={{
                      height: freshFactsCardHeight + spacing.xxl,
                      width: '100%',
                    }}
                  >
                    <FlashList
                      ref={freshFactsListRef}
                      data={freshFacts}
                      renderItem={renderFreshFactsItem}
                      keyExtractor={freshFactsKeyExtractor}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={carouselSnapInterval}
                      decelerationRate="fast"
                      disableIntervalMomentum
                      ItemSeparatorComponent={carouselSeparator}
                      contentContainerStyle={{
                        paddingHorizontal: listInset,
                      }}
                      drawDistance={carouselCardWidth}
                      onScroll={handleFreshFactsScroll}
                      scrollEventThrottle={16}
                    />
                  </View>
                </>
              )}

              {/* Inline ad between sections */}
              {ADS_ENABLED && !isPremium && hasFreshFacts && (
                <YStack
                  width="100%"
                  maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
                  alignSelf="center"
                  paddingHorizontal={spacing.lg}
                  paddingBottom={spacing.md}
                >
                  <InlineNativeAd />
                </YStack>
              )}

              {/* On This Day Section (thumbnail cards) */}
              {hasOnThisDayFacts && (
                <>
                  <YStack
                    width="100%"
                    maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
                    alignSelf="center"
                    paddingHorizontal={spacing.lg}
                    paddingVertical={spacing.sm}
                  >
                    <Text.Title fontSize={typography.fontSize.body}>
                      {onThisDayIsWeekFallback ? t('thisWeekInHistory') : t('onThisDay')}
                    </Text.Title>
                  </YStack>

                  <View
                    style={{
                      height: onThisDayListHeight,
                      width: '100%',
                    }}
                  >
                    <FlashList
                      ref={onThisDayListRef}
                      data={onThisDayFacts}
                      renderItem={renderOnThisDayItem}
                      keyExtractor={onThisDayKeyExtractor}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={carouselSnapInterval}
                      decelerationRate="fast"
                      disableIntervalMomentum
                      ItemSeparatorComponent={carouselSeparator}
                      contentContainerStyle={{
                        paddingHorizontal: listInset,
                      }}
                      drawDistance={carouselCardWidth}
                      onScroll={handleOnThisDayScroll}
                      scrollEventThrottle={16}
                    />
                  </View>
                </>
              )}

              {/* Worth Knowing Section (3:2 carousel) */}
              {hasWorthKnowingFacts && (
                <>
                  <YStack
                    width="100%"
                    maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
                    alignSelf="center"
                    paddingHorizontal={spacing.lg}
                    paddingVertical={spacing.sm}
                  >
                    <Text.Title fontSize={typography.fontSize.body}>{t('worthKnowing')}</Text.Title>
                  </YStack>

                  <View
                    style={{
                      height: worthKnowingCardHeight + spacing.md * 2 + spacing.sm,
                      width: '100%',
                    }}
                  >
                    <FlashList
                      ref={worthKnowingListRef}
                      data={worthKnowingFacts}
                      renderItem={renderWorthKnowingItem}
                      keyExtractor={worthKnowingKeyExtractor}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={carouselSnapInterval}
                      decelerationRate="fast"
                      disableIntervalMomentum
                      ItemSeparatorComponent={carouselSeparator}
                      contentContainerStyle={{
                        paddingHorizontal: listInset,
                      }}
                      drawDistance={carouselCardWidth}
                      onScroll={handleWorthKnowingScroll}
                      scrollEventThrottle={16}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </>
        )}

        {backgroundRefreshStatus === 'locale-change' && (
          <YStack
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            justifyContent="center"
            alignItems="center"
            backgroundColor="$background"
            zIndex={100}
            gap={spacing.lg}
          >
            <ActivityIndicator size="large" color={hexColors[theme].primary} />
            <Text.Body color="$textSecondary">{t('updatingLanguage')}</Text.Body>
          </YStack>
        )}

        {/* Image pre-cache progress bar */}
        {preCacheProgress !== null && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(400)}
            style={{
              height: 2,
              backgroundColor: colors.border,
            }}
          >
            <Animated.View
              style={[
                {
                  height: 2,
                  backgroundColor: colors.primary,
                },
                preCacheBarStyle,
              ]}
            />
          </Animated.View>
        )}
      </YStack>
    </ScreenContainer>
  );
}

// Helper to get local date string in YYYY-MM-DD format
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default HomeScreen;
