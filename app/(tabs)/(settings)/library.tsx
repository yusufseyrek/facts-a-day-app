import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import {
  Button,
  ContentContainer,
  FONT_FAMILIES,
  ScreenContainer,
  Text,
} from '../../../src/components';
import { BookOpen, Crown, RefreshCw, Trash2, WifiOff } from '../../../src/components/icons';
import { ImageFactCard } from '../../../src/components/ImageFactCard';
import { XStack, YStack } from '../../../src/components/Stacks';
import { OFFLINE_LIBRARY } from '../../../src/config/app';
import { FLASH_LIST_SETTINGS } from '../../../src/config/factListSettings';
import { usePremium } from '../../../src/contexts';
import { useSeedFactDetailsCache } from '../../../src/hooks/useFactDetail';
import { useHeaderContentGap } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';
import { Screens, trackScreenView } from '../../../src/services/analytics';
import { mapApiFactToRelations } from '../../../src/services/database';
import { openFactDetail } from '../../../src/services/factMorph';
import { getIsConnected, onNetworkChange } from '../../../src/services/network';
import {
  cancelOfflineSync,
  clearOfflineLibrary,
  computeSideTargets,
  getLastSyncAt,
  getOfflineFacts,
  getOfflineLimit,
  getOfflineStorageBytes,
  getOfflineSyncState,
  setOfflineLimit,
  subscribeOfflineSync,
  syncOfflineLibrary,
} from '../../../src/services/offlineLibrary';
import { useTabBarBannerInset } from '../../../src/services/tabBarBannerInset';
import { hexColors, useTheme } from '../../../src/theme';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { FactResponse } from '../../../src/services/api';
import type { FactWithRelations } from '../../../src/services/database';

// Human-readable byte size (mirrors the helper in settings.tsx).
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface FactListItemProps {
  item: FactWithRelations;
  onPress: (fact: FactWithRelations) => void;
}

