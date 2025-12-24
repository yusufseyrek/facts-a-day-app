import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, RefreshControl, ActivityIndicator } from 'react-native';
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
import type { FactWithRelations } from '../../src/services/database';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import * as database from '../../src/services/database';
import { useFocusEffect } from '@react-navigation/native';
import { trackScreenView, Screens } from '../../src/services/analytics';

export default function FavoritesScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const iconColor = useIconColor();

  const [favorites, setFavorites] = useState<FactWithRelations[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        <FlatList
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
                <FeedFactCard
                  title={item.title || item.content.substring(0, 80) + '...'}
                  summary={item.summary}
                  onPress={() => handleFactPress(item)}
                />
              </ContentContainer>
            </Animated.View>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      </YStack>
    </ScreenContainer>
  );
}
