import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';

import { useResolvedImageUri } from '../../hooks/useResolvedImageUri';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { ImagePlaceholder } from '../ImagePlaceholder';
import { FONT_FAMILIES, Text } from '../Typography';

import type { FactWithRelations } from '../../services/database';

const IMAGE_SCALE = 1.25;

interface KeepReadingItemProps {
  fact: FactWithRelations;
  index: number;
  onPress: (fact: FactWithRelations, index: number) => void;
  isOdd: boolean;
}

export const KeepReadingItem = React.memo(function KeepReadingItem({
  fact,
  index,
  onPress,
  isOdd,
}: KeepReadingItemProps) {
  const { theme } = useTheme();
  const { spacing, media } = useResponsive();
  const colors = hexColors[theme];
  const resolvedUri = useResolvedImageUri(fact.id, fact.image_url);

  const imageSize = Math.round(media.compactCardThumbnailSize * IMAGE_SCALE);
  const categoryName = fact.categoryData?.name;

  const handlePress = useCallback(() => {
    onPress(fact, index);
  }, [onPress, fact, index]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.item,
        {
          padding: spacing.xl,
          backgroundColor: isOdd ? `${colors.cardBackground}70` : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.textContainer, { marginRight: spacing.md }]}>
        {categoryName && (
          <Text.Label
            color={fact.categoryData?.color_hex ?? '$textSecondary'}
            marginBottom={spacing.xs}
          >
            {categoryName}
          </Text.Label>
        )}
        <Text.Body color="$text" numberOfLines={5} fontFamily={FONT_FAMILIES.semibold}>
          {fact.title}
        </Text.Body>
      </View>
      {resolvedUri ? (
        <Image
          source={{ uri: resolvedUri }}
          style={[
            styles.image,
            {
              width: imageSize,
              height: imageSize,
              borderRadius: spacing.sm,
            },
          ]}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <ImagePlaceholder
          width={imageSize}
          height={imageSize}
          borderRadius={spacing.sm}
          iconSize={imageSize * 0.4}
          categoryIcon={fact.categoryData?.icon}
          categoryColor={fact.categoryData?.color_hex}
        />
      )}
    </Pressable>
  );
});

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
