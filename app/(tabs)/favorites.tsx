import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { styled } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { Star } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { tokens } from '../../src/theme/tokens';
import { H1, FeedFactCard, EmptyState } from '../../src/components';
import { BannerAd } from '../../src/components/ads/BannerAd';
import type { FactWithRelations } from '../../src/services/database';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import * as database from '../../src/services/database';
import { useFocusEffect } from '@react-navigation/native';
import { trackScreenView, Screens } from '../../src/services/analytics';

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: '$background',
});

const Header = styled(XStack, {
  padding: tokens.space.xl,
  paddingBottom: tokens.space.md,
  alignItems: 'center',
  gap: tokens.space.sm,
});

const ContentContainer = styled(YStack, {
  paddingHorizontal: tokens.space.lg,
});

const LoadingContainer = styled(YStack, {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  gap: tokens.space.md,
});

export default function FavoritesScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();

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
      <Container edges={["top"]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <LoadingContainer>
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
        </LoadingContainer>
      </Container>
    );
  }

  if (favorites.length === 0) {
    return (
      <Container edges={["top"]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <EmptyState
          title={t('noFavorites')}
          description={t('noFavoritesDescription')}
        />
      </Container>
    );
  }

  return (
    <Container edges={["top"]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <YStack flex={1}>
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id.toString()}
          ListHeaderComponent={() => (
            <Header>
              <Star
                size={28}
                color={theme === 'dark' ? '#FFFFFF' : tokens.color.light.text}
              />
              <H1>{t('favorites')}</H1>
            </Header>
          )}
          renderItem={({ item }) => (
            <ContentContainer>
              <FeedFactCard
                title={item.title || item.content.substring(0, 80) + '...'}
                summary={item.summary}
                onPress={() => handleFactPress(item)}
              />
            </ContentContainer>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
        <BannerAd position="favorites" />
      </YStack>
    </Container>
  );
}
