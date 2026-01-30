import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput } from 'react-native';
import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { styled } from '@tamagui/core';
import { Heart, Search, X, XCircle } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { XStack, YStack } from 'tamagui';

import {
  Button,
  ContentContainer,
  FONT_FAMILIES,
  LoadingContainer,
  ScreenContainer,
  Text,
  useIconColor,
} from '../../src/components';
import { NativeAdCard } from '../../src/components/ads/NativeAdCard';
import { ImageFactCard } from '../../src/components/ImageFactCard';
import { LAYOUT } from '../../src/config/app';
import { FLASH_LIST_SETTINGS, getImageCardHeight } from '../../src/config/factListSettings';
import {
  insertNativeAds,
  isNativeAdPlaceholder,
  type NativeAdPlaceholder,
} from '../../src/utils/insertNativeAds';
import { useTranslation } from '../../src/i18n';
import { Screens, trackScreenView } from '../../src/services/analytics';
import * as database from '../../src/services/database';
import { prefetchFactImage, prefetchFactImagesWithLimit } from '../../src/services/images';
import { hexColors, useTheme } from '../../src/theme';
import { getContrastColor } from '../../src/utils/colors';
import { useFlashListScrollToTop } from '../../src/utils/useFlashListScrollToTop';
import { useResponsive } from '../../src/utils/useResponsive';

import type { Category, FactWithRelations } from '../../src/services/database';

// Styled components
const SearchInputContainer = styled(XStack, {
  flex: 1,
  alignItems: 'center',
  backgroundColor: '$surface',
  borderWidth: 1,
  borderColor: '$border',
});

const SearchInput = styled(TextInput, {
  flex: 1,
  height: '100%',
});

