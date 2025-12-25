import React, { useState, useCallback, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, RefreshControl, ActivityIndicator, useWindowDimensions } from 'react-native';
import { YStack } from 'tamagui';
import { Star } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { tokens } from '../../src/theme/tokens';
import {
  FeedFactCard,
  EmptyState,
  ScreenContainer,
  ScreenHeader,
  ContentContainer,
  LoadingContainer,
  useIconColor,
} from '../../src/components';
import { ImageFactCard } from '../../src/components/ImageFactCard';
import type { FactWithRelations } from '../../src/services/database';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import * as database from '../../src/services/database';
import { useFocusEffect } from '@react-navigation/native';
import { trackScreenView, Screens } from '../../src/services/analytics';
import { FACT_FLAT_LIST_SETTINGS, getEstimatedItemHeight } from '../../src/config/factListSettings';

// Memoized list item component to prevent re-renders
interface FactListItemProps {
  item: FactWithRelations;
  onPress: (fact: FactWithRelations) => void;
}

const FactListItem = React.memo(({ item, onPress }: FactListItemProps) => {
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <ContentContainer>
      {item.image_url ? (
        <ImageFactCard
          title={item.title || item.content.substring(0, 80) + '...'}
          imageUrl={item.image_url}
          factId={item.id}
          category={item.categoryData || item.category}
          categorySlug={item.categoryData?.slug || item.category}
          onPress={handlePress}
        />
      ) : (
        <FeedFactCard
          title={item.title || item.content.substring(0, 80) + '...'}
          summary={item.summary}
          onPress={handlePress}
        />
      )}
    </ContentContainer>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.image_url === nextProps.item.image_url
  );
});

FactListItem.displayName = 'FactListItem';

export default function FavoritesScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const iconColor = useIconColor();
  const { width } = useWindowDimensions();

  const [favorites, setFavorites] = useState<FactWithRelations[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFavorites = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      }

      const favoritedFacts = await database.getFavorites(locale);
      setFavorites(favoritedFacts);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [locale]);

  // Track screen view and reload favorites when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.FAVORITES);
      loadFavorites();
    }, [locale, loadFavorites])
  );

  const handleFactPress = useCallback((fact: FactWithRelations) => {
    router.push(`/fact/${fact.id}?source=favorites`);
  }, [router]);

  const handleRefresh = useCallback(() => {
    loadFavorites(true);
  }, [loadFavorites]);

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: FactWithRelations) => 
    item.id.toString(), []);

  // Memoized renderItem
  const renderItem = useCallback(({ item }: { item: FactWithRelations }) => (
    <FactListItem item={item} onPress={handleFactPress} />
  ), [handleFactPress]);

  // Memoized header component
  const ListHeaderComponent = useMemo(() => (
    <ScreenHeader
      icon={<Star size={28} color={iconColor} />}
      title={t('favorites')}
    />
  ), [iconColor, t]);

  // Memoized refresh control
  const refreshControl = useMemo(() => (
    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
  ), [refreshing, handleRefresh]);

  // Memoized getItemLayout for better scroll performance
  const getItemLayout = useCallback((
    _data: FactWithRelations[] | null,
    index: number
  ) => {
    // Use isTablet to get correct height for tablet layouts
    const isTabletLayout = width >= 768;
    const estimatedHeight = getEstimatedItemHeight(true, width, isTabletLayout);
    return {
      length: estimatedHeight,
      offset: estimatedHeight * index,
      index,
    };
  }, [width]);

  // Only show loading spinner on initial load when there's no data yet
  if (initialLoading && favorites.length === 0) {
    return (
      <ScreenContainer edges={["top"]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
        </LoadingContainer>
      </ScreenContainer>
    );
  }

  if (favorites.length === 0) {
    return (
      <ScreenContainer edges={["top"]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <EmptyState
          title={t('noFavorites')}
          description={t('noFavoritesDescription')}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top"]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <YStack flex={1}>
        <FlatList
          data={favorites}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeaderComponent}
          renderItem={renderItem}
          refreshControl={refreshControl}
          getItemLayout={getItemLayout}
          {...FACT_FLAT_LIST_SETTINGS}
        />
      </YStack>
    </ScreenContainer>
  );
}
