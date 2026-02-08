import React, { useCallback, useMemo, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';

import { IMAGE_PLACEHOLDER } from '../config/images';
import { hexColors, useTheme } from '../theme';
import { useFactImage } from '../utils/useFactImage';
import { useResponsive } from '../utils/useResponsive';

import { CategoryBadge } from './CategoryBadge';
import { FONT_FAMILIES, Text } from './Typography';

import type { FactWithRelations } from '../services/database';

interface PopularFactCardProps {
  fact: FactWithRelations;
  onPress: () => void;
  cardWidth: number;
}

const PopularFactCardComponent = ({ fact, onPress, cardWidth }: PopularFactCardProps) => {
  const { theme } = useTheme();
  const { spacing, radius, iconSizes, typography } = useResponsive();
  const colors = hexColors[theme];

  // Thumbnail size scales with device: 64 on phone, 96 on tablet
  const thumbnailSize = iconSizes.heroLg;

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pressDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { imageUri: authenticatedImageUri } = useFactImage(fact.image_url!, fact.id);

  const imageSource = useMemo(
    () => (authenticatedImageUri ? { uri: authenticatedImageUri } : null),
    [authenticatedImageUri]
  );

  const handlePressIn = useCallback(() => {
    if (pressDelayRef.current) clearTimeout(pressDelayRef.current);
    pressDelayRef.current = setTimeout(() => {
      Animated.spring(scaleAnim, {
        toValue: 0.97,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }).start();
    }, 100);
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    if (pressDelayRef.current) {
      clearTimeout(pressDelayRef.current);
      pressDelayRef.current = null;
    }
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, [scaleAnim]);

  const shadowStyle = theme === 'dark' ? styles.shadowDark : styles.shadowLight;

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }], width: cardWidth }, shadowStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.card,
          {
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            padding: spacing.md,
            gap: spacing.md,
          },
        ]}
      >
        {/* Thumbnail */}
        <View
          style={[
            styles.thumbnail,
            { borderRadius: radius.md, width: thumbnailSize, height: thumbnailSize, backgroundColor: colors.border },
          ]}
        >
          <Image
            source={imageSource}
            style={styles.thumbnailImage}
            contentFit="cover"
            cachePolicy={Platform.OS === 'android' ? 'disk' : 'memory-disk'}
            placeholder={placeholder}
            transition={0}
            priority="normal"
          />
        </View>

        {/* Text content */}
        <View style={[styles.textContainer, { height: thumbnailSize, gap: spacing.xs }]}>
          <Text.Label numberOfLines={2} color={colors.text} fontFamily={FONT_FAMILIES.bold}>
            {fact.title}
          </Text.Label>
          {(fact.categoryData || fact.category) && (
            <CategoryBadge
              category={fact.categoryData || fact.category!}
              fontSize={typography.fontSize.tiny}
              compact
            />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const placeholder = { blurhash: IMAGE_PLACEHOLDER.DEFAULT_BLURHASH };

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  shadowLight: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  shadowDark: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
});

export const PopularFactCard = React.memo(PopularFactCardComponent, (prevProps, nextProps) => {
  return prevProps.fact.id === nextProps.fact.id && prevProps.cardWidth === nextProps.cardWidth;
});
