import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import {
  Button,
  ContentContainer,
  FONT_FAMILIES,
  LoadingContainer,
  ScreenContainer,
  Text,
} from '../../../src/components';
import { NativeAdCard } from '../../../src/components/ads';
import { Heart } from '../../../src/components/icons';
import { ImageFactCard } from '../../../src/components/ImageFactCard';
import { XStack, YStack } from '../../../src/components/Stacks';
import { LAYOUT, NATIVE_ADS } from '../../../src/config/app';
import { FLASH_LIST_SETTINGS } from '../../../src/config/factListSettings';
import { useHeaderContentGap } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';
import {
  Screens,
  trackFavoritesCategoryFilter,
  trackScreenView,
} from '../../../src/services/analytics';
import * as api from '../../../src/services/api';
import { getFavoriteIds, mapApiFactToRelations } from '../../../src/services/database';
import { openFactDetail } from '../../../src/services/factMorph';
import { useTabBarBannerInset } from '../../../src/services/tabBarBannerInset';
import { hexColors, useTheme } from '../../../src/theme';
import { getContrastColor, hexToRgba } from '../../../src/utils/colors';
import {
  insertNativeAds,
  isNativeAdPlaceholder,
  type NativeAdPlaceholder,
  pooledAdKey,
} from '../../../src/utils/insertNativeAds';
import { useFlashListScrollToTop } from '../../../src/utils/useFlashListScrollToTop';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { Category, FactWithRelations } from '../../../src/services/database';

// Memoized list item component to prevent re-renders
interface FactListItemProps {
  item: FactWithRelations;
  onPress: (fact: FactWithRelations) => void;
}

const FactListItem = React.memo(
  ({ item, onPress }: FactListItemProps) => {
    const handlePress = useCallback(() => {
      onPress(item);
    }, [item, onPress]);

    return (
      <ContentContainer>
        <ImageFactCard
          title={item.title || item.content.substring(0, 80) + '...'}
          imageUrl={item.image_url!}
          factId={item.id}
          category={item.categoryData || item.category}
          categorySlug={item.categoryData?.slug || item.category}
          onPress={handlePress}
          showOfflineSave
        />
      </ContentContainer>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.title === nextProps.item.title &&
      prevProps.item.image_url === nextProps.item.image_url
    );
  }
);

FactListItem.displayName = 'FactListItem';

