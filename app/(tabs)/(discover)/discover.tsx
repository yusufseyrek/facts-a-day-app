import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';

import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { styled, View } from '@tamagui/core';
import { ChevronRight, X } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import {
  ContentContainer,
  EmptyState,
  FONT_FAMILIES,
  ScreenContainer,
  Text,
} from '../../../src/components';
import { BannerAd } from '../../../src/components/ads';
import { NativeAdCard } from '../../../src/components/ads/NativeAdCard';
import { ImageFactCard } from '../../../src/components/ImageFactCard';
import { LAYOUT, NATIVE_ADS } from '../../../src/config/app';
import { FLASH_LIST_SETTINGS } from '../../../src/config/factListSettings';
import { usePremium, useScrollToTopHandler } from '../../../src/contexts';
import { useSeedFactDetailsCache } from '../../../src/hooks/useFactDetail';
import { useTranslation } from '../../../src/i18n';
import {
  Screens,
  trackCategoryBrowse,
  trackScreenView,
  trackSearch,
} from '../../../src/services/analytics';
import * as api from '../../../src/services/api';
import { mapApiFactToRelations } from '../../../src/services/database';
import { consumePendingDiscoverCategory } from '../../../src/services/discoverNav';
import { getCachedFactImageSync } from '../../../src/services/images';
import { primePool } from '../../../src/services/nativeAdPool';
import { getIsConnected } from '../../../src/services/network';
import { getSelectedCategories } from '../../../src/services/onboarding';
import { onPreferenceFeedRefresh } from '../../../src/services/preferences';
import { hexColors, useTheme } from '../../../src/theme';
import { darkenColor, getContrastColor, hexToHue } from '../../../src/utils/colors';
import { getLucideIcon } from '../../../src/utils/iconMapper';
import {
  insertNativeAds,
  isNativeAdPlaceholder,
  type NativeAdPlaceholder,
} from '../../../src/utils/insertNativeAds';
import { smartScrollToTop } from '../../../src/utils/useFlashListScrollToTop';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { SearchBarCommands } from 'react-native-screens';
import type { FactViewSource } from '../../../src/services/analytics';
import type { Category, FactWithRelations } from '../../../src/services/database';

// How many facts to pull for a category browse view (first feed page).
const CATEGORY_BROWSE_LIMIT = 100;

const EmptyDiscoverState = styled(YStack, {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
});

const CategoriesContainer = styled(YStack, {
  flex: 1,
});

const CategoriesGrid = styled(View, {});

const CategoryRow = styled(XStack, {
  justifyContent: 'space-between',
});

// Discover Category Card - wider with facts count
const DiscoverCategoryCard = styled(XStack, {
  flex: 1,
  alignItems: 'center',
});

const DiscoverCategoryIconContainer = styled(YStack, {
  alignItems: 'center',
  justifyContent: 'center',
});

const DiscoverCategoryTextContainer = styled(YStack, {
  flex: 1,
});

// Memoized list item component to prevent re-renders
interface FactListItemProps {
  item: FactWithRelations;
  isTablet: boolean;
  onPress: (fact: FactWithRelations) => void;
  selectedCategory?: Category | null;
}

const FactListItem = React.memo(
  ({ item, isTablet, onPress, selectedCategory }: FactListItemProps) => {
    const handlePress = useCallback(() => {
      onPress(item);
    }, [item, onPress]);

    return (
      <ContentContainer>
        <ImageFactCard
          title={item.title || item.content.substring(0, 80) + '...'}
          imageUrl={item.image_url!}
          factId={item.id}
          category={selectedCategory || item.categoryData || item.category}
          categorySlug={selectedCategory?.slug || item.categoryData?.slug || item.category}
          onPress={handlePress}
          isTablet={isTablet}
        />
      </ContentContainer>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.title === nextProps.item.title &&
      prevProps.item.image_url === nextProps.item.image_url &&
      prevProps.isTablet === nextProps.isTablet &&
      prevProps.selectedCategory?.slug === nextProps.selectedCategory?.slug
    );
  }
);

