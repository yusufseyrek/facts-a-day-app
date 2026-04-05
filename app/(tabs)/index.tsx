import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FlashList, FlashListRef } from '@shopify/flash-list';
import { BookOpen, CalendarDays, Crown, Lightbulb, Sparkles } from '@tamagui/lucide-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import {
  EmptyState,
  LoadingContainer,
  ScreenContainer,
  ScreenHeader,
  Text,
} from '../../src/components';
import { InlineNativeAd } from '../../src/components/ads/InlineNativeAd';
import { ReadingStreakIndicator } from '../../src/components/badges/ReadingStreakIndicator';
import {
  CategoryStoryButtons,
  CategoryStoryButtonsRef,
} from '../../src/components/CategoryStoryButtons';
import { KeepReadingList } from '../../src/components/home/KeepReadingList';
import { ImageFactCard } from '../../src/components/ImageFactCard';
import { CompactFactCard } from '../../src/components/CompactFactCard';
import { ADS_ENABLED, LAYOUT, PAYWALL_PROMPT } from '../../src/config/app';
import { usePremium, useScrollToTopHandler } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackCarouselSwipe,
  trackFeedRefresh,
  trackScreenView,
} from '../../src/services/analytics';
import { isModalScreenActive } from '../../src/services/badges';
import { consumeFeedRefreshPending, forceRefreshContent } from '../../src/services/contentRefresh';
import { loadDailyFeedSections } from '../../src/services/dailyFeed';
import { preCacheOfflineImages } from '../../src/services/images';
import { shouldShowPaywall } from '../../src/services/paywallTiming';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';
import { useHomeFeed } from '../../src/hooks/useHomeFeed';
import { useKeepReading } from '../../src/hooks/useKeepReading';
import { useReadingStreak } from '../../src/hooks/useReadingStreak';
import { useHomeFeedEvents } from '../../src/hooks/useHomeFeedEvents';
import { homeKeys } from '../../src/hooks/queryKeys';
import { queryClient } from '../../src/config/queryClient';