export default function FavoritesScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { iconSizes, spacing, radius, media } = useResponsive();
  const headerGap = useHeaderContentGap();
  const bannerInset = useTabBarBannerInset();

  const [favorites, setFavorites] = useState<FactWithRelations[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const previousFavoritesCount = useRef<number>(0);

  // Scroll to top handler with smart instant/animated behavior
  const { listRef, handleScroll, scrollToTop, getScrollOffset } = useFlashListScrollToTop({
    screenId: 'favorites',
  });

  // Search lives in the native header search bar (replaces the old in-screen
  // search row). Hidden while there is nothing to search — with no favorites
  // the bar is dead weight over the empty state. Re-set only when crossing the
  // empty/non-empty boundary: the state setters are stable, and re-setting the
  // options on every render would recreate the native search bar mid-use.
  const showSearchBar = !initialLoading && favorites.length > 0;
  useEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: showSearchBar
        ? {
            placeholder: t('searchFavorites'),
            onChangeText: (e: NativeSyntheticEvent<{ text: string }>) =>
              setSearchQuery(e.nativeEvent.text),
            onCancelButtonPress: () => {
              setSearchQuery('');
              setDebouncedQuery('');
            },
            // onCancelButtonPress is iOS-only; Android's collapse event is onClose.
            onClose: () => {
              setSearchQuery('');
              setDebouncedQuery('');
            },
            hideWhenScrolling: false,
          }
        : undefined,
    });
    if (!showSearchBar) {
      // The bar may disappear mid-query (last favorite removed): drop the
      // query state too, or a phantom filter survives into the next session.
      setSearchQuery('');
      setDebouncedQuery('');
    }
  }, [navigation, showSearchBar]);

  const loadFavorites = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        }

        // Favorite ids are stored locally; hydrate their content from the API
        // (no local facts mirror), preserving the newest-favorited-first order.
        const ids = await getFavoriteIds();
        const hydrated = ids.length > 0 ? await api.getFactsByIds(ids, locale) : [];
        const byId = new Map(hydrated.map((f) => [f.id, f]));
        const favoritedFacts = ids
          .map((id) => byId.get(id))
          .filter((f): f is NonNullable<typeof f> => f != null)
          .map(mapApiFactToRelations);

        // Derive the category chips from the hydrated favorites (deduped by slug).
        const seen = new Set<string>();
        const favoriteCategories: Category[] = [];
        for (const fact of favoritedFacts) {
          const cat = fact.categoryData;
          if (cat?.slug && !seen.has(cat.slug)) {
            seen.add(cat.slug);
            favoriteCategories.push(cat);
          }
        }
        favoriteCategories.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        // Scroll to top when a new favorite has been added
        if (
          favoritedFacts.length > previousFavoritesCount.current &&
          previousFavoritesCount.current > 0
        ) {
          setTimeout(() => scrollToTop(), 50);
        }
        previousFavoritesCount.current = favoritedFacts.length;

        setFavorites(favoritedFacts);
        setCategories(favoriteCategories);
      } catch {
        // Ignore favorites loading errors
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [locale]
  );

  // Track screen view and reload favorites when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.FAVORITES);
      loadFavorites();
    }, [locale, loadFavorites])
  );

  // Debounce search query
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Scroll to top when search query changes — but only when actually scrolled
  // down. At rest under the translucent header the offset is NEGATIVE
  // (automatic content inset), so an unconditional offset-0 scroll visibly
  // drags the content down under the header.
  useEffect(() => {
    if (debouncedQuery && getScrollOffset() > 0) {
      // Delay scroll to allow filtered list to re-render
      setTimeout(() => scrollToTop(), 50);
    }
  }, [debouncedQuery, scrollToTop, getScrollOffset]);

  // Filter favorites based on search query and selected category
  const filteredFavorites = useMemo(() => {
    let result = favorites;

    // Filter by category
    if (selectedCategory) {
      result = result.filter(
        (f) => f.category === selectedCategory || f.categoryData?.slug === selectedCategory
      );
    }

    // Filter by search query
    if (debouncedQuery.trim()) {
      const query = debouncedQuery.trim().toLowerCase();
      result = result.filter(
        (f) =>
          f.title?.toLowerCase().includes(query) ||
          f.content.toLowerCase().includes(query) ||
          f.summary?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [favorites, selectedCategory, debouncedQuery]);

  const filteredFactIds = useMemo(() => filteredFavorites.map((f) => f.id), [filteredFavorites]);

  // Interleave a bounded pool of native ad placeholders into the favorites list.
  // Returns `filteredFavorites` unchanged for premium / ads-off sessions.
  const filteredFavoritesWithAds = useMemo(
    () =>
      insertNativeAds(filteredFavorites, {
        firstAdIndex: NATIVE_ADS.FEED.FAVORITES.firstAdIndex,
        interval: NATIVE_ADS.FEED.FAVORITES.interval,
        getAdKey: pooledAdKey(
          NATIVE_ADS.FEED.FAVORITES.keyPrefix,
          NATIVE_ADS.FEED.FAVORITES.poolSize
        ),
      }),
    [filteredFavorites]
  );

  const handleFactPress = useCallback(
    (fact: FactWithRelations, factIdList?: number[], indexInList?: number) => {
      openFactDetail(router, fact.id, {
        source: 'favorites',
        factIds: factIdList,
        currentIndex: indexInList,
      });
    },
    [router]
  );

  const handleRefresh = useCallback(() => {
    loadFavorites(true);
  }, [loadFavorites]);

  const handleCategoryPress = useCallback(
    (categorySlug: string | null) => {
      // No scroll-to-top here: the chips live in the list header, so they are
      // only tappable when the list is already at the top — the old offset-0
      // scroll just dragged the content down under the translucent header.
      const nextCategory = selectedCategory === categorySlug ? null : categorySlug;
      let result = favorites;
      if (nextCategory) {
        result = result.filter(
          (f) => f.category === nextCategory || f.categoryData?.slug === nextCategory
        );
      }
      if (debouncedQuery.trim()) {
        const query = debouncedQuery.trim().toLowerCase();
        result = result.filter(
          (f) =>
            f.title?.toLowerCase().includes(query) ||
            f.content.toLowerCase().includes(query) ||
            f.summary?.toLowerCase().includes(query)
        );
      }
      trackFavoritesCategoryFilter({
        category: nextCategory ?? 'all',
        resultCount: result.length,
        totalFavorites: favorites.length,
      });
      setSelectedCategory(nextCategory);
    },
    [selectedCategory, favorites, debouncedQuery]
  );

  // Memoized keyExtractor (handles the native ad placeholder union)
  const keyExtractor = useCallback(
    (item: FactWithRelations | NativeAdPlaceholder) =>
      isNativeAdPlaceholder(item) ? item.key : item.id.toString(),
    []
  );

  // Split FlashList recycle pools so ad cells and fact cards never share a view.
  const getItemType = useCallback(
    (item: FactWithRelations | NativeAdPlaceholder) =>
      isNativeAdPlaceholder(item) ? 'ad' : 'fact',
    []
  );

  // Memoized renderItem
  const renderItem = useCallback(
    ({ item }: { item: FactWithRelations | NativeAdPlaceholder }) => {
      if (isNativeAdPlaceholder(item)) {
        return (
          <ContentContainer>
            <NativeAdCard slotKey={item.key} aspectRatio={NativeMediaAspectRatio.LANDSCAPE} />
          </ContentContainer>
        );
      }
      const factIndex = filteredFactIds.indexOf(item.id);
      return (
        <FactListItem
          item={item}
          onPress={(fact) => handleFactPress(fact, filteredFactIds, factIndex >= 0 ? factIndex : 0)}
        />
      );
    },
    [handleFactPress, filteredFactIds]
  );

  // Memoized refresh control
  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />,
    [refreshing, handleRefresh]
  );

  // Check if filters are active
  const hasActiveFilters = selectedCategory !== null || debouncedQuery.trim().length > 0;

  // Only show loading spinner on initial load when there's no data yet
  if (initialLoading && favorites.length === 0) {
    return (
      <ScreenContainer edges={[]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={hexColors[theme].primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  // Empty state: no favorites at all. Heart hero in a neon ring with a soft
  // glow halo (same neon accent language as the home category rings), staggered
  // entrances, CTA into discover. The header search bar is hidden in this state.
  if (favorites.length === 0) {
    const neonRed = hexColors[theme].neonRed;

    return (
      <ScreenContainer edges={[]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          padding={spacing.xl}
          gap={spacing.xl}
        >
          <Animated.View entering={FadeInDown.duration(400)}>
            {/* Sized to the HALO (not the ring) so the stack gap is measured
                from the glow's edge — otherwise the absolute halo overflows
                the layout box and visually eats the spacing below. */}
            <YStack alignItems="center" justifyContent="center" width={190} height={190}>
              {/* Soft halo behind the ring */}
              <YStack
                position="absolute"
                width={190}
                height={190}
                borderRadius={95}
                backgroundColor={hexToRgba(neonRed, theme === 'dark' ? 0.08 : 0.06)}
              />
              <YStack
                width={130}
                height={130}
                borderRadius={65}
                alignItems="center"
                justifyContent="center"
                backgroundColor="$surface"
                borderWidth={1}
                borderColor={hexToRgba(neonRed, theme === 'dark' ? 0.45 : 0.3)}
                style={{
                  shadowColor: neonRed,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: theme === 'dark' ? 0.35 : 0.25,
                  shadowRadius: 24,
                  elevation: 6,
                }}
              >
                <Heart size={iconSizes.hero} color={neonRed} fill={neonRed} />
              </YStack>
            </YStack>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(400)}>
            <YStack alignItems="center" gap={spacing.sm} maxWidth={LAYOUT.MAX_CONTENT_WIDTH}>
              <Text.Headline textAlign="center">{t('noFavorites')}</Text.Headline>
              <Text.Body textAlign="center" color="$textSecondary">
                {t('noFavoritesDescription')}
              </Text.Body>
            </YStack>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(160).duration(400)}
            style={{ width: '100%', maxWidth: 280 }}
          >
            <Button onPress={() => router.push('/(tabs)/search')}>{t('discoverFacts')}</Button>
          </Animated.View>
        </YStack>
      </ScreenContainer>
    );
  }

  // Category filter chips. Rendered INSIDE the scroll content (list header /
  // scrollable empty state): as a sibling above the list they'd sit at y=0
  // behind the translucent native header.
  const chipsRow =
    categories.length > 0 ? (
      <Animated.View entering={FadeIn.duration(250)} layout={LinearTransition.duration(250)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          overScrollMode="never"
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
            gap: spacing.sm,
          }}
        >
          {/* "All" chip */}
          <Pressable onPress={() => handleCategoryPress(null)}>
            <XStack
              height={media.chipHeight}
              borderRadius={radius.full}
              paddingHorizontal={spacing.md}
              alignItems="center"
              justifyContent="center"
              backgroundColor={selectedCategory === null ? '$primary' : '$surface'}
              borderWidth={selectedCategory === null ? 0 : 1}
              borderColor="$border"
            >
              <Text.Caption
                color={selectedCategory === null ? '#FFFFFF' : '$textSecondary'}
                fontFamily={FONT_FAMILIES.semibold}
              >
                {t('allCategories')}
              </Text.Caption>
            </XStack>
          </Pressable>

          {/* Category chips */}
          {categories.map((category) => {
            const isActive = selectedCategory === category.slug;
            const categoryColor = category.color_hex || hexColors.light.primary;
            const contrastColor = getContrastColor(categoryColor);

            return (
              <Pressable key={category.slug} onPress={() => handleCategoryPress(category.slug)}>
                <XStack
                  height={media.chipHeight}
                  borderRadius={radius.full}
                  paddingHorizontal={spacing.md}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={isActive ? categoryColor : '$surface'}
                  borderWidth={isActive ? 0 : 1}
                  borderColor="$border"
                >
                  <Text.Caption
                    color={isActive ? contrastColor : '$textSecondary'}
                    fontFamily={FONT_FAMILIES.semibold}
                  >
                    {category.name}
                  </Text.Caption>
                </XStack>
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>
    ) : null;

  return (
    <ScreenContainer edges={[]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      {/* Content */}
      <YStack flex={1}>
        {filteredFavorites.length === 0 && hasActiveFilters ? (
          // No-results state — scrollable so the chips stay below the native
          // header and remain reachable to clear the filter.
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ flexGrow: 1, paddingTop: headerGap }}
            overScrollMode="never"
          >
            {chipsRow}
            <YStack
              flex={1}
              justifyContent="center"
              alignItems="center"
              padding={spacing.xl}
              gap={spacing.md}
            >
              <Text.Headline textAlign="center">{t('noMatchingFavorites')}</Text.Headline>
              <Text.Body textAlign="center" color="$textSecondary">
                {t('noMatchingFavoritesDescription')}
              </Text.Body>
            </YStack>
          </ScrollView>
        ) : (
          <FlashList
            ref={listRef}
            data={filteredFavoritesWithAds}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            renderItem={renderItem}
            refreshControl={refreshControl}
            onScroll={handleScroll}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingTop: headerGap, paddingBottom: bannerInset }}
            ListHeaderComponent={chipsRow ?? undefined}
            // FlashList v2 anchors visible content by default when data
            // changes; on a filter swap that reads as a small phantom scroll.
            maintainVisibleContentPosition={{ disabled: true }}
            {...FLASH_LIST_SETTINGS}
          />
        )}
      </YStack>
    </ScreenContainer>
  );
}
