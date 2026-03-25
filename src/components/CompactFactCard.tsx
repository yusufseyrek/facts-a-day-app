import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { RefreshCw } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';

import { IMAGE_PLACEHOLDER, IMAGE_RETRY } from '../config/images';
import { useResolvedImageUri } from '../hooks/useResolvedImageUri';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { CategoryBadge } from './CategoryBadge';
import { FONT_FAMILIES, Text } from './Typography';

import type { FactWithRelations } from '../services/database';

interface CompactFactCardProps {
  fact: FactWithRelations;
  onPress: () => void;
  cardWidth?: number;
  hideCategoryBadge?: boolean;
  titleLines?: number;
}

const CompactFactCardComponent = ({
  fact,
  onPress,
  cardWidth,
  hideCategoryBadge,
  titleLines = 2,
}: CompactFactCardProps) => {
  const { theme } = useTheme();
  const { spacing, radius, media, typography } = useResponsive();
  const colors = hexColors[theme];

  const thumbnailSize = media.compactCardThumbnailSize;

  const scaleAnim = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));
  const pressDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [imageLoaded, setImageLoaded] = useState(false);

  // Resolved image URI: local cache or remote URL
  const resolvedUri = useResolvedImageUri(fact.id, fact.image_url);

  // Render retry for Android timing issues
  const [renderRetryCount, setRenderRetryCount] = useState(0);
  const retryPendingRef = useRef(false);

  const isPermanentlyFailed = !imageLoaded && renderRetryCount >= IMAGE_RETRY.MAX_RENDER_ATTEMPTS;

  // Watchdog: if expo-image doesn't call onError/onLoad after a render retry, force-advance
  const imageErrorRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      imageErrorRetryRef.current = setTimeout(() => {
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
    return () => {
      if (imageErrorRetryRef.current) clearTimeout(imageErrorRetryRef.current);
    };
  }, [fact.id]);

  const handleRetryFromError = useCallback(() => {
    setRenderRetryCount(0);
    setImageLoaded(false);
    retryPendingRef.current = false;
  }, []);

  const imageSource = useMemo(() => (resolvedUri ? { uri: resolvedUri } : null), [resolvedUri]);

  const mountTimestamp = useRef(Date.now()).current;
  const recyclingKey = `popular-${fact.id}-${mountTimestamp}-${renderRetryCount}`;

  const handlePressIn = useCallback(() => {
    if (pressDelayRef.current) clearTimeout(pressDelayRef.current);
    pressDelayRef.current = setTimeout(() => {
      scaleAnim.value = withSpring(0.97, { damping: 8, stiffness: 100 });
    }, 100);
  }, []);

  const handlePressOut = useCallback(() => {
    if (pressDelayRef.current) {
      clearTimeout(pressDelayRef.current);
      pressDelayRef.current = null;
    }
    scaleAnim.value = withSpring(1, { damping: 8, stiffness: 40 });
  }, []);

  const shadowStyle = theme === 'dark' ? styles.shadowDark : styles.shadowLight;

  return (
    <Animated.View
      style={[{ width: cardWidth ?? '100%', borderRadius: radius.lg }, shadowStyle, scaleStyle]}
      shouldRasterizeIOS={true}
      renderToHardwareTextureAndroid={true}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.card,
          {
            borderRadius: radius.lg,
            backgroundColor: colors.cardBackground,
            padding: spacing.md,
            gap: spacing.md,
          },
        ]}
      >
        {/* Thumbnail */}
        <View
          style={[
            styles.thumbnail,
            {
              borderRadius: radius.md,
              width: thumbnailSize,
              height: thumbnailSize,
              backgroundColor: colors.border,
            },
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
          <Text.Label
            numberOfLines={titleLines}
            color={colors.text}
            fontFamily={FONT_FAMILIES.bold}
          >
            {fact.title}
          </Text.Label>
          {!hideCategoryBadge && (fact.categoryData || fact.category) && (
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

export const CompactFactCard = React.memo(CompactFactCardComponent, (prevProps, nextProps) => {
  return prevProps.fact.id === nextProps.fact.id && prevProps.cardWidth === nextProps.cardWidth;
});
