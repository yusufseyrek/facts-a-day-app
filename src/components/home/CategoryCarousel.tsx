import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, View } from 'react-native';

import { FlashList, FlashListRef } from '@shopify/flash-list';
import { ChevronRight } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { YStack } from 'tamagui';

import { LAYOUT } from '../../config/app';
import { useTranslation } from '../../i18n';
import { trackCarouselSwipe } from '../../services/analytics';
import { hexColors, useTheme } from '../../theme';
import { getContrastColor } from '../../utils/colors';
import { getLucideIcon } from '../../utils/iconMapper';
import { useResponsive } from '../../utils/useResponsive';

import { ImageFactCard } from '../ImageFactCard';
import { FONT_FAMILIES, Text } from '../Typography';

import type { FactViewSource } from '../../services/analytics';
import type { Category, FactWithRelations } from '../../services/database';

interface CategoryCarouselProps {
  category: Category;
  facts: FactWithRelations[];
  onFactPress: (
    fact: FactWithRelations,
    source: FactViewSource,
    factIds: number[],
    index: number
  ) => void;
  onCtaPress: (categorySlug: string) => void;
}

const CATEGORY_CTA_ID = '__category_cta__';

export interface CategoryCarouselRef {
  scrollToStart: () => void;
}

type CarouselItem = FactWithRelations | { id: typeof CATEGORY_CTA_ID; slug: string };

const CategoryCarouselComponent = forwardRef<CategoryCarouselRef, CategoryCarouselProps>(
  ({ category, facts, onFactPress, onCtaPress }, ref) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const { screenWidth, spacing, radius, typography, config, iconSizes } = useResponsive();
    const colors = hexColors[theme];
    const flashListRef = useRef<FlashListRef<CarouselItem>>(null);

    useImperativeHandle(
      ref,
      () => ({
        scrollToStart: () => {
          flashListRef.current?.scrollToOffset({ offset: 0, animated: true });
        },
      }),
      []
    );

    const contentWidth = Math.min(screenWidth, LAYOUT.MAX_CONTENT_WIDTH);
    const isWideScreen = screenWidth > LAYOUT.MAX_CONTENT_WIDTH;

    // Half the main carousel card width
    const fullCardWidth = isWideScreen
      ? contentWidth - spacing.lg * 2
      : contentWidth * config.cardWidthMultiplier;
    const cardWidth = Math.floor(fullCardWidth / 2);
    const cardGap = spacing.md;
    const snapInterval = cardWidth + cardGap;
    const listInset = (screenWidth - contentWidth) / 2 + spacing.md;

    // Card height: 1:1 square
    const cardHeight = cardWidth;

    const factIds = useMemo(() => facts.map((f) => f.id), [facts]);

    const data: CarouselItem[] = useMemo(
      () => [...facts, { id: CATEGORY_CTA_ID, slug: category.slug }],
      [facts, category.slug]
    );

    const activeIndexRef = useRef(0);
    const handleScroll = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / snapInterval);
        if (index !== activeIndexRef.current) {
          activeIndexRef.current = index;
          const factId = index < facts.length ? facts[index]?.id : undefined;
          trackCarouselSwipe({
            section: `category_${category.slug}` as any,
            index,
            factId,
          });
        }
      },
      [snapInterval, facts, category.slug]
    );

    const renderItem = useCallback(
      ({ item }: { item: CarouselItem }) => {
        // CTA card
        if ('id' in item && item.id === CATEGORY_CTA_ID) {
          const categoryColor = category.color_hex || colors.primary;
          const ctaTextColor = getContrastColor(categoryColor);
          return (
            <View style={{ width: cardWidth }}>
              <Pressable
                onPress={() => onCtaPress(category.slug)}
                style={({ pressed }) => ({
                  height: cardHeight,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <LinearGradient
                  colors={[categoryColor + 'CC', categoryColor]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: spacing.md,
                    gap: spacing.sm,
                  }}
                >
                  {getLucideIcon(category.icon, iconSizes.xl, ctaTextColor)}
                  <Text.Label color={ctaTextColor} style={{ textAlign: 'center' }}>
                    {t('viewAll')}
                  </Text.Label>
                  <ChevronRight size={iconSizes.md} color={ctaTextColor + 'B3'} />
                </LinearGradient>
              </Pressable>
            </View>
          );
        }

        // Fact card
        const fact = item as FactWithRelations;
        const factIndex = factIds.indexOf(fact.id);
        return (
          <View style={{ width: cardWidth }}>
            <ImageFactCard
              title={fact.title || fact.content.substring(0, 80) + '...'}
              imageUrl={fact.image_url!}
              factId={fact.id}
              onPress={() =>
                onFactPress(
                  fact,
                  `home_category_${category.slug}` as FactViewSource,
                  factIds,
                  factIndex
                )
              }
              cardWidth={cardWidth}
              aspectRatio={1}
              TitleComponent={Text.Label}
              contentOverlayStyle={{ padding: spacing.md }}
              favoritePositionStyle={{ top: spacing.sm, right: spacing.sm }}
            />
          </View>
        );
      },
      [
        cardWidth,
        cardHeight,
        radius,
        colors,
        spacing,
        iconSizes,
        typography,
        category,
        factIds,
        onFactPress,
        onCtaPress,
        t,
      ]
    );

    const keyExtractor = useCallback((item: CarouselItem) => {
      if ('id' in item && item.id === CATEGORY_CTA_ID) return `cta-${(item as any).slug}`;
      return `cat-${(item as FactWithRelations).id}`;
    }, []);

    const itemSeparator = useCallback(() => <View style={{ width: cardGap }} />, [cardGap]);

    if (facts.length === 0) return null;

    return (
      <YStack>
        {/* Section title */}
        <YStack
          width="100%"
          maxWidth={LAYOUT.MAX_CONTENT_WIDTH}
          alignSelf="center"
          paddingHorizontal={spacing.lg}
          paddingBottom={spacing.sm}
        >
          <Text.Title fontSize={typography.fontSize.body}>{category.name}</Text.Title>
        </YStack>

        {/* Carousel */}
        <View
          style={{
            height: cardHeight + spacing.xxl,
            width: '100%',
          }}
        >
          <FlashList
            ref={flashListRef}
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={snapInterval}
            decelerationRate="fast"
            disableIntervalMomentum
            ItemSeparatorComponent={itemSeparator}
            contentContainerStyle={{
              paddingHorizontal: listInset,
            }}
            drawDistance={cardWidth}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          />
        </View>
      </YStack>
    );
  }
);

export const CategoryCarousel = React.memo(CategoryCarouselComponent);
