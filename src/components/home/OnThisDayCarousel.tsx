import React, { useCallback, useMemo, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native';

import { FlashList, FlashListRef } from '@shopify/flash-list';

import { LAYOUT } from '../../config/app';
import { useTranslation } from '../../i18n';
import { trackCarouselSwipe } from '../../services/analytics';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { CompactFactCard } from '../CompactFactCard';
import { CalendarDays } from '../icons';
import { ShimmerPlaceholder } from '../ShimmerPlaceholder';

import { SectionHeader } from './SectionHeader';

import type { FactViewSource } from '../../services/analytics';
import type { FactWithRelations } from '../../services/database';

interface OnThisDayCarouselProps {
  facts: FactWithRelations[];
  isWeekFallback: boolean;
  onFactPress: (
    fact: FactWithRelations,
    source: FactViewSource,
    factIds: number[],
    index: number
  ) => void;
  listRef?: React.RefObject<FlashListRef<FactWithRelations> | null>;
  isLoading?: boolean;
}

export const OnThisDayCarousel = React.memo(function OnThisDayCarousel({
  facts,
  isWeekFallback,
  onFactPress,
  listRef,
  isLoading,
}: OnThisDayCarouselProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, screenWidth, config, iconSizes, media } = useResponsive();
  const colors = hexColors[theme];

  const contentWidth = Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH);
  const listInset = (screenWidth - contentWidth) / 2 + spacing.md;
  const isWideScreen = screenWidth > LAYOUT.MAX_CONTENT_WIDTH;
  const cardWidth = isWideScreen
    ? contentWidth - spacing.lg * 2
    : contentWidth * config.cardWidthMultiplier;
  const cardGap = spacing.sm;
  const snapInterval = cardWidth + cardGap;

  const factIds = useMemo(() => facts.map((f) => f.id), [facts]);

  const activeIndexRef = useRef(0);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / snapInterval);
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        trackCarouselSwipe({ section: 'on_this_day', index, factId: facts[index]?.id });
      }
    },
    [snapInterval, facts]
  );

  const contentContainerStyle = useMemo(() => ({ paddingHorizontal: listInset }), [listInset]);
  const itemStyle = useMemo(() => ({ paddingBottom: spacing.md }), [spacing.md]);
  const separatorStyle = useMemo(() => ({ width: cardGap }), [cardGap]);

  const renderItem = useCallback(
    ({ item, index }: { item: FactWithRelations; index: number }) => (
      <View style={itemStyle}>
        <CompactFactCard
          fact={item}
          cardWidth={cardWidth}
          titleLines={3}
          onPress={() => onFactPress(item, 'home_on_this_day', factIds, index)}
        />
      </View>
    ),
    [cardWidth, onFactPress, factIds, itemStyle]
  );

  const keyExtractor = useCallback((item: FactWithRelations) => `otd-${item.id}`, []);
  const ItemSeparator = useCallback(() => <View style={separatorStyle} />, [separatorStyle]);

  if (!isLoading && facts.length === 0) return null;

  if (isLoading) {
    const thumbnailSize = media.compactCardThumbnailSize;
    const cardHeight = thumbnailSize + spacing.md * 2;
    return (
      <>
        <SectionHeader
          icon={<CalendarDays size={iconSizes.sm} color={colors.primary} />}
          title={t('onThisDay')}
        />
        <View
          style={{
            paddingHorizontal: listInset,
            flexDirection: 'row',
            overflow: 'hidden',
          }}
        >
          {[0, 1].map((i) => (
            <View
              key={i}
              style={{
                width: cardWidth,
                height: cardHeight,
                flexDirection: 'row',
                alignItems: 'center',
                padding: spacing.md,
                backgroundColor: colors.cardBackground,
                borderRadius: spacing.sm,
                marginRight: i === 0 ? cardGap : 0,
              }}
            >
              <ShimmerPlaceholder
                width={thumbnailSize}
                height={thumbnailSize}
                borderRadius={spacing.xs}
                style={{ marginRight: spacing.md }}
              />
              <View style={{ flex: 1 }}>
                <ShimmerPlaceholder
                  width="90%"
                  height={13}
                  borderRadius={4}
                  style={{ marginBottom: spacing.xs }}
                />
                <ShimmerPlaceholder
                  width="75%"
                  height={13}
                  borderRadius={4}
                  style={{ marginBottom: spacing.xs }}
                />
                <ShimmerPlaceholder width="55%" height={13} borderRadius={4} />
              </View>
            </View>
          ))}
        </View>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        icon={<CalendarDays size={iconSizes.sm} color={colors.primary} />}
        title={isWeekFallback ? t('thisWeekInHistory') : t('onThisDay')}
      />
      <View style={{ width: '100%' }}>
        <FlashList
          ref={listRef}
          data={facts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
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
