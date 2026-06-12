import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Button, ContentContainer, EmptyState, Text } from '../../src/components';
import { ImageFactCard } from '../../src/components/ImageFactCard';
import { View, YStack } from '../../src/components/Stacks';
import { FLASH_LIST_SETTINGS } from '../../src/config/factListSettings';
import { useSeedFactDetailsCache } from '../../src/hooks/useFactDetail';
import { useGlassHeaderOptions, useHeaderContentGap } from '../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../src/i18n';
import { Screens, trackScreenView } from '../../src/services/analytics';
import * as api from '../../src/services/api';
import { mapApiFactToRelations } from '../../src/services/database';
import { factDetailBasePath } from '../../src/services/factMorph';
import { hexColors, useTheme } from '../../src/theme';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactWithRelations } from '../../src/services/database';

// One offset page of theme facts (same ballpark as a search page).
const PAGE_SIZE = 50;

/**
 * Story theme (event) fact list — opened from a theme button next to Mix on
 * the home story row. A search-results-style list of every published fact the
 * theme's server-side query collects, title-matches-first.
 */
export default function StoryThemeScreen() {
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const { isTablet, spacing } = useResponsive();
  const glassHeaderOptions = useGlassHeaderOptions();
  const headerGap = useHeaderContentGap();
  const insets = useSafeAreaInsets();
  const seedFactDetailsCache = useSeedFactDetailsCache(locale);
  const colors = hexColors[theme];

  // Header title: the tapped button's label paints instantly; the server's
  // (same, localized) name takes over once the first page lands — which also
  // covers entry points that never knew the name.
  const [themeName, setThemeName] = useState<string>(name ?? '');
  const [facts, setFacts] = useState<FactWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Serialize page loads; bump to invalidate in-flight responses on refresh.
  const requestSeqRef = useRef(0);

  const loadPage = useCallback(
    async (offset: number) => {
      const res = await api.getStoryThemeFacts({
        slug: slug!,
        language: locale,
        limit: PAGE_SIZE,
        offset,
      });
      seedFactDetailsCache(res.facts);
      return res;
    },
    [slug, locale, seedFactDetailsCache]
  );

  const loadInitial = useCallback(
    async (silent: boolean) => {
      const seq = ++requestSeqRef.current;
      if (!silent) {
        setLoading(true);
        setLoadFailed(false);
      }
      try {
        const res = await loadPage(0);
        if (seq !== requestSeqRef.current) return;
        setThemeName(res.theme?.name ?? name ?? '');
        setFacts(res.facts.map(mapApiFactToRelations));
        setHasMore(res.pagination.has_more);
        setLoadFailed(false);
      } catch {
        if (seq !== requestSeqRef.current) return;
        // Keep whatever is already on screen; only flag a failed FIRST paint.
        setLoadFailed(true);
      } finally {
        if (seq === requestSeqRef.current) setLoading(false);
      }
    },
    [loadPage, name]
  );

  // Keyed on the primitives, NOT loadInitial: seedFactDetailsCache (inside
  // loadPage) is a fresh function every render, so depending on the callback
  // chain would re-fire this effect each render — every setState restarts the
  // fetch and bumps requestSeq, discarding the in-flight page forever.
  useEffect(() => {
    trackScreenView(Screens.STORY_THEME);
    loadInitial(false);
  }, [slug, locale]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitial(true);
    setRefreshing(false);
  }, [loadInitial]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || loading || refreshing || !hasMore) return;
    const seq = requestSeqRef.current;
    setLoadingMore(true);
    try {
      const res = await loadPage(facts.length);
      if (seq !== requestSeqRef.current) return;
      // Offset pages can shift if facts publish mid-scroll — drop duplicates.
      setFacts((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        const fresh = res.facts.map(mapApiFactToRelations).filter((f) => !seen.has(f.id));
        return [...prev, ...fresh];
      });
      setHasMore(res.pagination.has_more);
    } catch {
      // Leave hasMore as-is; the next end-reach retries.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, refreshing, hasMore, facts.length, loadPage]);

  const factIds = useMemo(() => facts.map((f) => f.id), [facts]);

  const handleFactPress = useCallback(
    (fact: FactWithRelations) => {
      const base = factDetailBasePath(fact.id);
      const index = factIds.indexOf(fact.id);
      router.push(
        `${base}/${fact.id}?source=story_theme&factIds=${JSON.stringify(factIds)}&currentIndex=${index >= 0 ? index : 0}`
      );
    },
    [router, factIds]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FactWithRelations>) => (
      <ContentContainer>
        <ImageFactCard
          title={item.title || item.content.substring(0, 80) + '...'}
          imageUrl={item.image_url!}
          factId={item.id}
          category={item.categoryData || item.category}
          categorySlug={item.categoryData?.slug || item.category}
          onPress={() => handleFactPress(item)}
          isTablet={isTablet}
        />
      </ContentContainer>
    ),
    [isTablet, handleFactPress]
  );

  const keyExtractor = useCallback((item: FactWithRelations) => item.id.toString(), []);

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />,
    [refreshing, handleRefresh]
  );

  const listFooter = useMemo(
    () =>
      loadingMore ? (
        <View paddingVertical={spacing.lg} alignItems="center">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null,
    [loadingMore, spacing.lg, colors.primary]
  );

  const renderBody = () => {
    if (loading) {
      return (
        <YStack flex={1} justifyContent="center" alignItems="center" gap={spacing.md}>
          <ActivityIndicator size="large" color={colors.primary} />
        </YStack>
      );
    }

    if (facts.length === 0) {
      if (loadFailed) {
        return (
          <YStack flex={1} justifyContent="center" alignItems="center" gap={spacing.lg}>
            <Text.Body textAlign="center" color={colors.textSecondary}>
              {t('noDiscoverResultsDescription')}
            </Text.Body>
            <Button variant="secondary" onPress={() => loadInitial(false)}>
              {t('tryAgain')}
            </Button>
          </YStack>
        );
      }
      return (
        <EmptyState title={t('noDiscoverResults')} description={t('noDiscoverResultsDescription')} />
      );
    }

    return (
      <FlashList
        data={facts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        refreshControl={refreshControl}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.6}
        ListFooterComponent={listFooter}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: headerGap,
          // Android edge-to-edge: no automatic bottom inset on root-stack
          // screens (same note as badges.tsx); iOS gets it from the inset
          // adjustment above.
          paddingBottom: Platform.OS === 'android' ? insets.bottom : 0,
        }}
        {...FLASH_LIST_SETTINGS}
      />
    );
  };

  return (
    <View flex={1} backgroundColor={colors.background}>
      {/* Native glass header (root stack defaults to headerShown: false).
          Minimal back display: the previous route is the "(tabs)" group. */}
      <Stack.Screen
        options={{
          ...glassHeaderOptions,
          title: themeName,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {renderBody()}
    </View>
  );
}