FactListItem.displayName = 'FactListItem';

/**
 * When offline, sort facts so those with locally cached images appear first.
 * Online: returns facts as-is (original DB order).
 */
function sortByImageAvailability(facts: FactWithRelations[]): FactWithRelations[] {
  if (getIsConnected()) return facts;
  return [...facts].sort((a, b) => {
    const aCached = a.image_url ? (getCachedFactImageSync(a.id) ? 1 : 0) : 0;
    const bCached = b.image_url ? (getCachedFactImageSync(b.id) ? 1 : 0) : 0;
    return bCached - aCached;
  });
}

function DiscoverScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const { isTablet, spacing, iconSizes, config, media, radius } = useResponsive();
  // Seed the fact-detail cache from browse/search results (which live in local
  // state, not React Query) so opening any of them — and swiping between them —
  // is instant instead of triggering a blocking per-fact fetch.
  const seedFactDetailsCache = useSeedFactDetailsCache(locale);
  const { isPremium } = usePremium();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FactWithRelations[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Imperative handle to the native header search bar (it is uncontrolled, so
  // programmatic state resets must also clear the native field).
  const searchBarRef = useRef<SearchBarCommands>(null);

  // Category filter state
  const [userCategories, setUserCategories] = useState<Category[]>([]);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(null);
  const [categoryFacts, setCategoryFacts] = useState<FactWithRelations[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingCategoryFacts, setIsLoadingCategoryFacts] = useState(false);

  // Scroll to top refs and offset tracking
  const searchListRef = useRef<any>(null);
  const searchScrollOffsetRef = useRef(0);

  const categoryListRef = useRef<any>(null);
  const categoryScrollOffsetRef = useRef(0);

  const categoryGridRef = useRef<ScrollView>(null);

  const clearCategoryFilter = useCallback(() => {
    setSelectedCategorySlug(null);
    setCategoryFacts([]);
    setSearchQuery('');
    setSearchResults([]);
    searchBarRef.current?.clearText();
    searchBarRef.current?.cancelSearch();
  }, []);

  // Scroll handlers to track offsets
  const handleSearchScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      searchScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    },
    []
  );

  const handleCategoryScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      categoryScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    },
    []
  );

  // Scroll to top handler - scrolls whichever list is currently visible with smart behavior
  // If already at top in category facts view, go back to category selection
  const scrollToTop = useCallback(() => {
    const hasQuery = searchQuery.trim().length > 0;
    if (hasQuery && searchResults.length > 0) {
      smartScrollToTop(searchListRef, searchScrollOffsetRef.current);
    } else if (selectedCategorySlug && categoryFacts.length > 0) {
      const isAtTop = categoryScrollOffsetRef.current <= 1;
      if (isAtTop) {
        clearCategoryFilter();
      } else {
        smartScrollToTop(categoryListRef, categoryScrollOffsetRef.current);
      }
    } else {
      categoryGridRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [
    searchQuery,
    searchResults.length,
    selectedCategorySlug,
    categoryFacts.length,
    clearCategoryFilter,
  ]);
  useScrollToTopHandler('discover', scrollToTop);

  const performSearch = useCallback(
    async (query: string, categorySlug: string | null) => {
      if (!query || query.trim().length === 0) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      try {
        // Server-side title-first search, optionally scoped to a category.
        const facts = await api.searchFacts({
          q: query.trim(),
          language: locale,
          categories: categorySlug || undefined,
        });
        seedFactDetailsCache(facts);
        const results: FactWithRelations[] = facts.map(mapApiFactToRelations);

        setSearchResults(sortByImageAvailability(results));

        // Track search event
        trackSearch({
          searchTerm: query.trim(),
          resultsCount: results.length,
          categoryFilter: categorySlug || undefined,
        });
      } catch {
        // Ignore search errors
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [locale, seedFactDetailsCache]
  );

  // Track screen view when tab is focused
  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.DISCOVER);
      primePool();
    }, [])
  );

  // Load user's selected categories
  const loadUserCategories = useCallback(async () => {
    try {
      setIsLoadingCategories(true);
      const selectedSlugs = await getSelectedCategories();
      const metadata = await api.getMetadata(locale);
      const allCategories = metadata.categories;

      // Filter to only include user's selected categories, sorted by hue
      const filteredCategories = allCategories
        .filter((cat) => selectedSlugs.includes(cat.slug))
        .sort((a, b) => hexToHue(a.color_hex) - hexToHue(b.color_hex));
      setUserCategories(filteredCategories);
    } catch {
      // Ignore category loading errors
    } finally {
      setIsLoadingCategories(false);
    }
  }, [locale]);

  // Load user's selected categories on mount
  useEffect(() => {
    loadUserCategories();
  }, [loadUserCategories]);

  // Auto-refresh when categories or language change (from settings)
  useEffect(() => {
    const unsubscribe = onPreferenceFeedRefresh(() => {
      // Clear any selected category filter since categories may have changed
      clearCategoryFilter();
      // Reload categories
      loadUserCategories();
    });

    return () => unsubscribe();
  }, [loadUserCategories, clearCategoryFilter]);

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery, selectedCategorySlug);
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedCategorySlug, performSearch]);

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

  // Fetch the first page of a category from the cursor feed (browse view).
  const fetchCategoryFacts = useCallback(
    async (categorySlug: string): Promise<FactWithRelations[]> => {
      const res = await api.getFactsFeed({
        language: locale,
        categories: categorySlug,
        limit: CATEGORY_BROWSE_LIMIT,
      });
      seedFactDetailsCache(res.facts);
      return res.facts.map(mapApiFactToRelations);
    },
    [locale, seedFactDetailsCache]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (searchQuery.trim()) {
      await performSearch(searchQuery, selectedCategorySlug);
    } else if (selectedCategorySlug) {
      // Refresh category facts
      try {
        const facts = await fetchCategoryFacts(selectedCategorySlug);
        setCategoryFacts(sortByImageAvailability(facts));
      } catch {
        // Ignore refresh errors
      }
    }
    setRefreshing(false);
  }, [searchQuery, selectedCategorySlug, performSearch, fetchCategoryFacts]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (text.trim().length > 0) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  }, []);

  // Cancel handler for the native header search bar (the native bar clears its
  // own text on cancel; we only mirror the state reset).
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  }, []);

  // Selected category name — drives the search bar placeholder below. Derived
  // before the header effect so the effect can depend on the primitive string.
  const selectedCategoryName = useMemo(
    () =>
      selectedCategorySlug
        ? (userCategories.find((cat) => cat.slug === selectedCategorySlug)?.name ?? null)
        : null,
    [selectedCategorySlug, userCategories]
  );

  // Native-stack header search bar: iOS gets the system (glass) search field
  // under the large title, Android the native toolbar search. With a category
  // selected, the field itself carries the scope ("Search in Science...") —
  // the native search bar has no token/chip API, so the placeholder is the
  // label — and an X appears in the header to clear the filter (replaces the
  // old in-content chip row). Re-runs on selection/locale change only.
  useEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        ref: searchBarRef,
        placeholder: selectedCategoryName
          ? t('searchInCategory', { category: selectedCategoryName })
          : t('discoverPlaceholder'),
        autoCapitalize: 'none' as const,
        hideWhenScrolling: false,
        onChangeText: (e: { nativeEvent: { text: string } }) =>
          handleSearchChange(e.nativeEvent.text),
        onCancelButtonPress: clearSearch,
        // onCancelButtonPress is iOS-only; Android's collapse event is onClose.
        // Without it, closing the toolbar search leaves stale results state.
        onClose: clearSearch,
      },
      headerRight: selectedCategoryName
        ? () => (
            <Pressable
              onPress={clearCategoryFilter}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              role="button"
              aria-label={t('allCategories')}
              testID="discover-clear-category"
            >
              <X
                size={iconSizes.md}
                color={theme === 'dark' ? hexColors.dark.primary : hexColors.light.primary}
              />
            </Pressable>
          )
        : undefined,
    });
  }, [
    navigation,
    t,
    handleSearchChange,
    clearSearch,
    selectedCategoryName,
    clearCategoryFilter,
    iconSizes.md,
    theme,
  ]);

  // Handle category selection
  const handleCategoryPress = useCallback(
    async (categorySlug: string) => {
      // If tapping the same category, deselect it
      if (selectedCategorySlug === categorySlug) {
        setSelectedCategorySlug(null);
        setCategoryFacts([]);
        return;
      }

      setSelectedCategorySlug(categorySlug);
      setIsLoadingCategoryFacts(true);

      try {
        const facts = await fetchCategoryFacts(categorySlug);
        setCategoryFacts(sortByImageAvailability(facts));

        // Track category browse event
        trackCategoryBrowse({
          category: categorySlug,
          factsCount: facts.length,
        });
      } catch {
        // Ignore fact loading errors
        setCategoryFacts([]);
      } finally {
        setIsLoadingCategoryFacts(false);
      }
    },
    [selectedCategorySlug, fetchCategoryFacts]
  );

  // Consume pending category selection from home screen CTA on focus
  useFocusEffect(
    useCallback(() => {
      const pendingSlug = consumePendingDiscoverCategory();
      if (pendingSlug) {
        handleCategoryPress(pendingSlug);
      }
    }, [handleCategoryPress])
  );

  // Get selected category object
  const selectedCategory = useMemo(
    () =>
      selectedCategorySlug
        ? userCategories.find((cat) => cat.slug === selectedCategorySlug) || null
        : null,
    [selectedCategorySlug, userCategories]
  );

  // Insert native ads into search results and category facts
  type DiscoverListItem = FactWithRelations | NativeAdPlaceholder;

  // When an ad slot reports failure (no-fill / AdMob rate-limit), drop its
  // placeholder so the list closes the gap rather than showing a spacer.
  const [failedAdKeys, setFailedAdKeys] = useState<Set<string>>(() => new Set());
  const handleAdFailed = useCallback((key: string) => {
    setFailedAdKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // isPremium triggers re-computation to remove/add native ads
  const searchDataWithAds = useMemo(() => {
    const withAds = insertNativeAds(searchResults, NATIVE_ADS.FIRST_AD_INDEX.DISCOVER);
    if (failedAdKeys.size === 0) return withAds;
    return withAds.filter((item) => !(isNativeAdPlaceholder(item) && failedAdKeys.has(item.key)));
  }, [searchResults, isPremium, failedAdKeys]);

  // isPremium triggers re-computation to remove/add native ads
  const categoryDataWithAds = useMemo(() => {
    const withAds = insertNativeAds(categoryFacts, NATIVE_ADS.FIRST_AD_INDEX.DISCOVER);
    if (failedAdKeys.size === 0) return withAds;
    return withAds.filter((item) => !(isNativeAdPlaceholder(item) && failedAdKeys.has(item.key)));
  }, [categoryFacts, isPremium, failedAdKeys]);

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: DiscoverListItem) => {
    if (isNativeAdPlaceholder(item)) return item.key;
    return item.id.toString();
  }, []);

  // Split FlashList recycle pools: ad cells and fact cells never share a reusable view.
  const getItemType = useCallback(
    (item: DiscoverListItem) => (isNativeAdPlaceholder(item) ? 'ad' : 'fact'),
    []
  );

  // Compute fact ID lists for navigation
  const searchFactIds = useMemo(() => searchResults.map((f) => f.id), [searchResults]);
  const categoryFactIds = useMemo(() => categoryFacts.map((f) => f.id), [categoryFacts]);

  // Memoized renderItem for search results
  const renderSearchItem = useCallback(
    ({ item }: ListRenderItemInfo<DiscoverListItem>) => {
      if (isNativeAdPlaceholder(item)) {
        const adKey = item.key;
        return (
          <ContentContainer>
            <NativeAdCard slotKey={adKey} onAdFailed={() => handleAdFailed(adKey)} />
          </ContentContainer>
        );
      }
      const factIndex = searchFactIds.indexOf(item.id);
      return (
        <FactListItem
          item={item}
          isTablet={isTablet}
          onPress={(fact) =>
            handleFactPress(fact, 'discover_search', searchFactIds, factIndex >= 0 ? factIndex : 0)
          }
          selectedCategory={selectedCategory}
        />
      );
    },
    // Depend on the slug (primitive) rather than the Category object so renderItem
    // does not churn when userCategories reloads with an identical selection.
    [isTablet, handleFactPress, selectedCategory?.slug, searchFactIds, handleAdFailed]
  );

  // Memoized renderItem for category facts
  const renderCategoryItem = useCallback(
    ({ item }: ListRenderItemInfo<DiscoverListItem>) => {
      if (isNativeAdPlaceholder(item)) {
        const adKey = item.key;
        return (
          <ContentContainer>
            <NativeAdCard slotKey={adKey} onAdFailed={() => handleAdFailed(adKey)} />
          </ContentContainer>
        );
      }
      const factIndex = categoryFactIds.indexOf(item.id);
      return (
        <FactListItem
          item={item}
          isTablet={isTablet}
          onPress={(fact) =>
            handleFactPress(
              fact,
              'discover_category',
              categoryFactIds,
              factIndex >= 0 ? factIndex : 0
            )
          }
          selectedCategory={selectedCategory}
        />
      );
    },
    // See note on renderSearchItem above.
    [isTablet, handleFactPress, selectedCategory?.slug, categoryFactIds, handleAdFailed]
  );

  // Memoized refresh controls
  const searchRefreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />,
    [refreshing, handleRefresh]
  );

  const categoryRefreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          if (selectedCategorySlug) {
            await handleCategoryPress(selectedCategorySlug);
          }
          setRefreshing(false);
        }}
      />
    ),
    [refreshing, selectedCategorySlug, handleCategoryPress]
  );

  // The selected-category indicator lives in the native header now: the search
  // placeholder carries the scope and headerRight is an X that clears the
  // filter. No in-content chip row anymore.
  const renderEmptyState = useCallback(() => {
    const hasQuery = searchQuery.trim().length > 0;
    const searchFinished = !isSearching;

    // In-flight search feedback (used to be a small spinner in the custom
    // search input row, which is gone now).
    if (hasQuery && !searchFinished && searchResults.length === 0) {
      return (
        <EmptyDiscoverState paddingHorizontal={spacing.xl} gap={spacing.md}>
          <ActivityIndicator size="large" color={hexColors[theme].primary} />
        </EmptyDiscoverState>
      );
    }

    if (hasQuery && searchFinished && searchResults.length === 0) {
      return (
        <EmptyState
          title={t('noDiscoverResults')}
          description={t('noDiscoverResultsDescription')}
        />
      );
    }

    // Show category grid when no search has been performed and no category is selected
    if (!hasQuery && !selectedCategorySlug) {
      const numColumns = config.discoverColumns;
      const iconSize = iconSizes.md;

      // Split categories into rows of 2 (or 3 on tablet)
      const rows: Category[][] = [];
      for (let i = 0; i < userCategories.length; i += numColumns) {
        rows.push(userCategories.slice(i, i + numColumns));
      }

      if (isLoadingCategories) {
        return (
          <EmptyDiscoverState paddingHorizontal={spacing.xl} gap={spacing.md}>
            <ActivityIndicator size="large" color={hexColors[theme].primary} />
          </EmptyDiscoverState>
        );
      }

      if (userCategories.length === 0) {
        return (
          <EmptyDiscoverState paddingHorizontal={spacing.xl} gap={spacing.md}>
            <Text.Body textAlign="center" color="$textMuted">
              {t('discoverDescription')}
            </Text.Body>
          </EmptyDiscoverState>
        );
      }

      return (
        <ScrollView
          ref={categoryGridRef}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          contentInsetAdjustmentBehavior="automatic"
        >
          <CategoriesContainer
            paddingHorizontal={spacing.lg}
            paddingBottom={spacing.md}
            gap={spacing.lg}
            width="100%"
            maxWidth={isTablet ? LAYOUT.MAX_CONTENT_WIDTH : undefined}
            alignSelf={isTablet ? 'center' : undefined}
          >
            {/* The screen title is the native header's large title now; only
                the description remains in-content. */}
            <Animated.View entering={FadeIn.duration(300)}>
              <Text.Body color="$textMuted">{t('discoverDescription')}</Text.Body>
            </Animated.View>

            <CategoriesGrid gap={spacing.md}>
              {rows.map((row, rowIndex) => (
                <Animated.View
                  key={`row-${rowIndex}`}
                  entering={FadeInDown.delay(100 + rowIndex * 50).duration(300)}
                  needsOffscreenAlphaCompositing={Platform.OS === 'android'}
                >
                  <CategoryRow gap={spacing.md}>
                    {row.map((category) => {
                      const categoryColor = category.color_hex || '#0066FF';
                      const contrastColor = getContrastColor(categoryColor);

                      return (
                        <Pressable
                          key={category.slug}
                          onPress={() => handleCategoryPress(category.slug)}
                          style={({ pressed }) => [
                            categoryShadowStyles.wrapper,
                            {
                              flex: 1,
                              borderRadius: radius.xl,
                              // Category-colored glow instead of a flat black
                              // drop shadow — the tiles read as lit, not boxed.
                              shadowColor: categoryColor,
                              opacity: pressed ? 0.9 : 1,
                              transform: [{ scale: pressed ? 0.97 : 1 }],
                            },
                          ]}
                          testID={`discover-category-${rowIndex * numColumns + row.indexOf(category)}`}
                        >
                          <LinearGradient
                            colors={[categoryColor, darkenColor(categoryColor, 0.22)]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{
                              flex: 1,
                              borderRadius: radius.xl,
                              overflow: 'hidden',
                            }}
                          >
                            <DiscoverCategoryCard
                              height={media.topicCardSize}
                              paddingHorizontal={spacing.md}
                              gap={spacing.md}
                            >
                              {/* Layered decorative circles for depth */}
                              <View
                                pointerEvents="none"
                                style={{
                                  position: 'absolute',
                                  top: -media.categoryIconContainerSize * 0.5,
                                  left: -media.categoryIconContainerSize * 0.5,
                                  width: media.categoryIconContainerSize * 2,
                                  height: media.categoryIconContainerSize * 2,
                                  borderRadius: media.categoryIconContainerSize,
                                  backgroundColor: 'rgba(255, 255, 255, 0.10)',
                                }}
                              />
                              <View
                                pointerEvents="none"
                                style={{
                                  position: 'absolute',
                                  bottom: -media.categoryIconContainerSize * 0.7,
                                  right: -media.categoryIconContainerSize * 0.4,
                                  width: media.categoryIconContainerSize * 1.6,
                                  height: media.categoryIconContainerSize * 1.6,
                                  borderRadius: media.categoryIconContainerSize * 0.8,
                                  backgroundColor: 'rgba(255, 255, 255, 0.07)',
                                }}
                              />
                              <DiscoverCategoryIconContainer
                                width={media.categoryIconContainerSize}
                                height={media.categoryIconContainerSize}
                                borderRadius={media.categoryIconContainerSize / 2}
                                style={{
                                  backgroundColor:
                                    contrastColor === '#000000'
                                      ? 'rgba(0,0,0,0.12)'
                                      : 'rgba(255,255,255,0.22)',
                                }}
                              >
                                {getLucideIcon(category.icon, iconSize, contrastColor)}
                              </DiscoverCategoryIconContainer>
                              <DiscoverCategoryTextContainer gap={2}>
                                <Text.Label
                                  color={contrastColor}
                                  numberOfLines={1}
                                  fontFamily={FONT_FAMILIES.semibold}
                                >
                                  {category.name}
                                </Text.Label>
                              </DiscoverCategoryTextContainer>
                              <ChevronRight
                                size={iconSizes.sm}
                                color={contrastColor}
                                opacity={0.55}
                              />
                            </DiscoverCategoryCard>
                          </LinearGradient>
                        </Pressable>
                      );
                    })}
                    {/* Add empty placeholders for the last row if needed */}
                    {row.length < numColumns && (
                      <>
                        {Array.from({ length: numColumns - row.length }).map((_, idx) => (
                          <View key={`placeholder-${idx}`} style={{ flex: 1 }} />
                        ))}
                      </>
                    )}
                  </CategoryRow>
                </Animated.View>
              ))}
            </CategoriesGrid>
          </CategoriesContainer>
        </ScrollView>
      );
    }

    return null;
  }, [
    searchQuery,
    isSearching,
    searchResults.length,
    selectedCategorySlug,
    isTablet,
    userCategories,
    isLoadingCategories,
    theme,
    t,
    handleCategoryPress,
    spacing,
    radius,
    config,
    media,
    iconSizes,
  ]);

  const renderContent = useCallback(() => {
    const hasQuery = searchQuery.trim().length > 0;

    // Show search results if there's a search query
    if (hasQuery) {
      if (searchResults.length === 0) {
        return renderEmptyState();
      }

      return (
        <Animated.View
          key="search-results"
          entering={FadeInUp.duration(350).springify()}
          style={{ flex: 1 }}
        >
          <FlashList
            ref={searchListRef}
            data={searchDataWithAds}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            renderItem={renderSearchItem}
            refreshControl={searchRefreshControl}
            onScroll={handleSearchScroll}
            contentInsetAdjustmentBehavior="automatic"
            {...FLASH_LIST_SETTINGS}
          />
        </Animated.View>
      );
    }

    // Show category facts if a category is selected
    if (selectedCategorySlug) {
      if (isLoadingCategoryFacts) {
        return (
          <Animated.View key="loading" entering={FadeIn.duration(200)} style={{ flex: 1 }}>
            <EmptyDiscoverState paddingHorizontal={spacing.xl} gap={spacing.md}>
              <ActivityIndicator size="large" color={hexColors[theme].primary} />
            </EmptyDiscoverState>
          </Animated.View>
        );
      }

      if (categoryFacts.length === 0) {
        // Scrollable so the empty state sits below the translucent native
        // header (the header X clears the filter).
        return (
          <Animated.View
            key="empty"
            entering={FadeInUp.duration(350).springify()}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={{ flexGrow: 1 }}
              overScrollMode="never"
            >
              <EmptyState
                title={t('noDiscoverResults')}
                description={t('noDiscoverResultsDescription')}
              />
            </ScrollView>
          </Animated.View>
        );
      }

      return (
        <Animated.View
          key={`category-${selectedCategorySlug}`}
          entering={FadeInUp.duration(400).springify()}
          style={{ flex: 1 }}
        >
          <FlashList
            ref={categoryListRef}
            data={categoryDataWithAds}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            renderItem={renderCategoryItem}
            refreshControl={categoryRefreshControl}
            onScroll={handleCategoryScroll}
            contentInsetAdjustmentBehavior="automatic"
            {...FLASH_LIST_SETTINGS}
          />
        </Animated.View>
      );
    }

    // Show category grid when no search and no category selected
    return (
      <Animated.View key="category-grid" entering={FadeIn.duration(300)} style={{ flex: 1 }}>
        {renderEmptyState()}
      </Animated.View>
    );
  }, [
    searchQuery,
    searchResults,
    searchDataWithAds,
    selectedCategorySlug,
    isLoadingCategoryFacts,
    categoryFacts,
    categoryDataWithAds,
    theme,
    t,
    keyExtractor,
    getItemType,
    renderSearchItem,
    renderCategoryItem,
    searchRefreshControl,
    categoryRefreshControl,
    renderEmptyState,
    spacing,
  ]);

  return (
    <ScreenContainer edges={[]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <YStack flex={1}>{renderContent()}</YStack>
      {searchResults.length > 0 || (!selectedCategorySlug && <BannerAd collapsible="bottom" respectBottomInset />)}
    </ScreenContainer>
  );
}

const categoryShadowStyles = StyleSheet.create({
  wrapper: {
    // shadowColor is set per-tile (the category color) at the call site.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});

export default DiscoverScreen;
