import React, { forwardRef, useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';

import { FlashList, FlashListRef } from '@shopify/flash-list';

import { LAYOUT, NATIVE_ADS } from '../../config/app';
import { useHeaderContentGap } from '../../hooks/useGlassHeaderOptions';
import { useTabBarBannerInset } from '../../services/tabBarBannerInset';
import {
  insertNativeAds,
  isNativeAdPlaceholder,
  type NativeAdPlaceholder,
  pooledAdKey,
} from '../../utils/insertNativeAds';
import { useResponsive } from '../../utils/useResponsive';
import { NativeAdRow } from '../ads/NativeAdRow';

import { KeepReadingItem } from './KeepReadingItem';

import type { FactWithRelations } from '../../services/database';

type KeepReadingRow = FactWithRelations | NativeAdPlaceholder;

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
      refreshing,
      onRefresh,
      onScroll,
      ListHeaderComponent,
    },
    ref
  ) {
    const { spacing } = useResponsive();
    const headerGap = useHeaderContentGap();
    const bannerInset = useTabBarBannerInset();

    // Insert a bounded pool of native ad rows after every N facts. Returns
    // `facts` unchanged for premium / ads-off sessions.
    const data = useMemo<KeepReadingRow[]>(
      () =>
        insertNativeAds(facts, {
          firstAdIndex: NATIVE_ADS.FEED.KEEP_READING.firstAdIndex,
          interval: NATIVE_ADS.FEED.KEEP_READING.interval,
          getAdKey: pooledAdKey(
            NATIVE_ADS.FEED.KEEP_READING.keyPrefix,
            NATIVE_ADS.FEED.KEEP_READING.poolSize
          ),
        }),
      [facts]
    );

    // Ad rows shift the visual data index, but navigation (and the swipe list it
    // opens) is keyed off the fact's position within `facts` — map id → that
    // position so taps open the right fact. Visual alternation still uses the
    // data index so neighbouring rows keep alternating across ad rows.
    const factIndexById = useMemo(() => {
      const map = new Map<number, number>();
      facts.forEach((f, i) => map.set(f.id, i));
      return map;
    }, [facts]);

    const renderItem = useCallback(
      ({ item, index }: { item: KeepReadingRow; index: number }) => {
        if (isNativeAdPlaceholder(item)) {
          return (
            <View style={centeredStyle}>
              <NativeAdRow slotKey={item.key} isOdd={index % 2 === 0} />
            </View>
          );
        }
        const factIndex = factIndexById.get(item.id) ?? index;
        return (
          <View style={centeredStyle}>
            <KeepReadingItem
              fact={item}
              index={factIndex}
              onPress={onFactPress}
              isOdd={index % 2 === 0}
            />
          </View>
        );
      },
      [onFactPress, factIndexById]
    );

    const keyExtractor = useCallback(
      (item: KeepReadingRow) => (isNativeAdPlaceholder(item) ? item.key : `kr-${item.id}`),
      []
    );

    // Split FlashList recycle pools so ad rows and fact rows never share a view.
    const getItemType = useCallback(
      (item: KeepReadingRow) => (isNativeAdPlaceholder(item) ? 'ad' : 'fact'),
      []
    );

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
        // Lets the iOS 26 native large-title header collapse/expand with the
        // scroll and keeps content out from under the floating tab bar.
        contentInsetAdjustmentBehavior="automatic"
        // FlashList v2 anchors VISIBLE content by default; when the header
        // sections (carousels) load/grow after mount, that anchoring made the
        // screen open "pre-scrolled" past the section titles. Anchor the top
        // instead.
        maintainVisibleContentPosition={{ disabled: true }}
        contentContainerStyle={{ paddingTop: headerGap, paddingBottom: bannerInset }}
        data={data}
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
      />
    );
  }
);
