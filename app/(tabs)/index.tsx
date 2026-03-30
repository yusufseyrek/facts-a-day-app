import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
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
import { CategoryCarousel, CategoryCarouselRef } from '../../src/components/home/CategoryCarousel';
import { QuickQuizTeaser } from '../../src/components/home/QuickQuizTeaser';
import { ImageFactCard } from '../../src/components/ImageFactCard';
import { CompactFactCard } from '../../src/components/CompactFactCard';
import { ADS_ENABLED, HOME_FEED, LAYOUT, NATIVE_ADS, PAYWALL_PROMPT } from '../../src/config/app';
import {
  consumeOnboardingPreloadedFeed,
  signalFeedLoaded,
  usePreloadedData,
  usePremium,
  useScrollToTopHandler,
} from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackCarouselSwipe,
  trackFeedRefresh,
  trackQuickQuizAnswer,
  trackQuickQuizSessionComplete,
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
  setPendingDiscoverCategory,
} from '../../src/services/contentRefresh';
import { getAllCategories, getFactsByCategory } from '../../src/services/database';
import { getSelectedCategories } from '../../src/services/onboarding';
import { loadDailyFeedSections } from '../../src/services/dailyFeed';
import { invalidateBadgeCache } from '../../src/services/badgeCache';
import { preCacheOfflineImages } from '../../src/services/images';
import { onNetworkChange } from '../../src/services/network';
import { shouldShowPaywall } from '../../src/services/paywallTiming';
import { setPendingQuizSessionId } from '../../src/services/quizSession';
import {
  getRandomQuestionForQuiz,
  getShuffledAnswers,
  recordAnswer,
  saveSessionResult,
} from '../../src/services/trivia';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactViewSource } from '../../src/services/analytics';
import type { FactWithRelations, QuestionWithFact } from '../../src/services/database';

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { isPremium } = usePremium();
  const { spacing, typography, config, screenWidth, iconSizes, media } = useResponsive();
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
  const [categoryCarousels, setCategoryCarousels] = useState<
    { category: import('../../src/services/database').Category; facts: FactWithRelations[] }[]
  >([]);

  // Stagger category carousel mounting for performance
  const [visibleCarouselCount, setVisibleCarouselCount] = useState(2);

  // Quick Quiz state
  const [quizQuestion, setQuizQuestion] = useState<QuestionWithFact | null>(null);
  const [quizShuffledAnswers, setQuizShuffledAnswers] = useState<string[]>([]);
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
  const quizYRef = useRef(0);
  const freshFactsListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const worthKnowingListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const onThisDayListRef = useRef<FlashListRef<FactWithRelations>>(null);
  const storyButtonsRef = useRef<CategoryStoryButtonsRef>(null);
  const categoryCarouselRefs = useRef<Map<string, CategoryCarouselRef>>(new Map());
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
        categoryCarouselRefs.current.forEach((ref) => ref.scrollToStart());
      } else {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }
    }, [])
  );

  const categoryCarouselsLoadedRef = useRef(false);

  const loadCategoryCarousels = useCallback(
    async (forceRefresh?: boolean) => {
      if (!forceRefresh && categoryCarouselsLoadedRef.current) return;
      try {
        const [selectedSlugs, allCategories] = await Promise.all([
          getSelectedCategories(),
          getAllCategories(),
        ]);
        const categoryMap = new Map(allCategories.map((c) => [c.slug, c]));
        const results = await Promise.all(
          selectedSlugs.map(async (slug) => {
            const category = categoryMap.get(slug);
            if (!category) return null;
            const facts = await getFactsByCategory(slug, locale, HOME_FEED.CATEGORY_CAROUSEL_COUNT);
            if (facts.length === 0) return null;
            return { category, facts };
          })
        );
        setCategoryCarousels(
          results.filter(Boolean) as {
            category: import('../../src/services/database').Category;
            facts: FactWithRelations[];
          }[]
        );
        categoryCarouselsLoadedRef.current = true;
      } catch (error) {
        console.error('📋 [HomeScreen] loadCategoryCarousels ERROR:', error);
      }
    },
    [locale]
  );

  const handleCategoryCta = useCallback(
    (slug: string) => {
      setPendingDiscoverCategory(slug);
      router.navigate('/(tabs)/discover');
    },
    [router]
  );

  useFocusEffect(
    useCallback(() => {
      // CRITICAL: Load visible content immediately
      const forceRefresh = consumeFeedRefreshPending();
      loadCategoryCarousels(forceRefresh);
      loadFeedSections(!forceRefresh, forceRefresh);

      // DEFERRED: Non-visible work runs after animations/interactions settle
      const task = InteractionManager.runAfterInteractions(() => {
        const today = getLocalDateString();
        if (preCacheDateRef.current !== today) {
          preCacheDateRef.current = today;
          preCacheOfflineImages(undefined, setPreCacheProgress)
            .then(() => setTimeout(() => setPreCacheProgress(null), 1000))
            .catch(() => setPreCacheProgress(null));
        }

        getReadingStreak()
          .then(setReadingStreak)
          .catch(() => {});

        getRandomQuestionForQuiz(locale)
          .then((question) => {
            setQuizQuestion((prev) => {
              if (question && question.id !== prev?.id) {
                setQuizShuffledAnswers(getShuffledAnswers(question));
              }
              return question;
            });
          })
          .catch(() => {});

        trackScreenView(Screens.HOME);
      });

      // Auto-show paywall for free users (once every N days)
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
            // silently ignore paywall check errors
          }
        }, PAYWALL_PROMPT.DELAY_MS);
      }

      return () => {
        task.cancel();
        if (timer) clearTimeout(timer);
      };
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
      // Reload category carousels with new content
      categoryCarouselsLoadedRef.current = false;
      loadCategoryCarousels(true);
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

  // Incrementally mount category carousels to reduce initial render cost
  useEffect(() => {
    if (visibleCarouselCount < categoryCarousels.length) {
      const id = requestAnimationFrame(() => {
        setVisibleCarouselCount((prev) => Math.min(prev + 1, categoryCarousels.length));
      });
      return () => cancelAnimationFrame(id);
    }
  }, [visibleCarouselCount, categoryCarousels.length]);

  // Reset visible count when carousels change (e.g. after refresh)
  useEffect(() => {
    setVisibleCarouselCount(2);
  }, [categoryCarousels]);

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
        // Check for data pre-loaded during onboarding (synchronous, no DB hit)
        const preloaded = consumeOnboardingPreloadedFeed();
        const {
          freshFacts: fresh,
          worthKnowing,
          onThisDay,
          onThisDayIsWeekFallback: isWeek,
        } = preloaded ?? (await loadDailyFeedSections(locale, forceRefresh));

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

  const scrollQuizIntoView = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: quizYRef.current, animated: true });
    }, 50);
  }, []);

  const handleQuizAnswer = useCallback(
    (questionId: number, isCorrect: boolean) => {
      const questionType = quizQuestion?.question_type || 'multiple_choice';
      trackQuickQuizAnswer({ questionId, isCorrect, questionType });
      recordAnswer(questionId, isCorrect, 'quick').catch(() => {});
      invalidateBadgeCache();
      scrollQuizIntoView();
    },
    [quizQuestion, scrollQuizIntoView]
  );

  const handleQuizResults = useCallback(
    async (questions: QuestionWithFact[], answers: Record<number, string>, correct: number) => {
      trackQuickQuizSessionComplete({ questionCount: questions.length, correctCount: correct });
      try {
        const sessionId = await saveSessionResult(
          'quick',
          questions.length,
          correct,
          undefined,
          undefined,
          undefined,
          questions,
          answers
        );
        setPendingQuizSessionId(sessionId);
        router.navigate('/(tabs)/trivia');
      } catch {
        // Fallback: navigate to trivia tab
        router.push('/(tabs)/trivia');
      }
    },
    [router]
  );

  const handleQuizRetry = useCallback(() => {
    getRandomQuestionForQuiz(locale, true)
      .then((question) => {
        if (question) {
          setQuizQuestion(question);
          setQuizShuffledAnswers(getShuffledAnswers(question));
        }
      })
      .catch(() => {});
    scrollQuizIntoView();
  }, [locale, scrollQuizIntoView]);

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

  // Memoized styles to avoid re-creating objects during render
  const flashListContentStyle = useMemo(() => ({ paddingHorizontal: listInset }), [listInset]);
  const carouselItemStyle = useMemo(
    () => ({ width: carouselCardWidth, paddingBottom: spacing.md }),
    [carouselCardWidth, spacing.md]
  );
  const compactItemStyle = useMemo(() => ({ paddingBottom: spacing.md }), [spacing.md]);
  const separatorStyle = useMemo(() => ({ width: carouselCardGap }), [carouselCardGap]);

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
        <View style={carouselItemStyle}>
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

  // On This Day section (CompactFactCard thumbnail cards)
  const onThisDayIds = useMemo(() => onThisDayFacts.map((f) => f.id), [onThisDayFacts]);
  // const onThisDayListHeight = media.compactCardThumbnailSize + spacing.md * 2 + spacing.md * 2;

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
        <View style={carouselItemStyle}>
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
  const carouselSeparator = useCallback(() => <View style={separatorStyle} />, [separatorStyle]);

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
  const hasAnyContent =
    hasFreshFacts || hasWorthKnowingFacts || hasOnThisDayFacts || categoryCarousels.length > 0;

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
              overScrollMode="never"
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
                    <Text.Title fontSize={typography.fontSize.body}>{t('newlyAdded')}</Text.Title>
                  </XStack>

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
                      overScrollMode="never"
                      snapToInterval={carouselSnapInterval}
                      decelerationRate="fast"
                      disableIntervalMomentum
                      ItemSeparatorComponent={carouselSeparator}
                      contentContainerStyle={flashListContentStyle}
                      drawDistance={carouselCardWidth}
                      onScroll={handleFreshFactsScroll}
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
                  <InlineNativeAd />
                </YStack>
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

                  <View
                    style={{
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

              {/* Worth Knowing Section (3:2 carousel) */}
              {hasWorthKnowingFacts && (
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
                    <BookOpen size={iconSizes.sm} color={colors.primary} />
                    <Text.Title fontSize={typography.fontSize.body}>{t('worthKnowing')}</Text.Title>
                  </XStack>

                  <View
                    style={{
                      height: worthKnowingCardHeight + spacing.md * 2,
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
                      overScrollMode="never"
                      snapToInterval={carouselSnapInterval}
                      decelerationRate="fast"
                      disableIntervalMomentum
                      ItemSeparatorComponent={carouselSeparator}
                      contentContainerStyle={flashListContentStyle}
                      drawDistance={carouselCardWidth}
                      onScroll={handleWorthKnowingScroll}
                      scrollEventThrottle={16}
                    />
                  </View>
                </>
              )}

              {/* Quick Quiz Teaser */}
              {quizQuestion && (
                <View
                  onLayout={(e) => {
                    quizYRef.current = e.nativeEvent.layout.y;
                  }}
                  style={{
                    width: '100%',
                    maxWidth: LAYOUT.MAX_CONTENT_WIDTH,
                    alignSelf: 'center',
                    paddingHorizontal: spacing.md,
                    paddingBottom: spacing.lg,
                  }}
                >
                  <QuickQuizTeaser
                    question={quizQuestion}
                    shuffledAnswers={quizShuffledAnswers}
                    isDark={theme === 'dark'}
                    onAnswered={handleQuizAnswer}
                    onRetry={handleQuizRetry}
                    onResults={handleQuizResults}
                    t={t}
                  />
                </View>
              )}

              {/* Inline ad below quiz */}
              {ADS_ENABLED && !isPremium && (
                <YStack
                  width="100%"
                  maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
                  alignSelf="center"
                  paddingHorizontal={spacing.md}
                  paddingBottom={spacing.xl}
                >
                  <InlineNativeAd />
                </YStack>
              )}

              {/* Category Carousels with inline ads (staggered mount) */}
              {categoryCarousels
                .slice(0, visibleCarouselCount)
                .map(({ category, facts }, index) => (
                  <React.Fragment key={category.slug}>
                    <CategoryCarousel
                      ref={(r) => {
                        if (r) categoryCarouselRefs.current.set(category.slug, r);
                        else categoryCarouselRefs.current.delete(category.slug);
                      }}
                      category={category}
                      facts={facts}
                      onFactPress={(fact, source, factIds, factIndex) =>
                        handleFactPress(fact, source, factIds, factIndex)
                      }
                      onCtaPress={handleCategoryCta}
                    />
                    {ADS_ENABLED &&
                      !isPremium &&
                      (index + 1) % NATIVE_ADS.CATEGORY_CAROUSEL_AD_INTERVAL === 0 && (
                        <YStack
                          width="100%"
                          maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
                          alignSelf="center"
                          paddingHorizontal={spacing.md}
                          paddingBottom={spacing.xl}
                        >
                          <InlineNativeAd />
                        </YStack>
                      )}
                  </React.Fragment>
                ))}
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
