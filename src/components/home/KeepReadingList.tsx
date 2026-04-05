import React, { useCallback, forwardRef, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Image } from 'expo-image';

import { NativeMediaAspectRatio } from 'react-native-google-mobile-ads';

import { ADS_ENABLED, LAYOUT, NATIVE_ADS } from '../../config/app';
import { useResolvedImageUri } from '../../hooks/useResolvedImageUri';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { InlineNativeAd } from '../ads/InlineNativeAd';
import { FONT_FAMILIES, Text } from '../Typography';

import type { FactWithRelations } from '../../services/database';

// ---------- Item types for mixed list ----------
type KeepReadingRow =
  | { type: 'fact'; fact: FactWithRelations; index: number }
  | { type: 'ad'; key: string };

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

// ---------- Item component ----------
const IMAGE_SCALE = 1.25;

interface KeepReadingItemProps {
  fact: FactWithRelations;
  onPress: () => void;
  isOdd: boolean;
}

const KeepReadingItem = React.memo(({ fact, onPress, isOdd }: KeepReadingItemProps) => {
  const { theme } = useTheme();
  const { spacing, media } = useResponsive();
  const colors = hexColors[theme];
  const resolvedUri = useResolvedImageUri(fact.id, fact.image_url);

  const imageSize = Math.round(media.compactCardThumbnailSize * IMAGE_SCALE);
  const categoryName = fact.categoryData?.name;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        {
          padding: spacing.xl,
          backgroundColor: isOdd ? `${colors.cardBackground}70` : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.textContainer, { marginRight: spacing.lg }]}>
        {categoryName && (
          <Text.Label
            color={fact.categoryData?.color_hex ?? '$textSecondary'}
            marginBottom={spacing.xs}
          >
            {categoryName}
          </Text.Label>
        )}
        <Text.Body color="$text" numberOfLines={4} fontFamily={FONT_FAMILIES.semibold}>
          {fact.title}
        </Text.Body>
      </View>
      <Image
        source={resolvedUri ? { uri: resolvedUri } : undefined}
        style={[
          styles.image,
          {
            width: imageSize,
            height: imageSize,
            borderRadius: spacing.sm,
            backgroundColor: colors.border,
          },
        ]}
        contentFit="cover"
        transition={200}
      />
    </Pressable>
  );
});

KeepReadingItem.displayName = 'KeepReadingItem';

// ---------- Centering wrapper applied once in renderItem ----------
const centeredStyle = {
  maxWidth: LAYOUT.MAX_CONTENT_WIDTH,
  width: '100%' as const,
  alignSelf: 'center' as const,
};

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

    const items = useMemo(() => {
      const result: KeepReadingRow[] = [];
      facts.forEach((fact, i) => {
        result.push({ type: 'fact', fact, index: i });
        if (
          ADS_ENABLED &&
          !isPremium &&
          (i + 1) % NATIVE_ADS.KEEP_READING_AD_INTERVAL === 0 &&
          i < facts.length - 1
        ) {
          result.push({ type: 'ad', key: `kr-ad-${i}` });
        }
      });
      return result;
    }, [facts, isPremium]);

    const renderItem = useCallback(
      ({ item }: { item: KeepReadingRow }) => {
        const content =
          item.type === 'ad' ? (
            <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
              <InlineNativeAd aspectRatio={NativeMediaAspectRatio.LANDSCAPE} />
            </View>
          ) : (
            <KeepReadingItem
              fact={item.fact}
              onPress={() => onFactPress(item.fact, item.index)}
              isOdd={item.index % 2 === 0}
            />
          );

        return <View style={centeredStyle}>{content}</View>;
      },
      [onFactPress, spacing.md]
    );

    const keyExtractor = useCallback((item: KeepReadingRow) => {
      if (item.type === 'ad') return item.key;
      return `kr-${item.fact.id}`;
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

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  image: {
    overflow: 'hidden',
  },
});
