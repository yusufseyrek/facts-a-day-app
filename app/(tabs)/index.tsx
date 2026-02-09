import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { FlashList } from '@shopify/flash-list';
import { Lightbulb } from '@tamagui/lucide-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { YStack } from 'tamagui';

import {
  ContentContainer,
  EmptyState,
  LoadingContainer,
  ScreenContainer,
  ScreenHeader,
  Text,
} from '../../src/components';
import { NativeAdCard } from '../../src/components/ads/NativeAdCard';
import { CategoryStoryButtons } from '../../src/components/CategoryStoryButtons';
import { ImageFactCard } from '../../src/components/ImageFactCard';
import { PopularFactCard } from '../../src/components/PopularFactCard';
import { HOME_FEED, LAYOUT, NATIVE_ADS } from '../../src/config/app';
import { usePreloadedData, usePremium, useScrollToTopHandler } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackFeedRefresh,
  trackScreenView,
} from '../../src/services/analytics';

import type { FactViewSource } from '../../src/services/analytics';
import {
  forceRefreshContent,
  getRefreshStatus,
  onFeedRefresh,
  onRefreshStatusChange,
  RefreshStatus,
} from '../../src/services/contentRefresh';
import * as database from '../../src/services/database';
import { prefetchFactImage, prefetchFactImagesWithLimit } from '../../src/services/images';
import { onPreferenceFeedRefresh } from '../../src/services/preferences';
import { hexColors, useTheme } from '../../src/theme';
import {
  insertNativeAds,
  isNativeAdPlaceholder,
  type NativeAdPlaceholder,
} from '../../src/utils/insertNativeAds';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactWithRelations } from '../../src/services/database';

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { isPremium } = usePremium();
  const { spacing, typography, config, screenWidth, iconSizes } = useResponsive();
  const {
    consumePreloadedFacts,
    consumePreloadedRecommendations,
    signalHomeScreenReady,
    signalCarouselImageReady,
  } = usePreloadedData();

  const [todaysFacts, setTodaysFacts] = useState<FactWithRelations[]>([]);
  const [popularFacts, setPopularFacts] = useState<FactWithRelations[]>([]);
  const [worthKnowingFacts, setWorthKnowingFacts] = useState<FactWithRelations[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundRefreshStatus, setBackgroundRefreshStatus] = useState<RefreshStatus>(() =>
    getRefreshStatus()
  );

  // Track if we've consumed preloaded data (only once)
  const consumedPreloadedDataRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Register scroll-to-top handler
  useScrollToTopHandler(
    'index',
    useCallback(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, [])
  );

  // Reload facts when tab gains focus
  useFocusEffect(
    useCallback(() => {
      // On first mount, try to use preloaded data from splash screen
      if (!consumedPreloadedDataRef.current) {
        consumedPreloadedDataRef.current = true;
        const preloadedFacts = consumePreloadedFacts();
        const preloadedRecs = consumePreloadedRecommendations();
        if (preloadedFacts && preloadedFacts.length > 0) {
          // Filter today's facts from preloaded data
          const todayStr = getLocalDateString();
          const todayItems = preloadedFacts.filter((fact) => {
            if (fact.scheduled_date) {
              const factDate = getLocalDateString(new Date(fact.scheduled_date));
              return factDate === todayStr;
            }
            return fact.shown_in_feed === 1;
          });
          setTodaysFacts(todayItems.length > 0 ? todayItems : []);
          setInitialLoading(false);
          // Use preloaded recommendations: split between popular carousel and worth knowing
          if (preloadedRecs && preloadedRecs.length > 0) {
            setPopularFacts(preloadedRecs.slice(0, HOME_FEED.POPULAR_COUNT));
            setWorthKnowingFacts(preloadedRecs.slice(HOME_FEED.POPULAR_COUNT));
          }
          signalHomeScreenReady();
          trackScreenView(Screens.HOME);
          return;
        }
      }
      // Fall back to normal loading
      loadTodaysFacts();
      trackScreenView(Screens.HOME);
    }, [locale, t, consumePreloadedFacts])
  );

  // Auto-refresh feed when new notifications are received
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(async (notification) => {
      const factId = notification.request.content.data.factId;
      if (factId) {
        try {
          await database.markFactAsShown(factId as number);
          const { syncNotificationSchedule } = await import('../../src/services/notifications');
          const { getLocaleFromCode } = await import('../../src/i18n');
          const Localization = await import('expo-localization');
          const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
          await syncNotificationSchedule(getLocaleFromCode(deviceLocale));
        } catch {
          // Ignore notification setup errors
        }
        loadTodaysFacts();
      }
    });
    return () => subscription.remove();
  }, []);

  // Auto-refresh feed when content is updated from API
  useEffect(() => {
    const unsubscribe = onFeedRefresh(() => {
      loadTodaysFacts();
      loadPopularFacts();
      loadWorthKnowingFacts();
    });
    return () => unsubscribe();
  }, []);

  // Auto-refresh feed when preferences change
  useEffect(() => {
    const unsubscribe = onPreferenceFeedRefresh(() => {
      loadTodaysFacts();
      loadPopularFacts();
      loadWorthKnowingFacts();
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
    if (!initialLoading && todaysFacts.length === 0) {
      signalHomeScreenReady();
    }
  }, [initialLoading, todaysFacts.length, signalHomeScreenReady]);

  const loadTodaysFacts = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);

        // Mark today's facts as shown and also mark delivered facts
        await database.markTodaysFactsAsShown(locale);
        await database.markDeliveredFactsAsShown(locale);

        const facts = await database.getTodaysFacts(locale);
        prefetchFactImagesWithLimit(facts);
        setTodaysFacts(facts);
      } catch {
        // Ignore fact loading errors
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [locale]
  );

  const handleFactPress = useCallback(
    (fact: FactWithRelations, source: FactViewSource, factIdList?: number[], indexInList?: number) => {
      if (fact.image_url) {
        prefetchFactImage(fact.image_url, fact.id);
      }
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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    trackFeedRefresh('pull');
    try {
      await forceRefreshContent();
    } catch {
      // Ignore refresh errors
    }
    await loadTodaysFacts(false);
    await loadPopularFacts();
    await loadWorthKnowingFacts();
  }, [loadTodaysFacts]);

  // Load popular facts (16:9 carousel cards)
  const loadPopularFacts = useCallback(async () => {
    try {
      const recs = await database.getRandomUnscheduledFacts(HOME_FEED.POPULAR_COUNT, locale);
      if (recs.length > 0) {
        prefetchFactImagesWithLimit(recs);
        setPopularFacts(recs);
      }
    } catch {
      // Ignore loading errors
    }
  }, [locale]);

  // Load worth knowing facts (thumbnail cards)
  const loadWorthKnowingFacts = useCallback(async () => {
    try {
      const recs = await database.getRandomUnscheduledFacts(HOME_FEED.WORTH_KNOWING_COUNT, locale);
      if (recs.length > 0) {
        prefetchFactImagesWithLimit(recs);
        setWorthKnowingFacts(recs);
      }
    } catch {
      // Ignore loading errors
    }
  }, [locale]);

  // Load popular and worth knowing facts on mount and when locale changes
  useEffect(() => {
    loadPopularFacts();
    loadWorthKnowingFacts();
  }, [loadPopularFacts, loadWorthKnowingFacts]);

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />,
    [refreshing, handleRefresh]
  );

  const colors = hexColors[theme];

  // On tablets, cap content width to MAX_CONTENT_WIDTH (matches ContentContainer)
  const contentWidth = Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH);
  // Horizontal inset so FlashList cards align within content area (centers on tablets)
  const listInset = (screenWidth - contentWidth) / 2 + spacing.md;

  // Today's facts carousel sizing - left-aligned, square cards with next card peeking
  const todayCardWidth = contentWidth - spacing.lg * 2 - spacing.xl;
  const todayCardGap = spacing.sm;
  const todaySnapInterval = todayCardWidth + todayCardGap;
  const [todayActiveIndex, setTodayActiveIndex] = useState(0);

  const handleTodayScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / todaySnapInterval);
      setTodayActiveIndex(Math.max(0, Math.min(index, todaysFacts.length - 1)));
    },
    [todaySnapInterval, todaysFacts.length]
  );

  const todayCarouselFactIds = useMemo(() => todaysFacts.map((f) => f.id), [todaysFacts]);
  const firstImageSignalledRef = useRef(false);

  const renderTodayItem = useCallback(
    ({ item, index }: { item: FactWithRelations; index: number }) => {
      const handleImageReady =
        index === 0 && !firstImageSignalledRef.current
          ? () => {
              firstImageSignalledRef.current = true;
              signalCarouselImageReady();
            }
          : undefined;
      return (
        <View style={{ width: todayCardWidth, paddingVertical: spacing.sm }}>
          <View
            style={[
              theme === 'dark' ? styles.shadowDark : styles.shadowLight,
            ]}
          >
            <ImageFactCard
              title={item.title || item.content.substring(0, 80) + '...'}
              imageUrl={item.image_url!}
              factId={item.id}
              category={item.categoryData || item.category}
              categorySlug={item.categoryData?.slug || item.category}
              onPress={() => handleFactPress(item, 'home_today', todayCarouselFactIds, index)}
              aspectRatio={1}
              cardWidth={todayCardWidth}
              onImageReady={handleImageReady}
            />
          </View>
        </View>
      );
    },
    [todayCardWidth, handleFactPress, todayCarouselFactIds, signalCarouselImageReady]
  );

  const todayKeyExtractor = useCallback((item: FactWithRelations) => `today-${item.id}`, []);

  // Popular section (16:9 carousel) sizing
  const isWideScreen = screenWidth > LAYOUT.MAX_CONTENT_WIDTH;
  const popularCardWidth = isWideScreen
    ? contentWidth - spacing.lg * 2
    : contentWidth * config.cardWidthMultiplier;
  const popularCardGap = spacing.sm;
  const popularSnapInterval = popularCardWidth + popularCardGap;
  const popularCardHeight = popularCardWidth * (9 / 16);
  const popularCarouselFactIds = useMemo(() => popularFacts.map((f) => f.id), [popularFacts]);

  type PopularListItem = FactWithRelations | NativeAdPlaceholder;

  const [popularFailedAdKeys, setPopularFailedAdKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPopularFailedAdKeys(new Set());
  }, [popularFacts]);

  const handlePopularAdFailed = useCallback((key: string) => {
    setPopularFailedAdKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const popularDataWithAds = useMemo(
    () =>
      insertNativeAds(popularFacts, NATIVE_ADS.FIRST_AD_INDEX.HOME_CAROUSEL).filter(
        (item) => !isNativeAdPlaceholder(item) || !popularFailedAdKeys.has(item.key)
      ),
    [popularFacts, isPremium, popularFailedAdKeys]
  );

  const renderPopularCarouselItem = useCallback(
    ({ item }: { item: PopularListItem }) => {
      if (isNativeAdPlaceholder(item)) {
        return (
          <View style={{ width: popularCardWidth, paddingVertical: spacing.sm }}>
            <NativeAdCard
              cardWidth={popularCardWidth}
              cardHeight={popularCardHeight}
              onAdFailed={() => handlePopularAdFailed(item.key)}
            />
          </View>
        );
      }
      const factIndex = popularCarouselFactIds.indexOf(item.id);
      return (
        <View style={{ width: popularCardWidth, paddingVertical: spacing.sm }}>
          <View style={theme === 'dark' ? styles.shadowDark : styles.shadowLight}>
            <ImageFactCard
              title={item.title || item.content.substring(0, 80) + '...'}
              imageUrl={item.image_url!}
              factId={item.id}
              category={item.categoryData || item.category}
              categorySlug={item.categoryData?.slug || item.category}
              onPress={() => handleFactPress(item, 'home_popular', popularCarouselFactIds, factIndex)}
              cardWidth={popularCardWidth}
              aspectRatio={16 / 9}
            />
          </View>
        </View>
      );
    },
    [popularCardWidth, popularCardHeight, handleFactPress, popularCarouselFactIds, theme, spacing.sm]
  );

  const popularCarouselKeyExtractor = useCallback(
    (item: PopularListItem) => (isNativeAdPlaceholder(item) ? item.key : `popular-${item.id}`),
    []
  );

  // Worth knowing section (thumbnail cards) sizing
  const worthKnowingCardWidth = isWideScreen
    ? contentWidth - spacing.lg * 2
    : contentWidth * config.cardWidthMultiplier;
  const worthKnowingCardGap = spacing.sm;
  const worthKnowingFactIds = useMemo(() => worthKnowingFacts.map((f) => f.id), [worthKnowingFacts]);

  const renderWorthKnowingItem = useCallback(
    ({ item, index }: { item: FactWithRelations; index: number }) => (
      <View style={{ paddingVertical: spacing.sm }}>
        <PopularFactCard
          fact={item}
          cardWidth={worthKnowingCardWidth}
          onPress={() => handleFactPress(item, 'home_worth_knowing', worthKnowingFactIds, index)}
        />
      </View>
    ),
    [worthKnowingCardWidth, handleFactPress, worthKnowingFactIds, spacing.sm]
  );

  const worthKnowingKeyExtractor = useCallback((item: FactWithRelations) => `wk-${item.id}`, []);

  // Separators for horizontal FlashLists
  const todaySeparator = useCallback(
    () => <View style={{ width: todayCardGap }} />,
    [todayCardGap]
  );
  const popularSeparator = useCallback(
    () => <View style={{ width: popularCardGap }} />,
    [popularCardGap]
  );
  const worthKnowingSeparator = useCallback(
    () => <View style={{ width: worthKnowingCardGap }} />,
    [worthKnowingCardGap]
  );

  // Worth knowing card height for FlashList container (thumbnail + padding + shadow room)
  const worthKnowingListHeight = iconSizes.heroLg + spacing.md * 2 + spacing.sm * 2;

  // Loading state
  if (initialLoading && todaysFacts.length === 0) {
    return (
      <ScreenContainer edges={['top']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={hexColors.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  const hasTodaysFacts = todaysFacts.length > 0;
  const hasPopularFacts = popularFacts.length > 0;
  const hasWorthKnowingFacts = worthKnowingFacts.length > 0;
  const hasAnyContent = hasTodaysFacts || hasPopularFacts || hasWorthKnowingFacts;

  return (
    <ScreenContainer edges={['top']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      <YStack flex={1}>
        {!hasAnyContent ? (
          <EmptyState title={t('emptyStateTitle')} description={t('emptyStateDescription')} />
        ) : (
          <ScrollView
            ref={scrollViewRef}
            refreshControl={refreshControl}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
          >
            {/* Title */}
            <Animated.View entering={FadeIn.duration(300)}>
              <ScreenHeader
                icon={<Lightbulb size={iconSizes.lg} color={colors.primary} />}
                title={t('appName')}
                paddingBottom={spacing.sm}
              />
            </Animated.View>

            {/* Category Story Buttons */}
            <YStack paddingBottom={spacing.md}>
              <CategoryStoryButtons />
            </YStack>

            {/* Fact of the Day */}
            {hasTodaysFacts && (
              <>
                <YStack width="100%" maxWidth={LAYOUT.MAX_CONTENT_WIDTH} alignSelf="center" paddingHorizontal={spacing.lg} paddingBottom={spacing.sm}>
                  <Text.Title fontSize={typography.fontSize.body}>
                    {todaysFacts.length > 1 ? t('factsOfTheDay') : t('factOfTheDay')}
                  </Text.Title>
                </YStack>

                {todaysFacts.length === 1 ? (
                  <ContentContainer>
                    <View style={theme === 'dark' ? styles.shadowDark : styles.shadowLight}>
                      <ImageFactCard
                        title={
                          todaysFacts[0].title || todaysFacts[0].content.substring(0, 80) + '...'
                        }
                        imageUrl={todaysFacts[0].image_url!}
                        factId={todaysFacts[0].id}
                        category={todaysFacts[0].categoryData || todaysFacts[0].category}
                        categorySlug={todaysFacts[0].categoryData?.slug || todaysFacts[0].category}
                        onPress={() => handleFactPress(todaysFacts[0], 'home_today')}
                        aspectRatio={1}
                        cardWidth={contentWidth}
                        onImageReady={signalCarouselImageReady}
                      />
                    </View>
                  </ContentContainer>
                ) : (
                  <YStack>
                    <View
                      style={{
                        height: todayCardWidth + spacing.md + spacing.sm * 2,
                        width: '100%',
                      }}
                    >
                      <FlashList
                        data={todaysFacts}
                        renderItem={renderTodayItem}
                        keyExtractor={todayKeyExtractor}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={todaySnapInterval}
                        decelerationRate="fast"
                        ItemSeparatorComponent={todaySeparator}
                        contentContainerStyle={{
                          paddingHorizontal: listInset,
                        }}
                        onScroll={handleTodayScroll}
                        scrollEventThrottle={16}
                      />
                    </View>

                    {/* Pagination dots */}
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: spacing.xs,
                        marginTop: spacing.sm,
                      }}
                    >
                      {todaysFacts.map((_, index) => {
                        const dotSize = index === todayActiveIndex ? spacing.sm : spacing.sm - 2;
                        return (
                          <View
                            key={index}
                            style={{
                              width: dotSize,
                              height: dotSize,
                              borderRadius: 100,
                              backgroundColor:
                                index === todayActiveIndex ? colors.primary : colors.border,
                            }}
                          />
                        );
                      })}
                    </View>
                  </YStack>
                )}
              </>
            )}

            {/* Popular Section (16:9 carousel) */}
            {hasPopularFacts && (
              <>
                <YStack width="100%" maxWidth={LAYOUT.MAX_CONTENT_WIDTH} alignSelf="center" paddingHorizontal={spacing.lg} paddingTop={spacing.lg} paddingBottom={spacing.sm}>
                  <Text.Title fontSize={typography.fontSize.body}>{t('popular')}</Text.Title>
                </YStack>

                <View
                  style={{
                    height: popularCardHeight + spacing.sm * 2,
                    width: '100%',
                  }}
                >
                  <FlashList
                    data={popularDataWithAds}
                    renderItem={renderPopularCarouselItem}
                    keyExtractor={popularCarouselKeyExtractor}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={popularSnapInterval}
                    decelerationRate="fast"
                    disableIntervalMomentum
                    ItemSeparatorComponent={popularSeparator}
                    contentContainerStyle={{
                      paddingHorizontal: listInset,
                    }}
                  />
                </View>
              </>
            )}

            {/* Worth Knowing Section (thumbnail cards) */}
            {hasWorthKnowingFacts && (
              <>
                <YStack width="100%" maxWidth={LAYOUT.MAX_CONTENT_WIDTH} alignSelf="center" paddingHorizontal={spacing.lg} paddingTop={spacing.lg} paddingBottom={spacing.sm}>
                  <Text.Title fontSize={typography.fontSize.body}>{t('worthKnowing')}</Text.Title>
                </YStack>

                <View
                  style={{
                    height: worthKnowingListHeight + spacing.sm * 2,
                    width: '100%',
                  }}
                >
                  <FlashList
                    data={worthKnowingFacts}
                    renderItem={renderWorthKnowingItem}
                    keyExtractor={worthKnowingKeyExtractor}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={worthKnowingCardWidth + worthKnowingCardGap}
                    decelerationRate="fast"
                    disableIntervalMomentum
                    ItemSeparatorComponent={worthKnowingSeparator}
                    contentContainerStyle={{
                      paddingHorizontal: listInset,
                    }}
                  />
                </View>
              </>
            )}
          </ScrollView>
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
      </YStack>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  shadowLight: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  shadowDark: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
});

// Helper to get local date string in YYYY-MM-DD format
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default HomeScreen;
