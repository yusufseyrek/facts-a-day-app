import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { Dices, Lightbulb } from '@tamagui/lucide-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, YStack } from 'tamagui';

import {
  ContentContainer,
  EmptyState,
  LoadingContainer,
  ScreenContainer,
  ScreenHeader,
  Text,
  useIconColor,
} from '../../src/components';
import { ImageFactCard } from '../../src/components/ImageFactCard';
import { LAYOUT } from '../../src/config/app';
import { FLASH_LIST_ITEM_TYPES, FLASH_LIST_SETTINGS } from '../../src/config/factListSettings';
import { usePreloadedData, useScrollToTopHandler } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackFeedRefresh,
  trackRandomFactClick,
  trackScreenView,
} from '../../src/services/analytics';
import { checkAndRequestReview } from '../../src/services/appReview';
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
import { consumeRandomFact, initializeRandomFact } from '../../src/services/randomFact';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactWithRelations } from '../../src/services/database';

// Interface for fact sections (used internally for grouping)
interface FactSection {
  title: string;
  data: FactWithRelations[];
}

// FlashList item types - either a section header or a fact item
interface SectionHeaderItem {
  type: typeof FLASH_LIST_ITEM_TYPES.SECTION_HEADER;
  title: string;
}

interface FactItem {
  type: typeof FLASH_LIST_ITEM_TYPES.FACT_ITEM;
  fact: FactWithRelations;
}

type FeedListItem = SectionHeaderItem | FactItem;

// LocaleChangeOverlay is a simple full-screen overlay - uses inline props for responsive gap

// Simple list item component
const FactListItem = React.memo(
  ({ item, onPress }: { item: FactWithRelations; onPress: () => void }) => (
    <ContentContainer>
      <ImageFactCard
        title={item.title || item.content.substring(0, 80) + '...'}
        imageUrl={item.image_url!}
        factId={item.id}
        category={item.categoryData || item.category}
        categorySlug={item.categoryData?.slug || item.category}
        onPress={onPress}
      />
    </ContentContainer>
  )
);

FactListItem.displayName = 'FactListItem';

// Simple section header using responsive hook
const SectionHeader = React.memo(({ title }: { title: string }) => {
  const { spacing, isTablet, typography } = useResponsive();

  return (
    <YStack width="100%" alignItems="center" backgroundColor="$background">
      <YStack
        width="100%"
        maxWidth={isTablet ? LAYOUT.MAX_CONTENT_WIDTH : undefined}
        paddingHorizontal={spacing.xl}
        paddingVertical={spacing.md}
      >
        <Text.Title fontSize={typography.fontSize.body}>{title}</Text.Title>
      </YStack>
    </YStack>
  );
});

SectionHeader.displayName = 'SectionHeader';

function HomeScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const iconColor = useIconColor();
  const { iconSizes, spacing } = useResponsive();
  const { consumePreloadedFacts, signalHomeScreenReady } = usePreloadedData();

  const [sections, setSections] = useState<FactSection[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundRefreshStatus, setBackgroundRefreshStatus] = useState<RefreshStatus>(() =>
    getRefreshStatus()
  );

  // Track if random fact has been initialized (only once per app session)
  const randomFactInitializedRef = useRef(false);
  // Track if we've consumed preloaded data (only once)
  const consumedPreloadedDataRef = useRef(false);

  // Scroll to top handler
  const listRef = useRef<any>(null);
  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);
  useScrollToTopHandler('index', scrollToTop);

  // Flatten sections into a single array for FlashList
  // Each section becomes: [SectionHeader, FactItem, FactItem, ...]
  const { flattenedData, stickyHeaderIndices } = useMemo(() => {
    const items: FeedListItem[] = [];
    const headerIndices: number[] = [];

    sections.forEach((section) => {
      // Add section header
      headerIndices.push(items.length);
      items.push({
        type: FLASH_LIST_ITEM_TYPES.SECTION_HEADER,
        title: section.title,
      });

      // Add fact items
      section.data.forEach((fact) => {
        items.push({
          type: FLASH_LIST_ITEM_TYPES.FACT_ITEM,
          fact,
        });
      });
    });

    return { flattenedData: items, stickyHeaderIndices: headerIndices };
  }, [sections]);

  // Reload facts when tab gains focus
  useFocusEffect(
    useCallback(() => {
      // On first mount, try to use preloaded data from splash screen
      if (!consumedPreloadedDataRef.current) {
        consumedPreloadedDataRef.current = true;
        const preloadedFacts = consumePreloadedFacts();
        if (preloadedFacts && preloadedFacts.length > 0) {
          // Use preloaded data - no loading spinner needed
          setSections(groupFactsByDate(preloadedFacts, t, locale));
          setInitialLoading(false);
          // Initialize random fact with preloaded data
          if (!randomFactInitializedRef.current) {
            randomFactInitializedRef.current = true;
            initializeRandomFact(locale);
          }
          trackScreenView(Screens.HOME);
          return;
        }
      }
      // Fall back to normal loading
      loadFacts();
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
        loadFacts();
      }
    });
    return () => subscription.remove();
  }, []);

  // Auto-refresh feed when content is updated from API
  useEffect(() => {
    const unsubscribe = onFeedRefresh(() => loadFacts());
    return () => unsubscribe();
  }, []);

  // Auto-refresh feed when preferences change
  useEffect(() => {
    const unsubscribe = onPreferenceFeedRefresh(() => loadFacts());
    return () => unsubscribe();
  }, []);

  // Subscribe to background refresh status
  useEffect(() => {
    const unsubscribe = onRefreshStatusChange(setBackgroundRefreshStatus);
    return () => unsubscribe();
  }, []);

  // Signal home screen ready when showing empty state (no FlashList to trigger onLoad)
  useEffect(() => {
    if (!initialLoading && sections.length === 0) {
      signalHomeScreenReady();
    }
  }, [initialLoading, sections.length, signalHomeScreenReady]);

  const loadFacts = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);

        await database.markDeliveredFactsAsShown(locale);

        const facts = await database.getFactsGroupedByDate(locale);
        prefetchFactImagesWithLimit(facts);
        setSections(groupFactsByDate(facts, t, locale));

        // Initialize random fact pre-fetch once facts are loaded (only once per session)
        if (!randomFactInitializedRef.current && facts.length > 0) {
          randomFactInitializedRef.current = true;
          initializeRandomFact(locale);
        }
      } catch {
        // Ignore fact loading errors
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [locale, t]
  );

  const handleFactPress = useCallback(
    (fact: FactWithRelations) => {
      // Prefetch image before navigation for faster modal display
      if (fact.image_url) {
        prefetchFactImage(fact.image_url, fact.id);
      }
      checkAndRequestReview();
      router.push(`/fact/${fact.id}?source=feed`);
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
    await loadFacts(false);
  }, [loadFacts]);

  const handleRandomFact = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackRandomFactClick();

    // Try to get pre-fetched random fact (image already prefetched)
    let randomFact = consumeRandomFact(locale);

    // Fall back to database if no pre-fetched fact available
    if (!randomFact) {
      randomFact = await database.getRandomFact(locale);
      // Prefetch image before navigation for faster modal display
      if (randomFact?.image_url) {
        prefetchFactImage(randomFact.image_url, randomFact.id);
      }
    }

    if (randomFact) {
      router.push(`/fact/${randomFact.id}?source=random`);
    }
  }, [locale, router]);

  // FlashList key extractor
  const keyExtractor = useCallback((item: FeedListItem, index: number) => {
    if (item.type === FLASH_LIST_ITEM_TYPES.SECTION_HEADER) {
      return `header-${item.title}-${index}`;
    }
    return `fact-${item.fact.id}`;
  }, []);

  // FlashList renderItem - handles both section headers and fact items
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FeedListItem>) => {
      if (item.type === FLASH_LIST_ITEM_TYPES.SECTION_HEADER) {
        return <SectionHeader title={item.title} />;
      }

      if (!item.fact?.id) return null;
      return <FactListItem item={item.fact} onPress={() => handleFactPress(item.fact)} />;
    },
    [handleFactPress]
  );

  // FlashList getItemType - enables recycling optimization
  // Items with different types are recycled in separate pools for better performance
  const getItemType = useCallback((item: FeedListItem) => {
    return item.type;
  }, []);

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />,
    [refreshing, handleRefresh]
  );

  // Loading state
  if (initialLoading && sections.length === 0) {
    return (
      <ScreenContainer edges={['top']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={hexColors.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      <Animated.View entering={FadeIn.duration(300)}>
        <ScreenHeader
          icon={<Lightbulb size={iconSizes.lg} color={iconColor} />}
          paddingBottom={0}
          title={t('factsFeed')}
          rightElement={
            <View
              role="button"
              aria-label={t('showRandomFact')}
              padding={spacing.sm}
              onPress={handleRandomFact}
              pressStyle={{ opacity: 0.6, scale: 0.9 }}
            >
              <Dices size={iconSizes.lg} color={iconColor} />
            </View>
          }
        />
      </Animated.View>

      <YStack flex={1}>
        {flattenedData.length === 0 ? (
          <EmptyState title={t('emptyStateTitle')} description={t('emptyStateDescription')} />
        ) : (
          <FlashList
            ref={listRef}
            data={flattenedData}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            getItemType={getItemType}
            stickyHeaderIndices={stickyHeaderIndices}
            refreshControl={refreshControl}
            decelerationRate={0.8}
            onLoad={signalHomeScreenReady}
            {...{ ...FLASH_LIST_SETTINGS, drawDistance: 800 }}
          />
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

// Helper to get local date string in YYYY-MM-DD format
// Using local date instead of UTC to properly match user's timezone
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to group facts by date
function groupFactsByDate(
  facts: FactWithRelations[],
  t: (key: 'today' | 'yesterday') => string,
  locale: string
): FactSection[] {
  const today = new Date();
  const todayString = getLocalDateString(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = getLocalDateString(yesterday);

  const grouped: { [key: string]: FactWithRelations[] } = {};

  facts.forEach((fact) => {
    let dateKey: string;
    if (fact.shown_in_feed === 1 && !fact.scheduled_date) {
      dateKey = todayString;
    } else if (fact.scheduled_date) {
      // Parse the scheduled_date as local date for comparison
      const scheduledDate = new Date(fact.scheduled_date);
      dateKey = getLocalDateString(scheduledDate);
    } else {
      return;
    }

    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(fact);
  });

  return Object.keys(grouped)
    .sort((a, b) => b.localeCompare(a))
    .map((dateKey) => {
      let title: string;
      if (dateKey === todayString) {
        title = t('today');
      } else if (dateKey === yesterdayString) {
        title = t('yesterday');
      } else {
        // Parse as local date for display (add T12:00:00 to avoid timezone edge cases)
        title = new Date(dateKey + 'T12:00:00').toLocaleDateString(locale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }

      return {
        title,
        data: grouped[dateKey].filter((item) => item?.id),
      };
    })
    .filter((section) => section.data.length > 0);
}

export default HomeScreen;
