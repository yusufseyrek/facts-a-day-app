import React, { forwardRef, useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';

import { FlashList, FlashListRef } from '@shopify/flash-list';

import { LAYOUT } from '../../config/app';
import { useHeaderContentGap } from '../../hooks/useGlassHeaderOptions';
import { useResponsive } from '../../utils/useResponsive';

import { KeepReadingItem } from './KeepReadingItem';

import type { FactWithRelations } from '../../services/database';

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

export const KeepReadingList = forwardRef<FlashListRef<FactWithRelations>, KeepReadingListProps>(
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

    const renderItem = useCallback(
      ({ item, index }: { item: FactWithRelations; index: number }) => (
        <View style={centeredStyle}>
          <KeepReadingItem fact={item} index={index} onPress={onFactPress} isOdd={index % 2 === 0} />
        </View>
      ),
      [onFactPress]
    );

    const keyExtractor = useCallback((item: FactWithRelations) => `kr-${item.id}`, []);

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
        contentContainerStyle={{ paddingTop: headerGap }}
        data={facts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
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
