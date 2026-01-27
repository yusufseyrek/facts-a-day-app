import React, { useCallback, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, View } from 'react-native';

import { Compass } from '@tamagui/lucide-icons';

import { ImageFactCard } from './ImageFactCard';
import { Text } from './Typography';
import { ContentContainer } from './ScreenLayout';
import { useResponsive } from '../utils/useResponsive';
import { hexColors, useTheme } from '../theme';
import { useTranslation } from '../i18n';

import type { FactWithRelations } from '../services/database';

interface FactCarouselProps {
  facts: FactWithRelations[];
  onFactPress: (fact: FactWithRelations) => void;
  onDiscoverPress?: () => void;
}

const CARD_WIDTH_RATIO = 0.88;
const CARD_GAP = 10;

// Sentinel item to represent the Discover CTA card at the end
const DISCOVER_CTA_ID = '__discover_cta__';

type CarouselItem = FactWithRelations | { id: typeof DISCOVER_CTA_ID };

export const FactCarousel = React.memo(({ facts, onFactPress, onDiscoverPress }: FactCarouselProps) => {
  const { screenWidth, spacing, isTablet, radius } = useResponsive();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);

  const colors = hexColors[theme];
  const cardWidth = screenWidth * (isTablet ? 0.75 : CARD_WIDTH_RATIO);
  const snapInterval = cardWidth + CARD_GAP;
  const horizontalPadding = (screenWidth - cardWidth) / 2;

  // Append the Discover CTA card to the end of the list
  const data: CarouselItem[] = onDiscoverPress
    ? [...facts, { id: DISCOVER_CTA_ID }]
    : facts;

  const totalDots = data.length;

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / snapInterval);
      setActiveIndex(Math.max(0, Math.min(index, totalDots - 1)));
    },
    [snapInterval, totalDots]
  );

  // Calculate card height to match ImageFactCard (9/16 aspect ratio)
  const aspectRatio = isTablet ? 0.38 : 9 / 16;
  const ctaCardHeight = cardWidth * aspectRatio;

  const renderItem = useCallback(
    ({ item }: { item: CarouselItem }) => {
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
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: colors.primaryLight,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Compass size={28} color={colors.primary} />
              </View>
              <Text.Title color="$text" style={{ textAlign: 'center' }}>
                {t('discoverMoreTitle')}
              </Text.Title>
              <Text.Caption color="$textSecondary" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                {t('discoverMoreDescription')}
              </Text.Caption>
            </Pressable>
          </View>
        );
      }

      // Regular fact card
      const fact = item as FactWithRelations;
      return (
        <View style={{ width: cardWidth }}>
          <ImageFactCard
            title={fact.title || fact.content.substring(0, 80) + '...'}
            imageUrl={fact.image_url!}
            factId={fact.id}
            category={fact.categoryData || fact.category}
            categorySlug={fact.categoryData?.slug || fact.category}
            onPress={() => onFactPress(fact)}
          />
        </View>
      );
    },
    [cardWidth, ctaCardHeight, radius, colors, spacing, onFactPress, onDiscoverPress, t]
  );

  const keyExtractor = useCallback(
    (item: CarouselItem) => {
      if ('id' in item && item.id === DISCOVER_CTA_ID) return DISCOVER_CTA_ID;
      return `carousel-${(item as FactWithRelations).id}`;
    },
    []
  );

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
          onPress={() => onFactPress(facts[0])}
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
          gap: CARD_GAP,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />

      {/* Pagination dots */}
      <View style={[styles.dotsContainer, { marginTop: spacing.sm, marginBottom: spacing.md }]}>
        {data.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index === activeIndex
                ? [styles.dotActive, { backgroundColor: colors.primary }]
                : [styles.dotInactive, { backgroundColor: colors.border }],
            ]}
          />
        ))}
      </View>
    </View>
  );
});

FactCarousel.displayName = 'FactCarousel';

const styles = StyleSheet.create({
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    borderRadius: 4,
  },
  dotActive: {
    width: 8,
    height: 8,
  },
  dotInactive: {
    width: 6,
    height: 6,
  },
});
