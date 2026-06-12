import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Image } from 'expo-image';

import { IMAGE_PLACEHOLDER, IMAGE_RETRY } from '../config/images';
import { useFactMorphSource } from '../hooks/useFactMorphSource';
import { usePressFeedback } from '../hooks/usePressFeedback';
import { useResolvedImageUri } from '../hooks/useResolvedImageUri';
import { hexColors, useTheme } from '../theme';
import { androidRipple } from '../utils/styles';
import { useResponsive } from '../utils/useResponsive';

import { CategoryBadge } from './CategoryBadge';
import { ChevronRight, RefreshCw } from './icons';
import { ImagePlaceholder } from './ImagePlaceholder';
import { FONT_FAMILIES, Text } from './Typography';

import type { FactWithRelations } from '../services/database';

interface CompactFactCardProps {
  fact: FactWithRelations;
  onPress: () => void;
  cardWidth?: number;
  hideCategoryBadge?: boolean;
  showChevron?: boolean;
  titleLines?: number;
  imageSize?: number;
}

const CompactFactCardComponent = ({
  fact,
  onPress,
  cardWidth,
  hideCategoryBadge,
  showChevron,
  imageSize,
  titleLines = 2,
}: CompactFactCardProps) => {
  const { theme } = useTheme();
  const { spacing, radius, media, typography, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  const thumbnailSize = imageSize ?? media.compactCardThumbnailSize;

  // Light opacity-dim press feedback (replaces the old scale spring)
  const { pressStyle, onPressIn, onPressOut } = usePressFeedback();

  // Thumbnail, measured on press-in for the image → detail-hero morph: the
  // container transform starts and ends on the thumbnail rect, not the row.
  // isMorphSourceActive hides just the thumbnail while its morph presentation
  // is on screen, so the closing morph never lands on a visible duplicate.
  const thumbnailRef = useRef<View>(null);
  const { registerMorphSource, isMorphSourceActive } = useFactMorphSource(fact.id);

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

  // Register the thumbnail as the morph source on press-IN: measureInWindow
  // is async, so starting here guarantees the rect is registered by the time
  // onPress (touch up) pushes the route via factDetailBasePath(). The replica
  // mirrors whatever the thumbnail currently shows (image, blurhash, or
  // placeholder), so no imageLoaded gate is needed. A press-in that turns
  // into a scroll leaves a harmless entry (fact-id + TTL guarded).
  const handlePressIn = useCallback(() => {
    onPressIn();
    thumbnailRef.current?.measureInWindow((x, y, width, height) => {
      if (!(width > 0 && height > 0)) return;
      registerMorphSource({
        kind: 'thumbnail',
        factId: fact.id,
        x,
        y,
        width,
        height,
        borderRadius: radius.md,
        imageUri: resolvedUri ?? null,
        title: fact.title ?? '',
        categoryIcon: fact.categoryData?.icon,
        categoryColor: fact.categoryData?.color_hex,
      });
    });
  }, [onPressIn, registerMorphSource, fact, radius.md, resolvedUri]);

  const shadowStyle = theme === 'dark' ? styles.shadowDark : styles.shadowLight;

  return (
    <Animated.View
      style={[{ width: cardWidth ?? '100%', borderRadius: radius.lg }, shadowStyle, pressStyle]}
      shouldRasterizeIOS={true}
      renderToHardwareTextureAndroid={true}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={onPressOut}
        android_ripple={androidRipple(theme === 'dark')}
        style={[
          styles.card,
          {
            borderRadius: radius.lg,
            // Clip the Android ripple to the rounded card.
            overflow: 'hidden',
            backgroundColor: colors.cardBackground,
            padding: spacing.md,
            gap: spacing.md,
          },
        ]}
      >
        {/* Thumbnail — collapsable=false so measureInWindow works on Android */}
        <View
          ref={thumbnailRef}
          collapsable={false}
          style={[
            styles.thumbnail,
            {
              borderRadius: radius.md,
              width: thumbnailSize,
              height: thumbnailSize,
            },
            isMorphSourceActive && styles.morphSourceHidden,
          ]}
        >
          {imageSource ? (
            <>
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
            </>
          ) : (
            <ImagePlaceholder
              width={thumbnailSize}
              height={thumbnailSize}
              borderRadius={radius.md}
              iconSize={thumbnailSize * 0.4}
              categoryIcon={fact.categoryData?.icon}
              categoryColor={fact.categoryData?.color_hex}
            />
          )}
        </View>

        {/* Text content */}
        <View style={[styles.textContainer, { gap: spacing.xs }]}>
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

        {showChevron && <ChevronRight size={iconSizes.md} color={colors.primary} />}
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
  // Hides the thumbnail while it is the active morph source (the morph
  // presentation covers this exact rect, so no hole is ever visible).
  morphSourceHidden: {
    opacity: 0,
  },
});

export const CompactFactCard = React.memo(CompactFactCardComponent, (prevProps, nextProps) => {
  return prevProps.fact.id === nextProps.fact.id && prevProps.cardWidth === nextProps.cardWidth;
});
