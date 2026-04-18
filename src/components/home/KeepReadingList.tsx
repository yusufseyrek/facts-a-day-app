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

    // Index-based lookahead: enable ad rows whose data index is within
    // `AD_LOOKAHEAD` of the furthest row the user has scrolled to. Gives the
    // pool time to hand over a warm ad before the row enters the viewport,
    // while capping waste — rows beyond the window stay disabled.
    const AD_LOOKAHEAD = 5;
    const [highestViewedIndex, setHighestViewedIndex] = useState(-1);
    const onViewableItemsChanged = useRef(
      ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        let maxIdx = -1;
        for (const v of viewableItems) {
          if (typeof v.index === 'number' && v.index > maxIdx) {
            maxIdx = v.index;
          }
        }
        if (maxIdx < 0) return;
        setHighestViewedIndex((prev) => (maxIdx > prev ? maxIdx : prev));
      }
    ).current;
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 1 }).current;

    const items = useMemo(() => {
      const rows = interleaveAds(facts, isPremium);
      if (failedAdKeys.size === 0) return rows;
      return rows.filter((r) => !(r.type === 'ad' && failedAdKeys.has(r.key)));
    }, [facts, isPremium, failedAdKeys]);

    const renderItem = useCallback(
      ({ item, index }: { item: KeepReadingRow; index: number }) => {
        const content =
          item.type === 'ad' ? (
            <View style={{ padding: spacing.md }}>
              <InlineNativeAd
                aspectRatio={NativeMediaAspectRatio.LANDSCAPE}
                slotKey={item.key}
                enabled={index <= highestViewedIndex + AD_LOOKAHEAD}
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
      [onFactPress, spacing.md, handleAdFailed, highestViewedIndex]
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
        // FlashList needs `extraData` to re-invoke `renderItem` for
        // already-mounted cells when the lookahead frontier advances.
        extraData={highestViewedIndex}
      />
    );
  }
);
