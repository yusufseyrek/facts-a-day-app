import React, { useCallback, useMemo, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, View, type ViewStyle } from 'react-native';

import { FlashList, FlashListRef } from '@shopify/flash-list';

import { LAYOUT } from '../../config/app';
import { signalHeroImageReady } from '../../contexts';
import { useTranslation } from '../../i18n';
import { trackCarouselSwipe } from '../../services/analytics';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
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

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / snapInterval);
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        const item = facts[index];
        if (item) {
          trackCarouselSwipe({ section: 'latest', index, factId: item.id });
        }
      }
    },
    [snapInterval, facts]
  );

  const contentContainerStyle = useMemo(() => ({ paddingHorizontal: listInset }), [listInset]);
  const itemStyle = useMemo<ViewStyle>(
    () => ({ width: cardWidth, paddingBottom: spacing.md }),
    [cardWidth, spacing.md]
  );
  const separatorStyle = useMemo(() => ({ width: cardGap }), [cardGap]);

  const renderItem = useCallback(
    ({ item }: { item: FactWithRelations; index: number }) => {
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
            cardWidth={cardWidth}
            aspectRatio={1}
            titleNumberOfLines={5}
            isPremiumLocked={isFactPremiumLocked}
            // First card is the splash "hero": the overlay holds its fade-out
            // until this image has decoded (see splashGate).
            onImageReady={item.id === factIds[0] ? signalHeroImageReady : undefined}
          />
        </View>
      );
    },
    [cardWidth, onFactPress, factIds, itemStyle, isPremium]
  );

  const keyExtractor = useCallback((item: FactWithRelations) => `lt-${item.id}`, []);

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
