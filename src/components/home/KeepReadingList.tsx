import React, { forwardRef, useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';

import { FlashList, FlashListRef } from '@shopify/flash-list';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';

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
      rows.push({ type: 'ad', key: `kr-ad-${i}` });
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

    const items = useMemo(() => interleaveAds(facts, isPremium), [facts, isPremium]);

    const renderItem = useCallback(
      ({ item }: { item: KeepReadingRow }) => {
        const content =
          item.type === 'ad' ? (
            <View style={{ padding: spacing.md }}>
              <InlineNativeAd aspectRatio={NativeMediaAspectRatio.LANDSCAPE} />
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
      [onFactPress, spacing.md]
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
      />
    );
  }
);