const ClearButton = styled(YStack, {
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$border',
});

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
  const iconColor = useIconColor();
  const { iconSizes, screenWidth, isTablet, spacing, radius, typography, media } = useResponsive();

  const [favorites, setFavorites] = useState<FactWithRelations[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const previousFavoritesCount = useRef<number>(0);

  // Search animation
  const searchExpand = useSharedValue(0);

  const searchContainerStyle = useAnimatedStyle(() => ({
    opacity: searchExpand.value,
  }));

  // Scroll to top handler with smart instant/animated behavior
  const { listRef, handleScroll, scrollToTop } = useFlashListScrollToTop({ screenId: 'favorites' });

  const loadFavorites = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        }

        const [favoritedFacts, favoriteCategories] = await Promise.all([
          database.getFavorites(locale),
          database.getFavoriteCategories(locale),
        ]);
        // Scroll to top when a new favorite has been added
        if (favoritedFacts.length > previousFavoritesCount.current && previousFavoritesCount.current > 0) {
          setTimeout(() => scrollToTop(), 50);
        }
        previousFavoritesCount.current = favoritedFacts.length;

        setFavorites(favoritedFacts);
        setCategories(favoriteCategories);
        prefetchFactImagesWithLimit(favoritedFacts);
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

  // Scroll to top when search query changes
  useEffect(() => {
    if (debouncedQuery) {
      // Delay scroll to allow filtered list to re-render
      setTimeout(() => scrollToTop(), 50);
    }
  }, [debouncedQuery, scrollToTop]);

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
  const filteredDataWithAds = useMemo(
    () => insertNativeAds(filteredFavorites),
    [filteredFavorites],
  );

  const handleFactPress = useCallback(
    (fact: FactWithRelations, factIdList?: number[], indexInList?: number) => {
      // Prefetch image before navigation for faster modal display
      if (fact.image_url) {
        prefetchFactImage(fact.image_url, fact.id);
      }
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
    setSelectedCategory((prev) => (prev === categorySlug ? null : categorySlug));
    // Delay scroll to allow state update and re-render
    setTimeout(() => scrollToTop(), 50);
  }, [scrollToTop]);

  const openSearch = useCallback(() => {
    setIsSearchMode(true);
    searchExpand.value = withTiming(1, { duration: 250 });
    // Focus after animation starts
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [searchExpand]);

  const closeSearch = useCallback(() => {
    searchInputRef.current?.blur();
    setSearchQuery('');
    setDebouncedQuery('');
    searchExpand.value = withTiming(0, { duration: 200 });
    setTimeout(() => setIsSearchMode(false), 200);
  }, [searchExpand]);

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: FavoritesListItem) => {
    if (isNativeAdPlaceholder(item)) return item.key;
    return item.id.toString();
  }, []);

  // Calculate exact item height for FlashList layout
  const itemHeight = useMemo(
    () => getImageCardHeight(screenWidth, isTablet, spacing.md),
    [screenWidth, isTablet, spacing.md]
  );

  // Override item layout for exact dimensions
  const overrideItemLayout = useCallback(
    (layout: { span?: number; size?: number }) => {
      layout.size = itemHeight;
    },
    [itemHeight]
  );

  // Memoized renderItem
  const renderItem = useCallback(
    ({ item }: { item: FavoritesListItem }) => {
      if (isNativeAdPlaceholder(item)) {
        return (
          <ContentContainer>
            <NativeAdCard />
          </ContentContainer>
        );
      }
      const factIndex = filteredFactIds.indexOf(item.id);
      return (
        <FactListItem item={item} onPress={(fact) => handleFactPress(fact, filteredFactIds, factIndex >= 0 ? factIndex : 0)} />
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
      <ScreenContainer edges={['top']}>
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
      <ScreenContainer edges={['top']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <YStack flex={1} justifyContent="center" alignItems="center" padding={spacing.xl} gap={spacing.lg}>
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
            <Button onPress={() => router.push('/(tabs)/discover')}>
              {t('discoverFacts')}
            </Button>
          </YStack>
        </YStack>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      {/* Header with search icon or search input */}
      {isSearchMode ? (
        <Animated.View style={searchContainerStyle}>
          <XStack
            padding={spacing.lg}
            paddingBottom={spacing.sm}
            alignItems="center"
            gap={spacing.sm}
          >
            <SearchInputContainer
              height={media.searchInputHeight}
              borderRadius={radius.md}
              paddingHorizontal={spacing.md}
              gap={spacing.sm}
            >
              <Search
                size={iconSizes.md}
                color={theme === 'dark' ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
              />
              <SearchInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('searchFavorites')}
                placeholderTextColor={
                  theme === 'dark' ? hexColors.dark.textMuted : hexColors.light.textMuted
                }
                style={{
                  color: theme === 'dark' ? hexColors.dark.text : hexColors.light.text,
                  fontSize: typography.fontSize.body,
                  paddingVertical: spacing.xs,
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              <Pressable
                onPress={searchQuery.length > 0 ? () => setSearchQuery('') : closeSearch}
                hitSlop={8}
              >
                <ClearButton
                  width={media.clearButtonSize}
                  height={media.clearButtonSize}
                  borderRadius={radius.full}
                >
                  {searchQuery.length > 0 ? (
                    <XCircle
                      size={iconSizes.sm}
                      color={
                        theme === 'dark' ? hexColors.dark.textSecondary : hexColors.light.textSecondary
                      }
                    />
                  ) : (
                    <X
                      size={iconSizes.sm}
                      color={
                        theme === 'dark' ? hexColors.dark.textSecondary : hexColors.light.textSecondary
                      }
                    />
                  )}
                </ClearButton>
              </Pressable>
            </SearchInputContainer>
          </XStack>
        </Animated.View>
      ) : (
        <XStack padding={spacing.lg} paddingBottom={spacing.sm} alignItems="center" gap={spacing.sm}>
          <XStack height={media.searchInputHeight} alignItems="center" flex={1} gap={spacing.sm}>
            <Heart size={iconSizes.lg} color={iconColor} />
            <Text.Headline flex={1}>{t('favorites')}</Text.Headline>
          </XStack>
          <Pressable onPress={openSearch} hitSlop={8}>
            <Search
              size={iconSizes.lg}
              color={theme === 'dark' ? hexColors.dark.textSecondary : hexColors.light.textSecondary}
            />
          </Pressable>
        </XStack>
      )}

      {/* Category Filter Chips */}
      {categories.length > 0 && (
        <Animated.View entering={FadeIn.duration(250)} layout={LinearTransition.duration(250)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
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
      )}

      {/* Content */}
      <YStack flex={1}>
        {filteredFavorites.length === 0 && hasActiveFilters ? (
          // No-results state
          <YStack flex={1} justifyContent="center" alignItems="center" padding={spacing.xl} gap={spacing.md}>
            <Text.Headline textAlign="center">{t('noMatchingFavorites')}</Text.Headline>
            <Text.Body textAlign="center" color="$textSecondary">
              {t('noMatchingFavoritesDescription')}
            </Text.Body>
          </YStack>
        ) : (
          <FlashList
            ref={listRef}
            data={filteredDataWithAds}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            refreshControl={refreshControl}
            onScroll={handleScroll}
            overrideItemLayout={overrideItemLayout}
            snapToInterval={itemHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            {...FLASH_LIST_SETTINGS}
          />
        )}
      </YStack>
    </ScreenContainer>
  );
}
