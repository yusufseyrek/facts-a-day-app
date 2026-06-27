import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, View, type ViewStyle } from 'react-native';
import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';

import { FlashList, FlashListRef } from '@shopify/flash-list';

import { LAYOUT, NATIVE_ADS } from '../../config/app';
import { signalHeroImageReady, useFactCardMenu } from '../../contexts';
import { useAdForSlot } from '../../hooks/useAdForSlot';
import { useFailedAdSlots } from '../../hooks/useFailedAdSlots';
import { useTranslation } from '../../i18n';
import { trackCarouselSwipe } from '../../services/analytics';
import { hexColors, useTheme } from '../../theme';
import {
  insertNativeAds,
  isNativeAdPlaceholder,
  type NativeAdPlaceholder,
  pooledAdKey,
} from '../../utils/insertNativeAds';
import { useResponsive } from '../../utils/useResponsive';
import { NativeAdCard } from '../ads/NativeAdCard';
import { Newspaper } from '../icons';
import { ImageFactCard } from '../ImageFactCard';
import { ShimmerPlaceholder } from '../ShimmerPlaceholder';

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
  isLoading?: boolean;
}

type LatestRow = FactWithRelations | NativeAdPlaceholder;

/**
 * Square native ad cell for the Latest carousel. Subscribes to a pooled ad slot
 * and reserves a shimmer at the full card width while the ad loads, so the
 * `snapToInterval` grid stays aligned during the fetch. On a terminal no-fill it
 * reports the slot up via `onFailed` and the parent drops this placeholder, so
 * the cell leaves no blank gap.
 *
 * The report is gated on `index >= activeIndexRef.current`: a horizontal
 * FlashList does NOT re-anchor on data change (maintainVisibleContentPosition is
 * force-disabled when `horizontal`), so dropping a cell BEFORE the focused card
 * would slide that card sideways. Removing the focused card itself (next fact
 * snaps into its place) or one ahead of it (off-screen) never moves what the
 * user is looking at. An ad that no-fills after being scrolled past is left as a
 * reserved — but off-screen, so invisible — cell rather than jumping the view.
 */
const LatestAdCell = memo(function LatestAdCell({
  slotKey,
  index,
  activeIndexRef,
  cardWidth,
  cardHeight,
  itemStyle,
  onFailed,
}: {
  slotKey: string;
  index: number;
  activeIndexRef: React.MutableRefObject<number>;
  cardWidth: number;
  cardHeight: number;
  itemStyle: ViewStyle;
  onFailed: (key: string) => void;
}) {
  const { ad, status } = useAdForSlot(slotKey, NativeMediaAspectRatio.SQUARE);
  const { spacing } = useResponsive();

  useEffect(() => {
    if (status === 'failed' && index >= activeIndexRef.current) onFailed(slotKey);
  }, [status, index, slotKey, onFailed, activeIndexRef]);

  return (
    <View style={itemStyle}>
      {ad ? (
        <NativeAdCard
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          nativeAd={ad}
          aspectRatio={NativeMediaAspectRatio.SQUARE}
        />
      ) : status === 'failed' ? null : (
        <ShimmerPlaceholder width={cardWidth} height={cardHeight} borderRadius={spacing.sm} />
      )}
    </View>
  );
});

export const LatestCarousel = React.memo(function LatestCarousel({
  facts,
  factIds,
  onFactPress,
  listRef,
  isPremium,
  isLoading,
}: LatestCarouselProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, screenWidth, config, iconSizes } = useResponsive();
  const colors = hexColors[theme];
  const openFactMenu = useFactCardMenu();

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

  // Drop ad cells whose slot reported a no-fill, so they leave no blank gap.
  const { markAdFailed, dropFailedAds } = useFailedAdSlots(facts);

  // Interleave a small bounded pool of native ad placeholders (2 across the 10
  // cards). insertNativeAds returns `facts` unchanged for premium / ads-off.
  const data = useMemo<LatestRow[]>(
    () =>
      dropFailedAds(
        insertNativeAds(facts, {
          firstAdIndex: NATIVE_ADS.FEED.LATEST.firstAdIndex,
          interval: NATIVE_ADS.FEED.LATEST.interval,
          getAdKey: pooledAdKey(NATIVE_ADS.FEED.LATEST.keyPrefix, NATIVE_ADS.FEED.LATEST.poolSize),
        })
      ),
    [facts, isPremium, dropFailedAds]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / snapInterval);
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        const item = data[index];
        if (item && !isNativeAdPlaceholder(item)) {
          // Report the fact's position in the ad-free list, not the data-with-
          // ads index, so analytics stay comparable to the no-ads carousel.
          const factIndex = factIds.indexOf(item.id);
          trackCarouselSwipe({
            section: 'latest',
            index: factIndex >= 0 ? factIndex : index,
            factId: item.id,
          });
        }
      }
    },
    [snapInterval, data, factIds]
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
            index={index}
            activeIndexRef={activeIndexRef}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            itemStyle={itemStyle}
            onFailed={markAdFailed}
          />
        );
      }
      const factIndex = factIds.indexOf(item.id);
      const isFactPremiumLocked =
        !isPremium && !!(typeof item.categoryData === 'object' && item.categoryData?.is_premium);
      return (
        <View style={itemStyle}>
          <ImageFactCard
            title={item.title || item.content.substring(0, 80) + '...'}
            imageUrl={item.image_url!}
            factId={item.id}
            category={item.categoryData || item.category}
            categorySlug={item.categoryData?.slug || item.category}
            onPress={() => onFactPress(item, 'home_latest', factIds, factIndex)}
            onLongPress={item.audio_url ? () => openFactMenu(item) : undefined}
            cardWidth={cardWidth}
            aspectRatio={1}
            titleNumberOfLines={5}
            isPremiumLocked={isFactPremiumLocked}
            showOfflineSave
            // First card is the splash "hero": the overlay holds its fade-out
            // until this image has decoded (see splashGate).
            onImageReady={item.id === factIds[0] ? signalHeroImageReady : undefined}
          />
        </View>
      );
    },
    [cardWidth, cardHeight, onFactPress, factIds, itemStyle, isPremium, openFactMenu, markAdFailed]
  );

  const keyExtractor = useCallback(
    (item: LatestRow) => (isNativeAdPlaceholder(item) ? item.key : `lt-${item.id}`),
    []
  );

  // Split FlashList recycle pools so ad cells and fact cards never share a view,
  // AND give each pooled ad slot its OWN type (item.key) so FlashList never
  // recycles one ad cell's NativeAdView into a different slot — which would
  // re-point a live view at another pooled NativeAd still bound elsewhere and
  // crash GMS setNativeAd with "child already has a parent".
  const getItemType = useCallback(
    (item: LatestRow) => (isNativeAdPlaceholder(item) ? item.key : 'fact'),
    []
  );

  const ItemSeparator = useCallback(() => <View style={separatorStyle} />, [separatorStyle]);

  if (!isLoading && facts.length === 0) return null;

  if (isLoading) {
    return (
      <>
        <SectionHeader
          icon={<Newspaper size={iconSizes.sm} color={colors.primary} />}
          title={t('latest')}
        />
        <View
          style={{
            height: cardHeight + spacing.xxl,
            paddingHorizontal: listInset,
            flexDirection: 'row',
            overflow: 'hidden',
          }}
        >
          {[0, 1, 2].map((i) => (
            <ShimmerPlaceholder
              key={i}
              width={cardWidth}
              height={cardHeight}
              borderRadius={spacing.sm}
              style={i < 2 ? { marginRight: cardGap } : undefined}
            />
          ))}
        </View>
      </>
    );
  }

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
