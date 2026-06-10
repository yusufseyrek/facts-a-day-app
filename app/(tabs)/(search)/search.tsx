import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';

import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { styled, View } from '@tamagui/core';
import { X } from '@tamagui/lucide-icons';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { YStack } from 'tamagui';

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
import { useHeaderContentGap } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';
import {
  Screens,
  trackCategoryBrowse,
  trackScreenView,
  trackSearch,
} from '../../../src/services/analytics';
import * as api from '../../../src/services/api';
import { mapApiFactToRelations } from '../../../src/services/database';
import { getCachedFactImageSync } from '../../../src/services/images';
import { primePool } from '../../../src/services/nativeAdPool';
import { getIsConnected } from '../../../src/services/network';
import { getSelectedCategories } from '../../../src/services/onboarding';
import { onPreferenceFeedRefresh } from '../../../src/services/preferences';
import { getLastNonSearchTabPath } from '../../../src/services/tabHistory';
import { hexColors, useTheme } from '../../../src/theme';
import { blendHexColors, hexToHue, hexToRgba } from '../../../src/utils/colors';
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

function SearchScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const { isTablet, spacing, iconSizes, config, media, radius } = useResponsive();
  const headerGap = useHeaderContentGap();
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

  // Programmatic cancelSearch() goes through the same native path as the
  // user's ✕ (RNSSearchBar cancelSearch calls searchBarCancelButtonClicked),
  // so it ALSO fires onCancelButtonPress. This flag marks those programmatic
  // cancels so the iOS 26 exit-search navigation doesn't trigger for them.
  const suppressCancelExitRef = useRef(false);

  const clearCategoryFilter = useCallback(() => {
    setSelectedCategorySlug(null);
    setCategoryFacts([]);
    setSearchQuery('');
    setSearchResults([]);
    suppressCancelExitRef.current = true;
    searchBarRef.current?.clearText();
    searchBarRef.current?.cancelSearch();
    // The native event is delivered async; clear the flag well after it lands.
    setTimeout(() => {
      suppressCancelExitRef.current = false;
    }, 500);
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
  useScrollToTopHandler('search', scrollToTop);

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

  // iOS 26 search-role tab: drop straight into typing when the trailing
  // search button is tapped. Guarded via a ref snapshot (not deps) so it fires
  // once per focus session and never steals focus when returning from fact
  // details with an active query or category browse.
  const searchActivityRef = useRef({ hasQuery: false, hasCategory: false });
  searchActivityRef.current = {
    hasQuery: searchQuery.trim().length > 0,
    hasCategory: selectedCategorySlug !== null,
  };
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') return;
      const { hasQuery, hasCategory } = searchActivityRef.current;
      // Deferred: the native search bar attaches via navigation.setOptions
      // after mount, so an immediate focus() can hit a null ref.
      let blurTimer: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => {
        searchBarRef.current?.focus();
        if (hasQuery || hasCategory) {
          // Returning to an active query / category browse: the focus() is only
          // to ACTIVATE the UISearchController (see below), not to type — drop
          // the keyboard again immediately.
          // iOS 26 search-role tab: the ✕ in the tab bar only emits
          // onCancelButtonPress while the controller is active; if it was never
          // activated, UIKit swallows the press entirely and search mode can't
          // be exited. Keeping the controller active makes ✕ reliable.
          blurTimer = setTimeout(() => searchBarRef.current?.blur(), 60);
        }
      }, 100);
      return () => {
        clearTimeout(timer);
        if (blurTimer) clearTimeout(blurTimer);
      };
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

  // iOS 26 search-role tab: the ✕ next to the tab-bar-integrated search field
  // is this search bar's CANCEL button — UIKit swallows it without touching
  // tab selection (no tab event ever reaches JS, verified against
  // react-native-screens 4.25.2), so exiting search mode is implemented here:
  // cancel = leave the search tab, back to wherever the user came from.
  const exitSearchOnCancel = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const handleCancelButtonPress = useCallback(() => {
    clearSearch();
    if (!exitSearchOnCancel || suppressCancelExitRef.current) return;
    router.navigate(getLastNonSearchTabPath());
  }, [clearSearch, exitSearchOnCancel, router]);

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
        // iOS ✕/Cancel: clears state and (on iOS 26) exits the search tab.
        onCancelButtonPress: handleCancelButtonPress,
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
    handleCancelButtonPress,
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

    // Show category chips when no search has been performed and no category is selected
    if (!hasQuery && !selectedCategorySlug) {
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
          contentContainerStyle={{ paddingTop: headerGap }}
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

            {/* Minimal chip flow: compact pills that wrap, replacing the old
                2-column grid of 80pt tiles. The category color stays a quiet
                accent (hairline + barely-there tinted fill); no chevrons, no
                shadows, no per-row stagger. */}
            <Animated.View
              entering={FadeInDown.delay(80).duration(300)}
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing.sm,
              }}
            >
              {userCategories.map((category, index) => {
                const categoryColor = category.color_hex || '#0066FF';
                const surfaceColor = hexColors[theme].surface;

                return (
                  <Pressable
                    key={category.slug}
                    onPress={() => handleCategoryPress(category.slug)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    testID={`discover-category-${index}`}
                  >
                    <View
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        borderRadius: 999,
                        backgroundColor: blendHexColors(
                          categoryColor,
                          surfaceColor,
                          theme === 'dark' ? 0.1 : 0.07
                        ),
                        borderWidth: 1,
                        borderColor: hexToRgba(categoryColor, theme === 'dark' ? 0.35 : 0.25),
                      }}
                    >
                      <Text.Label color="$text" fontFamily={FONT_FAMILIES.semibold}>
                        {category.name}
                      </Text.Label>
                    </View>
                  </Pressable>
                );
              })}
            </Animated.View>
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
    headerGap,
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
            contentContainerStyle={{ paddingTop: headerGap }}
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
            contentContainerStyle={{ paddingTop: headerGap }}
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
    headerGap,
  ]);

  return (
    <ScreenContainer edges={[]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <YStack flex={1}>{renderContent()}</YStack>
      {searchResults.length > 0 ||
        (!selectedCategorySlug && <BannerAd collapsible="bottom" respectBottomInset />)}
    </ScreenContainer>
  );
}

export default SearchScreen;
