import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import {
  ContentContainer,
  EmptyState,
  LoadingContainer,
  ScreenContainer,
  Text,
} from '../../src/components';
import { CategoryStoryButtons } from '../../src/components/CategoryStoryButtons';
import { ImageFactCard } from '../../src/components/ImageFactCard';
import { PopularFactCard } from '../../src/components/PopularFactCard';
import { LAYOUT } from '../../src/config/app';
import { usePreloadedData, useScrollToTopHandler } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import { Screens, trackFeedRefresh, trackScreenView } from '../../src/services/analytics';
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
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactWithRelations } from '../../src/services/database';

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { spacing, typography, config, screenWidth } = useResponsive();
  const {
    consumePreloadedFacts,
    consumePreloadedRecommendations,
    signalHomeScreenReady,
    signalCarouselImageReady,
  } = usePreloadedData();

  const [todaysFacts, setTodaysFacts] = useState<FactWithRelations[]>([]);
  const [popularFacts, setPopularFacts] = useState<FactWithRelations[]>([]);
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
          // Use preloaded recommendations as popular facts
          if (preloadedRecs && preloadedRecs.length > 0) {
            setPopularFacts(preloadedRecs);
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
    });
    return () => unsubscribe();
  }, []);

  // Auto-refresh feed when preferences change
  useEffect(() => {
    const unsubscribe = onPreferenceFeedRefresh(() => {
      loadTodaysFacts();
      loadPopularFacts();
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
    (fact: FactWithRelations, factIdList?: number[], indexInList?: number) => {
      if (fact.image_url) {
        prefetchFactImage(fact.image_url, fact.id);
      }
      if (factIdList && factIdList.length > 1 && indexInList !== undefined) {
        router.push(
          `/fact/${fact.id}?source=feed&factIds=${JSON.stringify(factIdList)}&currentIndex=${indexInList}`
        );
      } else {
        router.push(`/fact/${fact.id}?source=feed`);
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
  }, [loadTodaysFacts]);

  // Load popular facts (random unscheduled facts)
  const loadPopularFacts = useCallback(async () => {
    try {
      const recs = await database.getRandomUnscheduledFacts(8, locale);
      if (recs.length > 0) {
        prefetchFactImagesWithLimit(recs);
        setPopularFacts(recs);
      }
    } catch {
      // Ignore recommendation loading errors
    }
  }, [locale]);

  // Load popular facts on mount and when locale changes
  useEffect(() => {
    loadPopularFacts();
  }, [loadPopularFacts]);

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />,
    [refreshing, handleRefresh]
  );

  const colors = hexColors[theme];

  // On tablets, cap content width to MAX_CONTENT_WIDTH (matches ContentContainer)
  const contentWidth = Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH);

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
        <View
          style={[
            { width: todayCardWidth },
            theme === 'dark' ? styles.shadowDark : styles.shadowLight,
          ]}
        >
          <ImageFactCard
            title={item.title || item.content.substring(0, 80) + '...'}
            imageUrl={item.image_url!}
            factId={item.id}
            category={item.categoryData || item.category}
            categorySlug={item.categoryData?.slug || item.category}
            onPress={() => handleFactPress(item, todayCarouselFactIds, index)}
            aspectRatio={1}
            cardWidth={todayCardWidth}
            onImageReady={handleImageReady}
          />
        </View>
      );
    },
    [todayCardWidth, handleFactPress, todayCarouselFactIds, signalCarouselImageReady]
  );

  const todayKeyExtractor = useCallback((item: FactWithRelations) => `today-${item.id}`, []);

  // Popular section card width (85% phone, 70% tablet via config)
  const popularCardWidth = contentWidth * config.cardWidthMultiplier;
  const popularCardGap = spacing.sm;

  const renderPopularItem = useCallback(
    ({ item }: { item: FactWithRelations }) => (
      <PopularFactCard
        fact={item}
        cardWidth={popularCardWidth}
        onPress={() => handleFactPress(item)}
      />
    ),
    [popularCardWidth, handleFactPress]
  );

  const popularKeyExtractor = useCallback((item: FactWithRelations) => `popular-${item.id}`, []);

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
  const hasAnyContent = hasTodaysFacts || hasPopularFacts;

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
              <XStack paddingHorizontal={spacing.lg} paddingTop={spacing.lg} paddingBottom={spacing.sm} alignItems="center">
                <Text.Headline flex={1}>{t('appName')}</Text.Headline>
              </XStack>
            </Animated.View>

            {/* Category Story Buttons */}
            <YStack paddingBottom={spacing.md}>
              <CategoryStoryButtons />
            </YStack>

            {/* Fact of the Day */}
            {hasTodaysFacts && (
              <ContentContainer>
                <YStack>
                  <YStack paddingBottom={spacing.sm}>
                    <Text.Title fontSize={typography.fontSize.body}>
                      {todaysFacts.length > 1 ? t('factsOfTheDay') : t('factOfTheDay')}
                    </Text.Title>
                  </YStack>

                  {todaysFacts.length === 1 ? (
                    <View style={theme === 'dark' ? styles.shadowDark : styles.shadowLight}>
                      <ImageFactCard
                        title={
                          todaysFacts[0].title || todaysFacts[0].content.substring(0, 80) + '...'
                        }
                        imageUrl={todaysFacts[0].image_url!}
                        factId={todaysFacts[0].id}
                        category={todaysFacts[0].categoryData || todaysFacts[0].category}
                        categorySlug={todaysFacts[0].categoryData?.slug || todaysFacts[0].category}
                        onPress={() => handleFactPress(todaysFacts[0])}
                        aspectRatio={1}
                        cardWidth={contentWidth}
                        onImageReady={signalCarouselImageReady}
                      />
                    </View>
                  ) : (
                    <YStack>
                      <FlatList
                        data={todaysFacts}
                        renderItem={renderTodayItem}
                        keyExtractor={todayKeyExtractor}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={todaySnapInterval}
                        decelerationRate="fast"
                        contentContainerStyle={{
                          gap: todayCardGap,
                        }}
                        onScroll={handleTodayScroll}
                        scrollEventThrottle={16}
                        style={{ overflow: 'visible' }}
                      />

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
                </YStack>
              </ContentContainer>
            )}

            {/* Popular Section */}
            {hasPopularFacts && (
              <ContentContainer>
                <YStack paddingTop={spacing.lg}>
                  <YStack paddingBottom={spacing.sm}>
                    <Text.Title fontSize={typography.fontSize.body}>{t('popular')}</Text.Title>
                  </YStack>

                  <FlatList
                    data={popularFacts}
                    renderItem={renderPopularItem}
                    keyExtractor={popularKeyExtractor}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={popularCardWidth + popularCardGap}
                    decelerationRate="fast"
                    style={{ overflow: 'visible' }}
                    contentContainerStyle={{
                      paddingVertical: spacing.sm,
                      gap: popularCardGap,
                    }}
                  />
                </YStack>
              </ContentContainer>
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
