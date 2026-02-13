import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

import { RefreshCw } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';

import { IMAGE_PLACEHOLDER, IMAGE_RETRY } from '../config/images';
import { hexColors, useTheme } from '../theme';
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

  const [imageLoaded, setImageLoaded] = useState(false);

  // Render retry for Android timing issues
  const [renderRetryCount, setRenderRetryCount] = useState(0);
  const retryPendingRef = useRef(false);

  const isPermanentlyFailed =
    !imageLoaded && renderRetryCount >= IMAGE_RETRY.MAX_RENDER_ATTEMPTS;

  // Watchdog: if expo-image doesn't call onError/onLoad after a render retry, force-advance
  const renderWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (renderRetryCount === 0 || imageLoaded || isPermanentlyFailed) return;

    if (renderWatchdogRef.current) clearTimeout(renderWatchdogRef.current);
    renderWatchdogRef.current = setTimeout(() => {
      if (retryPendingRef.current) return;
      if (renderRetryCount < IMAGE_RETRY.MAX_RENDER_ATTEMPTS) {
        setRenderRetryCount((prev) => prev + 1);
      }
    }, 3000);

    return () => {
      if (renderWatchdogRef.current) clearTimeout(renderWatchdogRef.current);
    };
  }, [renderRetryCount, imageLoaded, isPermanentlyFailed]);

  const handleImageError = useCallback(() => {
    if (retryPendingRef.current) return;

    if (renderRetryCount < IMAGE_RETRY.MAX_RENDER_ATTEMPTS) {
      retryPendingRef.current = true;
      setTimeout(() => {
        retryPendingRef.current = false;
        setRenderRetryCount((prev) => prev + 1);
      }, IMAGE_RETRY.RENDER_DELAY);
    }
  }, [renderRetryCount]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  // Reset retry state when fact changes
  useEffect(() => {
    setRenderRetryCount(0);
    setImageLoaded(false);
    retryPendingRef.current = false;
  }, [fact.id]);

  const handleRetryFromError = useCallback(() => {
    setRenderRetryCount(0);
    setImageLoaded(false);
    retryPendingRef.current = false;
  }, []);

  const imageSource = useMemo(
    () => (fact.image_url ? { uri: fact.image_url } : null),
    [fact.image_url]
  );

  const mountTimestamp = useRef(Date.now()).current;
  const recyclingKey = `popular-${fact.id}-${mountTimestamp}-${renderRetryCount}`;

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
    <Animated.View style={[{ transform: [{ scale: scaleAnim }], width: cardWidth, borderRadius: radius.lg }, shadowStyle]}>
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
            onError={handleImageError}
            onLoad={handleImageLoad}
            recyclingKey={recyclingKey}
          />
          {isPermanentlyFailed && (
            <TouchableOpacity
              style={[StyleSheet.absoluteFill, styles.errorOverlay]}
              onPress={handleRetryFromError}
              activeOpacity={0.7}
            >
              <RefreshCw size={18} color="rgba(255, 255, 255, 0.6)" />
            </TouchableOpacity>
          )}
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
  errorOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
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
