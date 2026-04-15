import React, { useCallback, useMemo, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';

import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Newspaper } from '@tamagui/lucide-icons';

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
}

type LatestRow = FactWithRelations | NativeAdPlaceholder;

export const LatestCarousel = React.memo(function LatestCarousel({
  facts,
  factIds,
  onFactPress,
  listRef,
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

  // Interleave native ad placeholders. Stable content-derived keys (from
  // insertNativeAds) keep the ad pool binding stable across re-renders.
  const data = useMemo<LatestRow[]>(
    () => insertNativeAds(facts, NATIVE_ADS.FIRST_AD_INDEX.LATEST),
    [facts]
  );

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
  const itemStyle = useMemo(
    () => ({ width: cardWidth, paddingBottom: spacing.md }),
    [cardWidth, spacing.md]
  );
  const separatorStyle = useMemo(() => ({ width: cardGap }), [cardGap]);

  const renderItem = useCallback(
    ({ item }: { item: LatestRow }) => {
      if (isNativeAdPlaceholder(item)) {
        return (
          <View style={itemStyle}>
            <NativeAdCard
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              slotKey={item.key}
              aspectRatio={NativeMediaAspectRatio.SQUARE}
            />
          </View>
        );
      }
      const factIndex = factIds.indexOf(item.id);
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
          />
        </View>
      );
    },
    [cardWidth, cardHeight, onFactPress, factIds, itemStyle]
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
        />
      </View>
    </>
  );
});
