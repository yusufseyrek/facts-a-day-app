import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

import { RefreshCw } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';

import { IMAGE_PLACEHOLDER, IMAGE_RETRY } from '../config/images';
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

  const {
    imageUri: authenticatedImageUri,
    isLoading: isImageLoading,
    hasError,
    retry: retryImage,
  } = useFactImage(fact.image_url!, fact.id);

  const [imageLoaded, setImageLoaded] = useState(false);

  // Prevent flicker: keep last valid URI while retrying
  const lastValidUriRef = useRef<string | null>(null);
  if (authenticatedImageUri && authenticatedImageUri !== lastValidUriRef.current) {
    lastValidUriRef.current = authenticatedImageUri;
  }
  const displayUri = authenticatedImageUri || lastValidUriRef.current;

  // 2-phase retry: render retries (cheap) → download retries (expensive)
  const [renderRetryCount, setRenderRetryCount] = useState(0);
  const [downloadRetryCount, setDownloadRetryCount] = useState(0);
  const retryPendingRef = useRef(false);

  const isPermanentlyFailed =
    !isImageLoading &&
    !imageLoaded &&
    ((hasError && !displayUri) ||
      ((hasError || downloadRetryCount >= IMAGE_RETRY.MAX_DOWNLOAD_ATTEMPTS) &&
        renderRetryCount >= IMAGE_RETRY.MAX_RENDER_ATTEMPTS));

  // Watchdog: if expo-image doesn't call onError/onLoad after a render retry, force-advance
  const renderWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (renderRetryCount === 0 || imageLoaded || isImageLoading || isPermanentlyFailed) return;

    if (renderWatchdogRef.current) clearTimeout(renderWatchdogRef.current);
    renderWatchdogRef.current = setTimeout(() => {
      if (retryPendingRef.current) return;
      if (renderRetryCount < IMAGE_RETRY.MAX_RENDER_ATTEMPTS) {
        setRenderRetryCount((prev) => prev + 1);
      } else if (downloadRetryCount < IMAGE_RETRY.MAX_DOWNLOAD_ATTEMPTS) {
        setDownloadRetryCount((prev) => prev + 1);
        setRenderRetryCount(0);
        retryImage();
      }
    }, 3000);

    return () => {
      if (renderWatchdogRef.current) clearTimeout(renderWatchdogRef.current);
    };
  }, [renderRetryCount, downloadRetryCount, imageLoaded, isImageLoading, isPermanentlyFailed, retryImage]);

  const handleImageError = useCallback(() => {
    if (isImageLoading || !displayUri || retryPendingRef.current) return;

    if (renderRetryCount < IMAGE_RETRY.MAX_RENDER_ATTEMPTS) {
      retryPendingRef.current = true;
      setTimeout(() => {
        retryPendingRef.current = false;
        setRenderRetryCount((prev) => prev + 1);
      }, IMAGE_RETRY.RENDER_DELAY);
      return;
    }

    if (downloadRetryCount < IMAGE_RETRY.MAX_DOWNLOAD_ATTEMPTS) {
      retryPendingRef.current = true;
      setTimeout(() => {
        retryPendingRef.current = false;
        setDownloadRetryCount((prev) => prev + 1);
        setRenderRetryCount(0);
        retryImage();
      }, IMAGE_RETRY.DOWNLOAD_DELAY);
    }
  }, [renderRetryCount, downloadRetryCount, retryImage, isImageLoading, displayUri]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  // Reset all retry state when fact changes
  useEffect(() => {
    setRenderRetryCount(0);
    setDownloadRetryCount(0);
    setImageLoaded(false);
    retryPendingRef.current = false;
  }, [fact.id]);

  const handleRetryFromError = useCallback(() => {
    setRenderRetryCount(0);
    setDownloadRetryCount(0);
    setImageLoaded(false);
    retryPendingRef.current = false;
    retryImage();
  }, [retryImage]);

  const imageSource = useMemo(
    () => (displayUri ? { uri: displayUri } : null),
    [displayUri]
  );

  const mountTimestamp = useRef(Date.now()).current;
  const recyclingKey = `popular-${fact.id}-${mountTimestamp}-${renderRetryCount}-${downloadRetryCount}`;

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
