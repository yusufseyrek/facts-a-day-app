import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, FlatListProps, RefreshControl, ActivityIndicator, Animated as RNAnimated } from 'react-native';
import { YStack } from 'tamagui';
import { Star } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
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

// Create animated FlatList for native scroll events with parallax
const AnimatedFlatList = RNAnimated.createAnimatedComponent(FlatList) as React.ComponentType<
  FlatListProps<FactWithRelations> & { ref?: React.Ref<FlatList<FactWithRelations>> }
>;

export default function FavoritesScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const iconColor = useIconColor();

  const [favorites, setFavorites] = useState<FactWithRelations[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Scroll position for parallax effect on image cards
  const scrollY = useRef(new RNAnimated.Value(0)).current;

  const handleScroll = RNAnimated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  // Track screen view and reload favorites when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      trackScreenView(Screens.FAVORITES);
      loadFavorites();
    }, [locale])
  );

  const loadFavorites = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      }
      // Only show loading spinner on initial load (no data yet)

      const favoritedFacts = await database.getFavorites(locale);
      setFavorites(favoritedFacts);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  };

  const handleFactPress = (fact: FactWithRelations) => {
    router.push(`/fact/${fact.id}?source=favorites`);
  };

  const handleRefresh = () => {
    loadFavorites(true);
  };

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
        <AnimatedFlatList
          data={favorites}
          keyExtractor={(item) => item.id.toString()}
          ListHeaderComponent={() => (
            <Animated.View entering={FadeIn.duration(300)}>
              <ScreenHeader
                icon={<Star size={28} color={iconColor} />}
                title={t('favorites')}
              />
            </Animated.View>
          )}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
              <ContentContainer>
                {item.image_url ? (
                  <ImageFactCard
                    title={item.title || item.content.substring(0, 80) + '...'}
                    imageUrl={item.image_url}
                    category={item.categoryData || item.category}
                    categorySlug={item.categoryData?.slug || item.category}
                    onPress={() => handleFactPress(item)}
                    scrollY={scrollY}
                    cardIndex={index}
                  />
                ) : (
                  <FeedFactCard
                    title={item.title || item.content.substring(0, 80) + '...'}
                    summary={item.summary}
                    onPress={() => handleFactPress(item)}
                  />
                )}
              </ContentContainer>
            </Animated.View>
          )}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      </YStack>
    </ScreenContainer>
  );
}
