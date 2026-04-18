import React, { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  View,
  type ViewToken,
} from 'react-native';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';

import { FlashList, FlashListRef } from '@shopify/flash-list';

import { ADS_ENABLED, LAYOUT, NATIVE_ADS } from '../../config/app';
import { useResponsive } from '../../utils/useResponsive';
import { InlineNativeAd } from '../ads/InlineNativeAd';

import { KeepReadingItem } from './KeepReadingItem';

import type { FactWithRelations } from '../../services/database';

// ---------- Item types for mixed list ----------

type KeepReadingRow =
  | { type: 'fact'; fact: FactWithRelations; index: number }
  | { type: 'ad'; key: string };

function interleaveAds(facts: FactWithRelations[], isPremium: boolean): KeepReadingRow[] {
  const rows: KeepReadingRow[] = [];
  for (let i = 0; i < facts.length; i++) {
    rows.push({ type: 'fact', fact: facts[i], index: i });
    if (
      ADS_ENABLED &&
      !isPremium &&
      (i + 1) % NATIVE_ADS.KEEP_READING_AD_INTERVAL === 0 &&
      i < facts.length - 1
    ) {
      // Content-stable slot key: survives pagination so the ad pool can reuse
      // the same NativeAd across list updates and FlashList recycling.
      rows.push({ type: 'ad', key: `kr-ad-after-${facts[i].id}` });
    }
  }
  return rows;
}

// ---------- Centered wrapper ----------

const centeredStyle = {
  maxWidth: LAYOUT.MAX_CONTENT_WIDTH,
  width: '100%' as const,
  alignSelf: 'center' as const,
};

// ---------- Props ----------

interface KeepReadingListProps {
  facts: FactWithRelations[];
  onFactPress: (fact: FactWithRelations, index: number) => void;
  onEndReached: () => void;
  isFetchingMore: boolean;
  isPremium: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onScroll?: (y: number) => void;
  ListHeaderComponent: React.ReactElement;
}

// ---------- Main list ----------

export const KeepReadingList = forwardRef<FlashListRef<KeepReadingRow>, KeepReadingListProps>(
  function KeepReadingList(
    {
      facts,
      onFactPress,
      onEndReached,
      isFetchingMore,
      isPremium,
      refreshing,
      onRefresh,
      onScroll,
      ListHeaderComponent,
    },
    ref
  ) {
    const { spacing } = useResponsive();

    // Drop ad rows that the pool reports as 'failed' (no-fill / rate-limit)
    // so the vertical list collapses the fixed-height InlineNativeAd spacer.
    const [failedAdKeys, setFailedAdKeys] = useState<Set<string>>(() => new Set());
    const handleAdFailed = useCallback((key: string) => {
      setFailedAdKeys((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }, []);

    // Sticky set of ad slot keys that have entered the viewport at least once.
    // Cells pre-mounted by FlashList's drawDistance stay `enabled={false}`
    // until they're actually viewable, so the pool doesn't burn inventory on
    // rows the user never scrolls to.
    const [viewedAdKeys, setViewedAdKeys] = useState<Set<string>>(() => new Set());
    const onViewableItemsChanged = useRef(
      ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        let newKeys: string[] | null = null;
        for (const v of viewableItems) {
          const item = v.item as KeepReadingRow | undefined;
          if (item && item.type === 'ad') {
            (newKeys ??= []).push(item.key);
          }
        }
        if (!newKeys) return;
        setViewedAdKeys((prev) => {
          let next = prev;
          for (const k of newKeys!) {
            if (!next.has(k)) {
              if (next === prev) next = new Set(prev);
              next.add(k);
            }
          }
          return next;
        });
      }
    ).current;
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 1 }).current;

    const items = useMemo(() => {
      const rows = interleaveAds(facts, isPremium);
      if (failedAdKeys.size === 0) return rows;
      return rows.filter((r) => !(r.type === 'ad' && failedAdKeys.has(r.key)));
    }, [facts, isPremium, failedAdKeys]);

    const renderItem = useCallback(
      ({ item }: { item: KeepReadingRow }) => {
        const content =
          item.type === 'ad' ? (
            <View style={{ padding: spacing.md }}>
              <InlineNativeAd
                aspectRatio={NativeMediaAspectRatio.LANDSCAPE}
                slotKey={item.key}
                enabled={viewedAdKeys.has(item.key)}
                onAdFailed={() => handleAdFailed(item.key)}
              />
            </View>
          ) : (
            <KeepReadingItem
              fact={item.fact}
              index={item.index}
              onPress={onFactPress}
              isOdd={item.index % 2 === 0}
            />
          );

        return <View style={centeredStyle}>{content}</View>;
      },
      [onFactPress, spacing.md, handleAdFailed, viewedAdKeys]
    );

    const keyExtractor = useCallback((item: KeepReadingRow) => {
      return item.type === 'ad' ? item.key : `kr-${item.fact.id}`;
    }, []);

    const getItemType = useCallback((item: KeepReadingRow) => item.type, []);

    const handleScroll = useCallback(
      (e: { nativeEvent: { contentOffset: { y: number } } }) => {
        onScroll?.(e.nativeEvent.contentOffset.y);
      },
      [onScroll]
    );

    const refreshControl = useMemo(
      () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />,
      [refreshing, onRefresh]
    );

    const listFooter = useMemo(() => {
      if (!isFetchingMore) return null;
      return (
        <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
          <ActivityIndicator size="small" />
        </View>
      );
    }, [isFetchingMore, spacing.lg]);

    return (
      <FlashList
        ref={ref}
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={listFooter}
        refreshControl={refreshControl}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        // Without `extraData`, FlashList won't re-invoke `renderItem` for
        // already-mounted cells when `viewedAdKeys` changes — so an ad row
        // mounted below the fold would stay `enabled={false}` forever even
        // after scrolling into view.
        extraData={viewedAdKeys}
      />
    );
  }
);
