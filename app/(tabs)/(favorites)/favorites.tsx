import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { FlashList } from '@shopify/flash-list';
import { Heart } from '@tamagui/lucide-icons';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import {
  Button,
  ContentContainer,
  FONT_FAMILIES,
  LoadingContainer,
  ScreenContainer,
  Text,
} from '../../../src/components';
import { NativeAdCard } from '../../../src/components/ads/NativeAdCard';
import { ImageFactCard } from '../../../src/components/ImageFactCard';
import { LAYOUT, NATIVE_ADS } from '../../../src/config/app';
import { FLASH_LIST_SETTINGS } from '../../../src/config/factListSettings';
import { usePremium } from '../../../src/contexts';
import { useTranslation } from '../../../src/i18n';
import { Screens, trackScreenView } from '../../../src/services/analytics';
import * as api from '../../../src/services/api';
import { getFavoriteIds, mapApiFactToRelations } from '../../../src/services/database';
import { primePool } from '../../../src/services/nativeAdPool';
import { hexColors, useTheme } from '../../../src/theme';
import { getContrastColor } from '../../../src/utils/colors';
import {
  insertNativeAds,
  isNativeAdPlaceholder,
  type NativeAdPlaceholder,
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
  const { isPremium } = usePremium();

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
  // search row). Set once on mount: the state setters are stable, and
  // re-setting the options would recreate the native search bar mid-use.
  useEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        placeholder: t('searchFavorites'),
        onChangeText: (e: NativeSyntheticEvent<{ text: string }>) =>
          setSearchQuery(e.nativeEvent.text),
        onCancelButtonPress: () => {
          setSearchQuery('');
          setDebouncedQuery('');
        },
        hideWhenScrolling: false,
      },
    });
  }, [navigation]);

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
      primePool();
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

  // Insert native ads after filtering
  type FavoritesListItem = FactWithRelations | NativeAdPlaceholder;
  const [failedAdKeys, setFailedAdKeys] = useState<Set<string>>(() => new Set());
  const handleAdFailed = useCallback((key: string) => {
    setFailedAdKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);
  const filteredDataWithAds = useMemo(() => {
    const withAds = insertNativeAds(filteredFavorites, NATIVE_ADS.FIRST_AD_INDEX.FAVORITES);
    if (failedAdKeys.size === 0) return withAds;
    return withAds.filter((item) => !(isNativeAdPlaceholder(item) && failedAdKeys.has(item.key)));
    // isPremium triggers re-computation to remove/add native ads
  }, [filteredFavorites, isPremium, failedAdKeys]);

  const handleFactPress = useCallback(
    (fact: FactWithRelations, factIdList?: number[], indexInList?: number) => {
      if (factIdList && factIdList.length > 1 && indexInList !== undefined) {
        router.push(
          `/fact/${fact.id}?source=favorites&factIds=${JSON.stringify(factIdList)}&currentIndex=${indexInList}`
        );
      } else {
        router.push(`/fact/${fact.id}?source=favorites`);
      }
    },
    [router]
  );

  const handleRefresh = useCallback(() => {
    loadFavorites(true);
  }, [loadFavorites]);

  const handleCategoryPress = useCallback((categorySlug: string | null) => {
    // No scroll-to-top here: the chips live in the list header, so they are
    // only tappable when the list is already at the top — the old offset-0
    // scroll just dragged the content down under the translucent header.
    setSelectedCategory((prev) => (prev === categorySlug ? null : categorySlug));
  }, []);

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: FavoritesListItem) => {
    if (isNativeAdPlaceholder(item)) return item.key;
    return item.id.toString();
  }, []);

  // Split FlashList recycle pools so ad cells and fact cells never share a reusable view.
  const getItemType = useCallback(
    (item: FavoritesListItem) => (isNativeAdPlaceholder(item) ? 'ad' : 'fact'),
    []
  );

  // Memoized renderItem
  const renderItem = useCallback(
    ({ item }: { item: FavoritesListItem }) => {
      if (isNativeAdPlaceholder(item)) {
        const adKey = item.key;
        return (
          <ContentContainer>
            <NativeAdCard slotKey={adKey} onAdFailed={() => handleAdFailed(adKey)} />
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
    [handleFactPress, filteredFactIds, handleAdFailed]
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
          <ActivityIndicator size="large" color={hexColors.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  // Empty state: no favorites at all
  if (favorites.length === 0) {
    return (
      <ScreenContainer edges={[]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          padding={spacing.xl}
          gap={spacing.lg}
        >
          <YStack
            width={120}
            height={120}
            borderRadius={radius.full}
            backgroundColor="$primaryLight"
            alignItems="center"
            justifyContent="center"
            marginBottom={spacing.md}
          >
            <Heart
              size={iconSizes.hero}
              color={theme === 'dark' ? hexColors.dark.neonRed : hexColors.light.neonRed}
            />
          </YStack>
          <YStack alignItems="center" gap={spacing.md} maxWidth={LAYOUT.MAX_CONTENT_WIDTH}>
            <Text.Headline textAlign="center">{t('noFavorites')}</Text.Headline>
            <Text.Body textAlign="center" color="$textSecondary">
              {t('noFavoritesDescription')}
            </Text.Body>
          </YStack>
          <YStack width="100%" maxWidth={280} marginTop={spacing.md}>
            <Button onPress={() => router.push('/(tabs)/discover')}>{t('discoverFacts')}</Button>
          </YStack>
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
            contentContainerStyle={{ flexGrow: 1 }}
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
            data={filteredDataWithAds}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            renderItem={renderItem}
            refreshControl={refreshControl}
            onScroll={handleScroll}
            contentInsetAdjustmentBehavior="automatic"
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