const FactListItem = React.memo(
  ({ item, onPress }: FactListItemProps) => {
    const handlePress = useCallback(() => onPress(item), [item, onPress]);
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
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.title === next.item.title &&
    prev.item.image_url === next.item.image_url
);
FactListItem.displayName = 'OfflineFactListItem';

export default function OfflineLibraryScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { isPremium } = usePremium();
  const { spacing, radius, iconSizes, media } = useResponsive();
  const headerGap = useHeaderContentGap();
  const bannerInset = useTabBarBannerInset();
  const colors = hexColors[theme];
  // useSeedFactDetailsCache returns a fresh closure each render; keep it in a
  // ref so `refresh` can stay stable (it only needs the latest seeder).
  const seedFactCache = useSeedFactDetailsCache(locale);
  const seedRef = useRef(seedFactCache);
  seedRef.current = seedFactCache;

  const sync = useSyncExternalStore(subscribeOfflineSync, getOfflineSyncState, getOfflineSyncState);

  const [limit, setLimit] = useState(0);
  const [facts, setFacts] = useState<FactWithRelations[]>([]);
  const [count, setCount] = useState(0);
  const [storageBytes, setStorageBytes] = useState(0);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(getIsConnected());
  const [loading, setLoading] = useState(true);

  // Reflect connectivity for the offline banner / disabled actions.
  useEffect(() => onNetworkChange(setIsOnline), []);

  const refresh = useCallback(async () => {
    try {
      const [storedLimit, raw, used, syncedAt] = await Promise.all([
        getOfflineLimit(),
        getOfflineFacts(),
        getOfflineStorageBytes(),
        getLastSyncAt(),
      ]);
      // Seed React Query so opening a fact renders from cache — the detail
      // screen's getFactById would otherwise fail with no connection.
      seedRef.current(raw);
      const renderable = raw
        .filter((f): f is FactResponse & { image_url: string } => !!f.image_url)
        .map(mapApiFactToRelations);
      setLimit(storedLimit);
      setFacts(renderable);
      // Count what we actually list (image cards) so the "X downloaded" header
      // never claims more than the user can open offline.
      setCount(renderable.length);
      setStorageBytes(used);
      setLastSync(syncedAt);
    } catch {
      // Leave whatever is on screen.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.OFFLINE_LIBRARY);
      refresh();
    }, [refresh])
  );

  // Re-read once a sync settles (so counts/storage/list update).
  const prevStatus = useRef(sync.status);
  useEffect(() => {
    if (prevStatus.current === 'syncing' && sync.status !== 'syncing') {
      refresh();
    }
    prevStatus.current = sync.status;
  }, [sync.status, refresh]);

  const startSync = useCallback(() => {
    if (!getIsConnected()) {
      Alert.alert(t('offlineLibrary'), t('offlineNeedsConnection'));
      return;
    }
    // Fire-and-forget: the sync-state store drives the progress UI.
    syncOfflineLibrary(locale);
  }, [locale, t]);

  const handleSelectSize = useCallback(
    async (size: number) => {
      if (size === limit) return;
      await setOfflineLimit(size);
      setLimit(size);
      if (size === 0) {
        await clearOfflineLibrary();
        refresh();
        return;
      }
      startSync();
    },
    [limit, refresh, startSync]
  );

  const handleClear = useCallback(() => {
    Alert.alert(t('offlineClear'), t('offlineClearConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('offlineClear'),
        style: 'destructive',
        onPress: async () => {
          await setOfflineLimit(0);
          await clearOfflineLibrary();
          setLimit(0);
          refresh();
        },
      },
    ]);
  }, [t, refresh]);

  const factIds = useMemo(() => facts.map((f) => f.id), [facts]);

  const handleFactPress = useCallback(
    (fact: FactWithRelations) => {
      const idx = factIds.indexOf(fact.id);
      openFactDetail(router, fact.id, {
        source: 'favorites',
        factIds,
        currentIndex: idx >= 0 ? idx : 0,
      });
    },
    [router, factIds]
  );

  const renderItem = useCallback(
    ({ item }: { item: FactWithRelations }) => (
      <FactListItem item={item} onPress={handleFactPress} />
    ),
    [handleFactPress]
  );
  const keyExtractor = useCallback((item: FactWithRelations) => String(item.id), []);

  const isSyncing = sync.status === 'syncing';
  const percent =
    sync.phase === 'downloading' && sync.total > 0
      ? Math.round((sync.completed / sync.total) * 100)
      : 0;

  const { newest, oldest } = computeSideTargets(limit);

  // ── Management header (selector, status, actions) ──────────────────────────
  const header = (
    <ContentContainer>
      <YStack gap={spacing.md} paddingBottom={spacing.md}>
        {!isOnline && (
          <XStack
            alignItems="center"
            gap={spacing.sm}
            padding={spacing.md}
            borderRadius={radius.lg}
            backgroundColor="$surface"
            borderWidth={1}
            borderColor="$border"
          >
            <WifiOff size={iconSizes.sm} color={colors.textSecondary} />
            <Text.Caption color="$textSecondary" flex={1}>
              {t('offlineYoureOffline')}
            </Text.Caption>
          </XStack>
        )}

        {!isPremium ? (
          // Premium gate — controls hidden; any pre-existing downloads still list below.
          <YStack
            alignItems="center"
            gap={spacing.md}
            padding={spacing.xl}
            borderRadius={radius.lg}
            backgroundColor="$surface"
            borderWidth={1}
            borderColor="$border"
          >
            <Crown size={iconSizes.hero} color={colors.warning} />
            <Text.Headline textAlign="center">{t('offlineLibrary')}</Text.Headline>
            <Text.Body textAlign="center" color="$textSecondary">
              {count > 0 ? t('offlinePremiumGateHasDownloads') : t('offlinePremiumGate')}
            </Text.Body>
            <YStack width="100%" maxWidth={280}>
              <Button onPress={() => router.push('/paywall')}>{t('offlineUnlockCta')}</Button>
            </YStack>
          </YStack>
        ) : (
          <>
            <Text.Body color="$textSecondary">{t('offlinePremiumGate')}</Text.Body>

            {/* Size selector */}
            <Text.Label fontFamily={FONT_FAMILIES.semibold}>{t('offlineCacheSize')}</Text.Label>
            <XStack flexWrap="wrap" gap={spacing.sm}>
              {OFFLINE_LIBRARY.SIZE_OPTIONS.map((size) => {
                const active = size === limit;
                return (
                  <Pressable
                    key={size}
                    onPress={() => handleSelectSize(size)}
                    disabled={isSyncing}
                  >
                    <XStack
                      height={media.chipHeight}
                      paddingHorizontal={spacing.md}
                      borderRadius={radius.full}
                      alignItems="center"
                      justifyContent="center"
                      backgroundColor={active ? '$primary' : '$surface'}
                      borderWidth={active ? 0 : 1}
                      borderColor="$border"
                      opacity={isSyncing ? 0.5 : 1}
                    >
                      <Text.Caption
                        color={active ? '#FFFFFF' : '$textSecondary'}
                        fontFamily={FONT_FAMILIES.semibold}
                      >
                        {size === 0 ? t('offlineSizeOff') : t('offlineSizeFacts', { count: size })}
                      </Text.Caption>
                    </XStack>
                  </Pressable>
                );
              })}
            </XStack>
            {limit > 0 && (
              <Text.Caption color="$textSecondary">
                {t('offlineSizeHint', { newest, oldest })}
              </Text.Caption>
            )}

            {/* Status */}
            <YStack gap={spacing.xs}>
              <Text.Caption color="$textSecondary">
                {count > 0
                  ? `${t('offlineDownloaded', { count })} · ${t('offlineStorageUsed', {
                      size: formatBytes(storageBytes),
                    })}`
                  : t('offlineNeverSynced')}
              </Text.Caption>
              {lastSync && !isSyncing && (
                <Text.Caption color="$textSecondary">
                  {t('offlineLastSynced', {
                    time: new Date(lastSync).toLocaleDateString(locale),
                  })}
                </Text.Caption>
              )}
            </YStack>

            {/* Progress / actions */}
            {isSyncing ? (
              <YStack gap={spacing.sm}>
                <XStack alignItems="center" gap={spacing.sm}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text.Caption flex={1} color="$textSecondary">
                    {sync.phase === 'downloading'
                      ? t('offlineSyncing', { percent })
                      : t('offlinePreparing')}
                  </Text.Caption>
                </XStack>
                <YStack
                  height={8}
                  borderRadius={radius.full}
                  backgroundColor="$border"
                  overflow="hidden"
                >
                  <YStack
                    height={8}
                    borderRadius={radius.full}
                    backgroundColor="$primary"
                    width={`${Math.max(4, percent)}%`}
                  />
                </YStack>
                <Pressable onPress={cancelOfflineSync}>
                  <Text.Caption textAlign="center" color={colors.error}>
                    {t('offlineCancel')}
                  </Text.Caption>
                </Pressable>
              </YStack>
            ) : (
              limit > 0 && (
                <XStack gap={spacing.sm}>
                  <Pressable onPress={startSync} style={{ flex: 1 }} disabled={!isOnline}>
                    <XStack
                      height={media.buttonHeight}
                      borderRadius={radius.full}
                      alignItems="center"
                      justifyContent="center"
                      gap={spacing.sm}
                      backgroundColor="$primary"
                      opacity={isOnline ? 1 : 0.4}
                    >
                      <RefreshCw size={iconSizes.sm} color="#FFFFFF" />
                      <Text.Label color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                        {count > 0 ? t('offlineUpdate') : t('offlineDownload')}
                      </Text.Label>
                    </XStack>
                  </Pressable>
                  {count > 0 && (
                    <Pressable onPress={handleClear}>
                      <XStack
                        height={media.buttonHeight}
                        paddingHorizontal={spacing.lg}
                        borderRadius={radius.full}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor="$surface"
                        borderWidth={1}
                        borderColor="$border"
                      >
                        <Trash2 size={iconSizes.sm} color={colors.error} />
                      </XStack>
                    </Pressable>
                  )}
                </XStack>
              )
            )}
          </>
        )}

        {count > 0 && (
          <XStack alignItems="center" gap={spacing.sm} paddingTop={spacing.sm}>
            <BookOpen size={iconSizes.sm} color={colors.textSecondary} />
            <Text.Label fontFamily={FONT_FAMILIES.semibold}>
              {t('offlineDownloaded', { count })}
            </Text.Label>
          </XStack>
        )}
      </YStack>
    </ContentContainer>
  );

  const emptyState =
    !loading && count === 0 && !isSyncing ? (
      <ContentContainer>
        <YStack alignItems="center" gap={spacing.sm} padding={spacing.xl}>
          <Text.Body textAlign="center" color="$textSecondary">
            {isPremium ? t('offlineEmptyDescription') : ''}
          </Text.Body>
        </YStack>
      </ContentContainer>
    ) : null;

  return (
    <ScreenContainer edges={[]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1 }}>
        <FlashList
          data={facts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={emptyState}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingTop: headerGap, paddingBottom: bannerInset }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => (isPremium && limit > 0 ? startSync() : refresh())}
            />
          }
          {...FLASH_LIST_SETTINGS}
        />
      </Animated.View>
    </ScreenContainer>
  );
}