import type { FactViewSource } from '../../src/services/analytics';
import type { FactWithRelations } from '../../src/services/database';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { isPremium } = usePremium();
  const { spacing, typography, config, screenWidth, iconSizes } = useResponsive();

  // Data hooks
  const { latestFacts, latestFactIds, onThisDayFacts, onThisDayIsWeekFallback, isLoading } =
    useHomeFeed(locale);
  const {
    facts: keepReadingFacts,
    fetchNextPage,
    isFetchingNextPage,
  } = useKeepReading(locale, latestFactIds);
  const { streak } = useReadingStreak();

  // Remaining local state
  const [refreshing, setRefreshing] = useState(false);
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

  // Refs
  const preCacheDateRef = useRef<string | null>(null);
  const paywallCheckRef = useRef(false);
  const keepReadingListRef = useRef<FlashListRef<any>>(null);
  const latestListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const onThisDayListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const storyButtonsRef = useRef<CategoryStoryButtonsRef>(null);
  const scrollYRef = useRef(0);

  const { backgroundRefreshStatus } = useHomeFeedEvents(
    locale,
    { latestListRef, onThisDayListRef },
    setPreCacheProgress
  );

  // Register scroll-to-top handler
  useScrollToTopHandler(
    'index',
    useCallback(() => {
      keepReadingListRef.current?.scrollToOffset({ offset: 0, animated: true });
      latestListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const forceRefresh = consumeFeedRefreshPending();
      if (forceRefresh) {
        loadDailyFeedSections(locale, true).then((sections) => {
          queryClient.setQueryData(homeKeys.dailyFeed(locale), sections);
        });
      }

      const idleId = requestIdleCallback(() => {
        const today = getLocalDateString();
        if (preCacheDateRef.current !== today) {
          preCacheDateRef.current = today;
          preCacheOfflineImages(undefined, setPreCacheProgress)
            .then(() => setTimeout(() => setPreCacheProgress(null), 1000))
            .catch(() => setPreCacheProgress(null));
        }

        trackScreenView(Screens.HOME);
      });

      let timer: ReturnType<typeof setTimeout> | undefined;
      if (!isPremium && !paywallCheckRef.current) {
        timer = setTimeout(async () => {
          try {
            if (isModalScreenActive()) return;
            const should = await shouldShowPaywall();
            if (should) {
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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    trackFeedRefresh('pull');
    try {
      await forceRefreshContent();
    } catch {
      // Ignore
    }
    try {
      const sections = await loadDailyFeedSections(locale, false);
      queryClient.setQueryData(homeKeys.dailyFeed(locale), sections);
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

  const handleScroll = useCallback((y: number) => {
    scrollYRef.current = y;
  }, []);

  const colors = hexColors[theme];

  // Layout calculations
  const contentWidth = Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH);
  const listInset = (screenWidth - contentWidth) / 2 + spacing.md;
  const isWideScreen = screenWidth > LAYOUT.MAX_CONTENT_WIDTH;
  const carouselCardWidth = isWideScreen
    ? contentWidth - spacing.lg * 2
    : contentWidth * config.cardWidthMultiplier;
  const carouselCardGap = spacing.sm;
  const carouselSnapInterval = carouselCardWidth + carouselCardGap;

  // Memoized styles
  const flashListContentStyle = useMemo(() => ({ paddingHorizontal: listInset }), [listInset]);
  const carouselItemStyle = useMemo(
    () => ({ width: carouselCardWidth, paddingBottom: spacing.md }),
    [carouselCardWidth, spacing.md]
  );
  const compactItemStyle = useMemo(() => ({ paddingBottom: spacing.md }), [spacing.md]);
  const separatorStyle = useMemo(() => ({ width: carouselCardGap }), [carouselCardGap]);

  // Latest section
  const latestCardHeight = carouselCardWidth;

  const latestActiveIndexRef = useRef(0);
  const handleLatestScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / carouselSnapInterval);
      if (index !== latestActiveIndexRef.current) {
        latestActiveIndexRef.current = index;
        trackCarouselSwipe({
          section: 'latest',
          index,
          factId: latestFacts[index]?.id,
        });
      }
    },
    [carouselSnapInterval, latestFacts]
  );

  const renderLatestItem = useCallback(
    ({ item }: { item: FactWithRelations }) => {
      const factIndex = latestFactIds.indexOf(item.id);
      return (
        <View style={carouselItemStyle}>
          <ImageFactCard
            title={item.title || item.content.substring(0, 80) + '...'}
            imageUrl={item.image_url!}
            factId={item.id}
            category={item.categoryData || item.category}
            categorySlug={item.categoryData?.slug || item.category}
            onPress={() => handleFactPress(item, 'home_latest', latestFactIds, factIndex)}
            cardWidth={carouselCardWidth}
            aspectRatio={1}
          />
        </View>
      );
    },
    [carouselCardWidth, handleFactPress, latestFactIds, spacing.md]
  );

  const latestKeyExtractor = useCallback((item: FactWithRelations) => `lt-${item.id}`, []);

  // On This Day section
  const onThisDayIds = useMemo(() => onThisDayFacts.map((f) => f.id), [onThisDayFacts]);

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
      <View style={compactItemStyle}>
        <CompactFactCard
          fact={item}
          cardWidth={carouselCardWidth}
          titleLines={3}
          onPress={() => handleFactPress(item, 'home_on_this_day', onThisDayIds, index)}
        />
      </View>
    ),
    [carouselCardWidth, handleFactPress, onThisDayIds, spacing.md]
  );

  const onThisDayKeyExtractor = useCallback((item: FactWithRelations) => `otd-${item.id}`, []);

  const carouselSeparator = useCallback(() => <View style={separatorStyle} />, [separatorStyle]);

  // Loading state
  if (isLoading && latestFacts.length === 0) {
    return (
      <ScreenContainer edges={['top']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={hexColors.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  const hasLatestFacts = latestFacts.length > 0;
  const hasOnThisDayFacts = onThisDayFacts.length > 0;
  const hasAnyContent = hasLatestFacts || hasOnThisDayFacts;

  // All upper sections rendered as the FlashList header
  const listHeader = (
    <>
      {/* Category Story Buttons */}
      <YStack paddingBottom={spacing.lg}>
        <CategoryStoryButtons ref={storyButtonsRef} />
      </YStack>
      {/* Latest Section (1:1 square carousel) */}
      {hasLatestFacts && (
        <>
          <XStack
            width="100%"
            maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
            alignSelf="center"
            paddingHorizontal={spacing.lg}
            paddingBottom={spacing.sm}
            alignItems="center"
            gap={spacing.sm}
          >
            <Sparkles size={iconSizes.sm} color={colors.primary} />
            <Text.Title fontSize={typography.fontSize.body}>{t('latest')}</Text.Title>
          </XStack>

          <View
            style={{
              height: latestCardHeight + spacing.xxl,
              width: '100%',
            }}
          >
            <FlashList
              ref={latestListRef}
              data={latestFacts}
              renderItem={renderLatestItem}
              keyExtractor={latestKeyExtractor}
              horizontal
              showsHorizontalScrollIndicator={false}
              overScrollMode="never"
              snapToInterval={carouselSnapInterval}
              decelerationRate="fast"
              disableIntervalMomentum
              ItemSeparatorComponent={carouselSeparator}
              contentContainerStyle={flashListContentStyle}
              drawDistance={carouselCardWidth}
              onScroll={handleLatestScroll}
              scrollEventThrottle={16}
            />
          </View>
        </>
      )}

      {/* On This Day Section (thumbnail cards) */}
      {hasOnThisDayFacts && (
        <>
          <XStack
            width="100%"
            maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
            alignSelf="center"
            paddingHorizontal={spacing.lg}
            paddingBottom={spacing.sm}
            alignItems="center"
            gap={spacing.sm}
          >
            <CalendarDays size={iconSizes.sm} color={colors.primary} />
            <Text.Title fontSize={typography.fontSize.body}>
              {onThisDayIsWeekFallback ? t('thisWeekInHistory') : t('onThisDay')}
            </Text.Title>
          </XStack>

          <View style={{ width: '100%' }}>
            <FlashList
              ref={onThisDayListRef}
              data={onThisDayFacts}
              renderItem={renderOnThisDayItem}
              keyExtractor={onThisDayKeyExtractor}
              horizontal
              showsHorizontalScrollIndicator={false}
              overScrollMode="never"
              snapToInterval={carouselSnapInterval}
              decelerationRate="fast"
              disableIntervalMomentum
              ItemSeparatorComponent={carouselSeparator}
              contentContainerStyle={flashListContentStyle}
              drawDistance={carouselCardWidth}
              onScroll={handleOnThisDayScroll}
              scrollEventThrottle={16}
            />
          </View>
        </>
      )}

      {/* Inline ad between sections */}
      {ADS_ENABLED && !isPremium && (
        <YStack
          width="100%"
          maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
          alignSelf="center"
          paddingHorizontal={spacing.md}
          paddingBottom={spacing.xl}
        >
          <InlineNativeAd aspectRatio={NativeMediaAspectRatio.LANDSCAPE} />
        </YStack>
      )}

      {/* Keep Reading section header */}
      {keepReadingFacts.length > 0 && (
        <XStack
          width="100%"
          maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
          alignSelf="center"
          paddingHorizontal={spacing.lg}
          paddingTop={spacing.md}
          alignItems="center"
          gap={spacing.sm}
        >
          <BookOpen size={iconSizes.sm} color={colors.primary} />
          <Text.Title fontSize={typography.fontSize.body}>{t('keepReading')}</Text.Title>
        </XStack>
      )}
    </>
  );

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
                icon={
                  <View style={{ position: 'relative', width: iconSizes.lg, height: iconSizes.lg }}>
                    <Lightbulb position="absolute" size={iconSizes.lg} color={colors.primary} />
                    {isPremium && (
                      <Crown
                        position="absolute"
                        size={iconSizes.xs}
                        color="#DAA520"
                        fill="#DAA520"
                        top={-iconSizes.sm / 2}
                        left={iconSizes.sm / 2}
                        transform={[{ rotate: '16deg' }]}
                      />
                    )}
                  </View>
                }
                title={t('appName')}
                paddingBottom={spacing.sm}
                rightElement={
                  <ReadingStreakIndicator streak={streak} onPress={() => router.push('/badges')} />
                }
              />
            </Animated.View>

            {/* Single vertical FlashList — upper sections in header, keep reading items recycled */}
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

function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default HomeScreen;
