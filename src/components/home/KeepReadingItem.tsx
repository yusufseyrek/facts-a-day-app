import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Image } from 'expo-image';

import { useFactMorphSource } from '../../hooks/useFactMorphSource';
import { usePressFeedback } from '../../hooks/usePressFeedback';
import { useResolvedImageUri } from '../../hooks/useResolvedImageUri';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { ImagePlaceholder } from '../ImagePlaceholder';
import { FONT_FAMILIES, Text } from '../Typography';

import type { FactWithRelations } from '../../services/database';

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

  const imageSize = media.keepReadingImageSize;
  const categoryName = fact.categoryData?.name;

  const handlePress = useCallback(() => {
    onPress(fact, index);
  }, [onPress, fact, index]);

  // Smooth animated dim on press (was an instant opacity snap via the
  // Pressable pressed-state style) — same feedback as the feed cards.
  const { pressStyle, onPressIn, onPressOut } = usePressFeedback();

  // Thumbnail, measured on press-in for the image → detail-hero morph: the
  // container transform starts and ends on the image rect, not the row.
  // isMorphSourceActive hides just the image while its morph presentation is
  // on screen, so the closing morph never lands on a visible duplicate.
  const imageRef = useRef<View>(null);
  const { registerMorphSource, isMorphSourceActive } = useFactMorphSource(fact.id);

  // Register the image as the morph source on press-IN: measureInWindow is
  // async, so starting here guarantees the rect is registered by the time
  // onPress (touch up) pushes the route via factDetailBasePath(). A press-in
  // that turns into a scroll leaves a harmless entry (fact-id + TTL guarded).
  const handlePressIn = useCallback(() => {
    onPressIn();
    imageRef.current?.measureInWindow((x, y, width, height) => {
      if (!(width > 0 && height > 0)) return;
      registerMorphSource({
        kind: 'thumbnail',
        factId: fact.id,
        x,
        y,
        width,
        height,
        borderRadius: spacing.sm,
        imageUri: resolvedUri ?? null,
        title: fact.title ?? '',
        categoryColor: fact.categoryData?.color_hex,
        categoryIcon: fact.categoryData?.icon,
      });
    });
  }, [onPressIn, registerMorphSource, fact, resolvedUri, spacing.sm]);

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={onPressOut}
        style={[
          styles.item,
          {
            padding: spacing.xl,
            backgroundColor: isOdd ? `${colors.cardBackground}70` : 'transparent',
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
        {/* Thumbnail — collapsable=false so measureInWindow works on Android */}
        <View
          ref={imageRef}
          collapsable={false}
          style={isMorphSourceActive && styles.morphSourceHidden}
        >
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
        </View>
      </Pressable>
    </Animated.View>
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
  // Hides the thumbnail while it is the active morph source (the morph
  // presentation covers this exact rect, so no hole is ever visible).
  morphSourceHidden: {
    opacity: 0,
  },
});
