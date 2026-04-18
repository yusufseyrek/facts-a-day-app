import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  View,
  type ViewStyle,
  type ViewToken,
} from 'react-native';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';

import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Newspaper } from '@tamagui/lucide-icons';

import { useAdForSlot } from '../../hooks/useAdForSlot';
import { LAYOUT, NATIVE_ADS } from '../../config/app';
import { useTranslation } from '../../i18n';
import { trackCarouselSwipe } from '../../services/analytics';
import { hexColors, useTheme } from '../../theme';
import {
  insertNativeAds,
  isNativeAdPlaceholder,
  type NativeAdPlaceholder,
} from '../../utils/insertNativeAds';
import { useResponsive } from '../../utils/useResponsive';
import { NativeAdCard } from '../ads/NativeAdCard';
import { ImageFactCard } from '../ImageFactCard';

import { SectionHeader } from './SectionHeader';

import type { FactViewSource } from '../../services/analytics';
import type { FactWithRelations } from '../../services/database';

interface LatestCarouselProps {
  facts: FactWithRelations[];
  factIds: number[];
  onFactPress: (
    fact: FactWithRelations,
    source: FactViewSource,
    factIds: number[],
    index: number
  ) => void;
  listRef?: React.RefObject<FlashListRef<FactWithRelations> | null>;
  isPremium?: boolean;
}

type LatestRow = FactWithRelations | NativeAdPlaceholder;

/**
 * Subscribes the given slot to the ad pool only once `enabled` is `true` —
 * the parent carousel flips that when the cell enters the viewport, so pool
 * inventory isn't consumed for cells pre-mounted by FlashList's drawDistance
 * but never scrolled to. Returns `null` (0-width cell) until an ad is bound.
 */
const LatestAdCell = memo(function LatestAdCell({
  slotKey,
  enabled,
  cardWidth,
  cardHeight,
  itemStyle,
}: {
  slotKey: string;
  enabled: boolean;
  cardWidth: number;
  cardHeight: number;
  itemStyle: ViewStyle;
}) {
  const { ad } = useAdForSlot(slotKey, NativeMediaAspectRatio.SQUARE, enabled);
  if (!ad) return null;
  return (
    <View style={itemStyle}>
      <NativeAdCard cardWidth={cardWidth} cardHeight={cardHeight} nativeAd={ad} />
    </View>
  );
});

export const LatestCarousel = React.memo(function LatestCarousel({
  facts,
  factIds,
  onFactPress,
  listRef,
  isPremium,
}: LatestCarouselProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, screenWidth, config, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  const contentWidth = Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH);
  const listInset = (screenWidth - contentWidth) / 2 + spacing.md;
  const isWideScreen = screenWidth > LAYOUT.MAX_CONTENT_WIDTH;
  const cardWidth = isWideScreen
    ? contentWidth - spacing.lg * 2
    : contentWidth * config.cardWidthMultiplier;
  const cardGap = spacing.sm;
  const snapInterval = cardWidth + cardGap;
  const cardHeight = cardWidth;

  const activeIndexRef = useRef(0);

  // Interleave native ad placeholders. Each placeholder is rendered by
  // `LatestAdCell`, which returns `null` (0-width cell) until its pool slot
  // has an ad — no wrapper, no cardWidth of empty space.
  const data = useMemo<LatestRow[]>(
    () => insertNativeAds(facts, NATIVE_ADS.FIRST_AD_INDEX.LATEST),
    [facts]
  );

  // Index-based lookahead: enable ad cells whose data index is within
  // `AD_LOOKAHEAD` positions of the furthest data index the user has seen.
  // Gives the pool time to bind a warm ad before the cell scrolls into view,
  // while still capping waste — cells beyond the lookahead window stay dark.
  const AD_LOOKAHEAD = 2;
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

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / snapInterval);
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        const item = data[index];
        if (item && !isNativeAdPlaceholder(item)) {
          trackCarouselSwipe({ section: 'latest', index, factId: item.id });
        }
      }
    },
    [snapInterval, data]
  );

  const contentContainerStyle = useMemo(() => ({ paddingHorizontal: listInset }), [listInset]);
  const itemStyle = useMemo<ViewStyle>(
    () => ({ width: cardWidth, paddingBottom: spacing.md }),
    [cardWidth, spacing.md]
  );
  const separatorStyle = useMemo(() => ({ width: cardGap }), [cardGap]);

  const renderItem = useCallback(
    ({ item, index }: { item: LatestRow; index: number }) => {
      if (isNativeAdPlaceholder(item)) {
        return (
          <LatestAdCell
            slotKey={item.key}
            enabled={index <= highestViewedIndex + AD_LOOKAHEAD}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            itemStyle={itemStyle}
          />
        );
      }
      const factIndex = factIds.indexOf(item.id);
      const isFactPremiumLocked =
        !isPremium &&
        !!(typeof item.categoryData === 'object' && item.categoryData?.is_premium);
      return (
        <View style={itemStyle}>
          <ImageFactCard
            title={item.title || item.content.substring(0, 80) + '...'}
            imageUrl={item.image_url!}
            factId={item.id}
            category={item.categoryData || item.category}
            categorySlug={item.categoryData?.slug || item.category}
            onPress={() => onFactPress(item, 'home_latest', factIds, factIndex)}
            cardWidth={cardWidth}
            aspectRatio={1}
            titleNumberOfLines={5}
            isPremiumLocked={isFactPremiumLocked}
          />
        </View>
      );
    },
    [cardWidth, cardHeight, onFactPress, factIds, itemStyle, isPremium, highestViewedIndex]
  );

  const keyExtractor = useCallback(
    (item: LatestRow) => (isNativeAdPlaceholder(item) ? item.key : `lt-${item.id}`),
    []
  );

  // Split FlashList recycle pools so ad cells and fact cells never share a reusable view.
  const getItemType = useCallback(
    (item: LatestRow) => (isNativeAdPlaceholder(item) ? 'ad' : 'fact'),
    []
  );

  const ItemSeparator = useCallback(() => <View style={separatorStyle} />, [separatorStyle]);

  if (facts.length === 0) return null;

  return (
    <>
      <SectionHeader
        icon={<Newspaper size={iconSizes.sm} color={colors.primary} />}
        title={t('latest')}
      />
      <View style={{ height: cardHeight + spacing.xxl, width: '100%' }}>
        <FlashList
          ref={listRef as unknown as React.RefObject<FlashListRef<LatestRow> | null>}
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          horizontal
          showsHorizontalScrollIndicator={false}
          overScrollMode="never"
          snapToInterval={snapInterval}
          decelerationRate="fast"
          disableIntervalMomentum
          ItemSeparatorComponent={ItemSeparator}
          contentContainerStyle={contentContainerStyle}
          drawDistance={cardWidth}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          // FlashList needs `extraData` to re-invoke `renderItem` for
          // already-mounted cells when the lookahead frontier advances.
          extraData={highestViewedIndex}
        />
      </View>
    </>
  );
});
