import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, View } from 'react-native';

import { Compass } from '@tamagui/lucide-icons';

import { NativeAdCard } from './ads/NativeAdCard';
import { ImageFactCard } from './ImageFactCard';
import { Text } from './Typography';
import { ContentContainer } from './ScreenLayout';
import { NATIVE_ADS } from '../config/app';
import { insertNativeAds, isNativeAdPlaceholder, type NativeAdPlaceholder } from '../utils/insertNativeAds';
import { useResponsive } from '../utils/useResponsive';
import { hexColors, useTheme } from '../theme';
import { useTranslation } from '../i18n';

import type { FactWithRelations } from '../services/database';

interface FactCarouselProps {
  facts: FactWithRelations[];
  onFactPress: (fact: FactWithRelations, factIdList?: number[], indexInList?: number) => void;
  onDiscoverPress?: () => void;
  /** Called once when the first carousel image has loaded */
  onFirstImageReady?: () => void;
}

// Sentinel item to represent the Discover CTA card at the end
const DISCOVER_CTA_ID = '__discover_cta__';

type CarouselItem = FactWithRelations | { id: typeof DISCOVER_CTA_ID } | NativeAdPlaceholder;

export const FactCarousel = React.memo(
  ({ facts, onFactPress, onDiscoverPress, onFirstImageReady }: FactCarouselProps) => {
    const { screenWidth, spacing, radius, iconSizes, config } = useResponsive();
    const { theme } = useTheme();
    const { t } = useTranslation();
    const [activeIndex, setActiveIndex] = useState(0);
    const firstImageSignalledRef = useRef(false);

    const carouselFactIds = useMemo(() => facts.map((f) => f.id), [facts]);
    const colors = hexColors[theme];
    const cardWidth = screenWidth * config.cardWidthMultiplier;
    const cardGap = spacing.sm;
    const snapInterval = cardWidth + cardGap;
    const horizontalPadding = (screenWidth - cardWidth) / 2;

    // Track native ad slots that failed to load (no-fill)
    const [failedAdKeys, setFailedAdKeys] = useState<Set<string>>(new Set());

    // Reset failed keys when facts change (new data)
    useEffect(() => {
      setFailedAdKeys(new Set());
    }, [facts]);

    const handleAdFailed = useCallback((key: string) => {
      setFailedAdKeys(prev => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }, []);

    // Insert native ads into facts, then filter out failed ones, then append CTA
    const factsWithAds = useMemo(
      () => insertNativeAds(facts, undefined, NATIVE_ADS.CAROUSEL_FACTS_BETWEEN_ADS),
      [facts],
    );
    const filteredData = useMemo(
      () => factsWithAds.filter(item => !isNativeAdPlaceholder(item) || !failedAdKeys.has(item.key)),
      [factsWithAds, failedAdKeys],
    );
    const data: CarouselItem[] = onDiscoverPress
      ? [...filteredData, { id: DISCOVER_CTA_ID }]
      : filteredData;

    const totalDots = data.length;

    const handleScroll = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / snapInterval);
        setActiveIndex(Math.max(0, Math.min(index, totalDots - 1)));
      },
      [snapInterval, totalDots]
    );

    // Calculate card height to match ImageFactCard
    const ctaCardHeight = screenWidth * config.cardAspectRatio;

    const renderItem = useCallback(
      ({ item }: { item: CarouselItem }) => {
        // Native ad card
        if (isNativeAdPlaceholder(item)) {
          return (
            <View style={{ width: cardWidth }}>
              <NativeAdCard cardWidth={cardWidth} onAdFailed={() => handleAdFailed(item.key)} />
            </View>
          );
        }

        // Discover CTA card
        if ('id' in item && item.id === DISCOVER_CTA_ID) {
          return (
            <View style={{ width: cardWidth }}>
              <Pressable
                onPress={onDiscoverPress}
                style={({ pressed }) => [
                  {
                    height: ctaCardHeight,
                    borderRadius: radius.lg,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: spacing.md,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <View
                  style={{
                    width: iconSizes.heroLg,
                    height: iconSizes.heroLg,
                    borderRadius: radius.full,
                    backgroundColor: colors.primaryLight,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Compass size={iconSizes.xl} color={colors.primary} />
                </View>
                <Text.Title color="$text" style={{ textAlign: 'center' }}>
                  {t('discoverMoreTitle')}
                </Text.Title>
                <Text.Caption
                  color="$textSecondary"
                  style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}
                >
                  {t('discoverMoreDescription')}
                </Text.Caption>
              </Pressable>
            </View>
          );
        }

        // Regular fact card
        const fact = item as FactWithRelations;
        const factIndex = facts.indexOf(fact);
        // Signal first image ready for splash coordination
        const handleImageReady = factIndex === 0 && onFirstImageReady && !firstImageSignalledRef.current
          ? () => {
              firstImageSignalledRef.current = true;
              onFirstImageReady();
            }
          : undefined;
        return (
          <View style={{ width: cardWidth }}>
            <ImageFactCard
              title={fact.title || fact.content.substring(0, 80) + '...'}
              imageUrl={fact.image_url!}
              factId={fact.id}
              category={fact.categoryData || fact.category}
              categorySlug={fact.categoryData?.slug || fact.category}
              onPress={() => onFactPress(fact, carouselFactIds, factIndex >= 0 ? factIndex : 0)}
              onImageReady={handleImageReady}
            />
          </View>
        );
      },
      [
        cardWidth,
        ctaCardHeight,
        radius,
        colors,
        spacing,
        iconSizes,
        onFactPress,
        onDiscoverPress,
        onFirstImageReady,
        carouselFactIds,
        facts,
        handleAdFailed,
        t,
      ]
    );

    const keyExtractor = useCallback((item: CarouselItem) => {
      if (isNativeAdPlaceholder(item)) return item.key;
      if ('id' in item && item.id === DISCOVER_CTA_ID) return DISCOVER_CTA_ID;
      return `carousel-${(item as FactWithRelations).id}`;
    }, []);

    if (facts.length === 0) return null;

    // Single fact with no CTA: render as a regular card, no carousel needed
    if (facts.length === 1 && !onDiscoverPress) {
      return (
        <ContentContainer>
          <ImageFactCard
            title={facts[0].title || facts[0].content.substring(0, 80) + '...'}
            imageUrl={facts[0].image_url!}
            factId={facts[0].id}
            category={facts[0].categoryData || facts[0].category}
            categorySlug={facts[0].categoryData?.slug || facts[0].category}
            onPress={() => onFactPress(facts[0], carouselFactIds, 0)}
            onImageReady={onFirstImageReady}
          />
        </ContentContainer>
      );
    }

    return (
      <View>
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={snapInterval}
          decelerationRate="fast"
          contentContainerStyle={{
            paddingHorizontal: horizontalPadding,
            gap: cardGap,
          }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />

        {/* Pagination dots */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: spacing.xs,
            marginTop: spacing.sm,
          }}
        >
          {data.map((_, index) => {
            const dotSize = index === activeIndex ? spacing.sm : spacing.xs + 2;
            return (
              <View
                key={index}
                style={{
                  width: dotSize,
                  height: dotSize,
                  borderRadius: radius.full,
                  backgroundColor: index === activeIndex ? colors.primary : colors.border,
                }}
              />
            );
          })}
        </View>
      </View>
    );
  }
);

FactCarousel.displayName = 'FactCarousel';
