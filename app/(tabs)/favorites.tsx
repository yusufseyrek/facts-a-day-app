import React, { useCallback, useMemo, useRef,useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, useWindowDimensions } from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { Star } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { YStack } from 'tamagui';

import {
  ContentContainer,
  EmptyState,
  LoadingContainer,
  ScreenContainer,
  ScreenHeader,
  useIconColor,
} from '../../src/components';
import { ImageFactCard } from '../../src/components/ImageFactCard';
import {
  createFlatListGetItemLayout,
  FACT_FLAT_LIST_SETTINGS,
} from '../../src/config/factListSettings';
import { useScrollToTopHandler } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import { Screens,trackScreenView } from '../../src/services/analytics';
import * as database from '../../src/services/database';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactWithRelations } from '../../src/services/database';

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
  const { width } = useWindowDimensions();
  const { iconSizes } = useResponsive();

  const [favorites, setFavorites] = useState<FactWithRelations[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Scroll to top handler
  const listRef = useRef<FlatList<FactWithRelations>>(null);
  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);
  useScrollToTopHandler('favorites', scrollToTop);

  const loadFavorites = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        }

        const favoritedFacts = await database.getFavorites(locale);
        setFavorites(favoritedFacts);
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

  const handleFactPress = useCallback(
    (fact: FactWithRelations) => {
      router.push(`/fact/${fact.id}?source=favorites`);
    },
    [router]
  );

  const handleRefresh = useCallback(() => {
    loadFavorites(true);
  }, [loadFavorites]);

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: FactWithRelations) => item.id.toString(), []);

  // Memoized renderItem
  const renderItem = useCallback(
    ({ item }: { item: FactWithRelations }) => (
      <FactListItem item={item} onPress={handleFactPress} />
    ),
    [handleFactPress]
  );

  // Memoized refresh control
  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />,
    [refreshing, handleRefresh]
  );

  // Memoized getItemLayout for better scroll performance (all items have same height now)
  const getItemLayout = useMemo(() => createFlatListGetItemLayout(width, false), [width]);

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

  if (favorites.length === 0) {
    return (
      <ScreenContainer edges={['top']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <EmptyState title={t('noFavorites')} description={t('noFavoritesDescription')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <ScreenHeader icon={<Star size={iconSizes.lg} color={iconColor} />} title={t('favorites')} />
      <YStack flex={1}>
        <FlatList
          ref={listRef}
          data={favorites}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          refreshControl={refreshControl}
          getItemLayout={getItemLayout}
          {...FACT_FLAT_LIST_SETTINGS}
        />
      </YStack>
    </ScreenContainer>
  );
}
