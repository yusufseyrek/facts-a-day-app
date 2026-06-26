import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import {
  Button,
  ContentContainer,
  FONT_FAMILIES,
  ScreenContainer,
  Text,
} from '../../../src/components';
import {
  BookOpen,
  Clock,
  Crown,
  Download,
  RefreshCw,
  Smartphone,
  Trash2,
  WifiOff,
} from '../../../src/components/icons';
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
import { hexColors, PAYWALL_GOLD, useTheme } from '../../../src/theme';
import { darkenColor, getContrastColor } from '../../../src/utils/colors';
import { useResponsive } from '../../../src/utils/useResponsive';

import type { FactResponse } from '../../../src/services/api';
import type { FactWithRelations } from '../../../src/services/database';

/** Warm near-black for glyphs on the gold premium crest (matches paywall.tsx). */
const CREST_INK = '#1A1A2E';

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
          showOfflineSave
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

  const activeInk = getContrastColor(colors.neonCyan);
  // The single gradient moment: the cyan-to-violet premium hero (TriviaStatsHero
  // grammar). neonCyan is the screen's signature accent (its Settings row).
  const heroColors = [colors.primary, darkenColor(colors.neonPurple, 0.22)] as const;

  // ── Premium hero — gradient identity + live state ──────────────────────────
  const hero = (
    <Animated.View entering={FadeInDown.duration(350)}>
      <LinearGradient
        colors={heroColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.xl, overflow: 'hidden' }}
      >
        {/* Decorative depth circles (TriviaGridCard pattern). */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -iconSizes.hero * 0.7,
            right: -iconSizes.hero * 0.5,
            width: iconSizes.hero * 2.2,
            height: iconSizes.hero * 2.2,
            borderRadius: iconSizes.hero * 1.1,
            backgroundColor: 'rgba(255,255,255,0.10)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: -iconSizes.hero * 0.8,
            left: -iconSizes.hero * 0.4,
            width: iconSizes.hero * 1.7,
            height: iconSizes.hero * 1.7,
            borderRadius: iconSizes.hero * 0.85,
            backgroundColor: 'rgba(255,255,255,0.07)',
          }}
        />
        <YStack padding={spacing.lg} gap={spacing.md}>
          <XStack alignItems="center" gap={spacing.sm}>
            <YStack
              width={iconSizes.xxl}
              height={iconSizes.xxl}
              borderRadius={iconSizes.xxl / 2}
              backgroundColor="rgba(255,255,255,0.20)"
              alignItems="center"
              justifyContent="center"
            >
              <BookOpen size={iconSizes.md} color="#FFFFFF" />
            </YStack>
            <Text.Tiny
              color="#FFFFFF"
              opacity={0.8}
              fontFamily={FONT_FAMILIES.semibold}
              letterSpacing={1.2}
              style={{ textTransform: 'uppercase' }}
            >
              {t('offlineLibrary')}
            </Text.Tiny>
          </XStack>

          {count > 0 ? (
            <YStack gap={spacing.sm}>
              <XStack alignItems="flex-end" gap={spacing.sm}>
                <Text.Display color="#FFFFFF" fontFamily={FONT_FAMILIES.extrabold} letterSpacing={-1}>
                  {count}
                </Text.Display>
                <Text.Body
                  color="#FFFFFF"
                  opacity={0.85}
                  fontFamily={FONT_FAMILIES.semibold}
                  marginBottom={spacing.sm}
                >
                  {t('offlineFactsReady')}
                </Text.Body>
              </XStack>
              <XStack gap={spacing.sm} flexWrap="wrap">
                <XStack
                  alignItems="center"
                  gap={spacing.xs}
                  paddingHorizontal={spacing.sm}
                  paddingVertical={spacing.xs}
                  borderRadius={radius.full}
                  backgroundColor="rgba(255,255,255,0.16)"
                >
                  <Smartphone size={iconSizes.xs} color="#FFFFFF" />
                  <Text.Tiny color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                    {formatBytes(storageBytes)}
                  </Text.Tiny>
                </XStack>
                {lastSync && !isSyncing && (
                  <XStack
                    alignItems="center"
                    gap={spacing.xs}
                    paddingHorizontal={spacing.sm}
                    paddingVertical={spacing.xs}
                    borderRadius={radius.full}
                    backgroundColor="rgba(255,255,255,0.16)"
                  >
                    <Clock size={iconSizes.xs} color="#FFFFFF" />
                    <Text.Tiny color="#FFFFFF" fontFamily={FONT_FAMILIES.semibold}>
                      {t('offlineLastSynced', {
                        time: new Date(lastSync).toLocaleDateString(locale),
                      })}
                    </Text.Tiny>
                  </XStack>
                )}
              </XStack>
            </YStack>
          ) : (
            <YStack gap={spacing.xs}>
              <Text.Headline color="#FFFFFF" fontFamily={FONT_FAMILIES.extrabold}>
                {t('offlineLibraryRowValue')}
              </Text.Headline>
              <Text.Caption color="#FFFFFF" opacity={0.85}>
                {t('offlinePremiumGate')}
              </Text.Caption>
            </YStack>
          )}
        </YStack>
      </LinearGradient>
    </Animated.View>
  );

  // ── Management header (hero, selector, progress/actions) ───────────────────
  const header = (
    <ContentContainer>
      <YStack gap={spacing.lg} paddingBottom={spacing.md}>
        {!isOnline && (
          <XStack
            alignItems="center"
            gap={spacing.sm}
            padding={spacing.md}
            borderRadius={radius.lg}
            backgroundColor="$cardBackground"
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
          <Animated.View entering={FadeInDown.duration(350)}>
            <YStack
              alignItems="center"
              gap={spacing.md}
              padding={spacing.xl}
              borderRadius={radius.xl}
              backgroundColor="$cardBackground"
              borderWidth={1}
              borderColor="$border"
            >
              <LinearGradient
                colors={[PAYWALL_GOLD.light, PAYWALL_GOLD.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={{
                  width: iconSizes.hero + spacing.md,
                  height: iconSizes.hero + spacing.md,
                  borderRadius: (iconSizes.hero + spacing.md) / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Crown size={iconSizes.lg} color={CREST_INK} fill={CREST_INK} />
              </LinearGradient>
              <Text.Headline textAlign="center">{t('offlineLibrary')}</Text.Headline>
              <Text.Body textAlign="center" color="$textSecondary">
                {count > 0 ? t('offlinePremiumGateHasDownloads') : t('offlinePremiumGate')}
              </Text.Body>
              <YStack width="100%" maxWidth={280}>
                <Button onPress={() => router.push('/paywall')}>{t('offlineUnlockCta')}</Button>
              </YStack>
            </YStack>
          </Animated.View>
        ) : (
          <>
            {hero}

            {/* Size selector */}
            <YStack gap={spacing.sm}>
              <Text.Tiny
                color="$textSecondary"
                fontFamily={FONT_FAMILIES.semibold}
                letterSpacing={1}
                style={{ textTransform: 'uppercase' }}
              >
                {t('offlineCacheSize')}
              </Text.Tiny>
              <XStack flexWrap="wrap" gap={spacing.sm}>
                {OFFLINE_LIBRARY.SIZE_OPTIONS.map((size) => {
                  const active = size === limit;
                  return (
                    <Pressable
                      key={size}
                      onPress={() => handleSelectSize(size)}
                      disabled={isSyncing}
                      style={({ pressed }) => ({ opacity: isSyncing ? 0.5 : pressed ? 0.7 : 1 })}
                    >
                      <XStack
                        height={media.chipHeight}
                        paddingHorizontal={spacing.lg}
                        borderRadius={radius.full}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={active ? colors.neonCyan : colors.cardBackground}
                        borderWidth={1}
                        borderColor={active ? colors.neonCyan : colors.border}
                      >
                        <Text.Caption
                          color={active ? activeInk : colors.textSecondary}
                          fontFamily={FONT_FAMILIES.semibold}
                        >
                          {size === 0
                            ? t('offlineSizeOff')
                            : t('offlineSizeFacts', { count: size })}
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
            </YStack>

            {/* Progress / actions */}
            {isSyncing ? (
              <YStack
                gap={spacing.sm}
                padding={spacing.md}
                borderRadius={radius.lg}
                backgroundColor="$cardBackground"
                borderWidth={1}
                borderColor="$border"
              >
                <XStack alignItems="center" gap={spacing.sm}>
                  <ActivityIndicator size="small" color={colors.neonCyan} />
                  <Text.Label flex={1} color="$text" fontFamily={FONT_FAMILIES.semibold}>
                    {sync.phase === 'downloading'
                      ? t('offlineSyncing', { percent })
                      : t('offlinePreparing')}
                  </Text.Label>
                  <Pressable onPress={cancelOfflineSync} hitSlop={spacing.sm}>
                    <Text.Caption color={colors.error} fontFamily={FONT_FAMILIES.semibold}>
                      {t('offlineCancel')}
                    </Text.Caption>
                  </Pressable>
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
                    backgroundColor={colors.neonCyan}
                    width={`${Math.max(4, percent)}%`}
                  />
                </YStack>
              </YStack>
            ) : (
              limit > 0 && (
                <XStack gap={spacing.sm}>
                  <Pressable
                    onPress={startSync}
                    style={({ pressed }) => ({ flex: 1, opacity: pressed && isOnline ? 0.85 : 1 })}
                    disabled={!isOnline}
                  >
                    <XStack
                      height={media.buttonHeight}
                      borderRadius={radius.full}
                      alignItems="center"
                      justifyContent="center"
                      gap={spacing.sm}
                      backgroundColor={colors.neonCyan}
                      opacity={isOnline ? 1 : 0.4}
                    >
                      {count > 0 ? (
                        <RefreshCw size={iconSizes.sm} color={activeInk} />
                      ) : (
                        <Download size={iconSizes.sm} color={activeInk} />
                      )}
                      <Text.Label color={activeInk} fontFamily={FONT_FAMILIES.semibold}>
                        {count > 0 ? t('offlineUpdate') : t('offlineDownload')}
                      </Text.Label>
                    </XStack>
                  </Pressable>
                  {count > 0 && (
                    <Pressable
                      onPress={handleClear}
                      aria-label={t('offlineClear')}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <XStack
                        height={media.buttonHeight}
                        paddingHorizontal={spacing.lg}
                        borderRadius={radius.full}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor="$cardBackground"
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
      </YStack>
    </ContentContainer>
  );

  const emptyState =
    !loading && count === 0 && !isSyncing ? (
      <ContentContainer>
        <YStack
          alignItems="center"
          gap={spacing.md}
          paddingVertical={spacing.xxl}
          paddingHorizontal={spacing.xl}
        >
          <YStack
            width={iconSizes.hero + spacing.lg}
            height={iconSizes.hero + spacing.lg}
            borderRadius={(iconSizes.hero + spacing.lg) / 2}
            backgroundColor={`${colors.neonCyan}1A`}
            alignItems="center"
            justifyContent="center"
          >
            <BookOpen size={iconSizes.xl} color={colors.neonCyan} />
          </YStack>
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
