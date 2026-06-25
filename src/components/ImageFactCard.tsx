import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { IMAGE_PLACEHOLDER, IMAGE_RETRY } from '../config/images';
import { useFactMorphSource } from '../hooks/useFactMorphSource';
import { usePressFeedback } from '../hooks/usePressFeedback';
import { useResolvedImageUri } from '../hooks/useResolvedImageUri';
import { getIsConnected } from '../services/network';
import { useResponsive } from '../utils/useResponsive';

import { CategoryBadge } from './CategoryBadge';
import { FavoriteButton } from './FavoriteButton';
import { Crown, RefreshCw } from './icons';
import { ImagePlaceholder } from './ImagePlaceholder';
import { OfflineSaveButton } from './OfflineSaveButton';
import { Text } from './Typography';

import type { ImageSource } from 'expo-image';
import type { Category } from '../services/database';

interface ImageFactCardProps {
  title: string;
  imageUrl: string;
  factId: number;
  category?: string | Category;
  categorySlug?: string;
  onPress: () => void;
  isTablet?: boolean;
  /** Optional testID for automated testing with Maestro */
  testID?: string;
  /** Called once when the image has successfully loaded and rendered */
  onImageReady?: () => void;
  /** Optional aspect ratio override (e.g., 1 for square). Defaults to config.cardAspectRatio */
  aspectRatio?: number;
  /** Optional explicit card width for height calculation (e.g., in carousels where card is narrower than screen) */
  cardWidth?: number;
  /** Optional text component for the title. Receives the same props as Text.Title. Defaults to Text.Title. */
  TitleComponent?: React.ComponentType<any>;
  /** Optional style override for the content overlay (title area at the bottom) */
  contentOverlayStyle?: ViewStyle;
  favoritePositionStyle?: ViewStyle;
  /** Optional override for the title's number of lines. Defaults to config.maxLines. */
  titleNumberOfLines?: number;
  /** When true, shows a gold crown icon instead of the favorite button */
  isPremiumLocked?: boolean;
  /** When true (premium), shows the "save for offline" control next to the
   *  favorite button and the downloaded remark once the fact is pinned. */
  showOfflineSave?: boolean;
}

const ImageFactCardComponent = ({
  title,
  imageUrl,
  factId,
  category,
  onPress,
  isTablet: _isTabletProp = false,
  testID,
  onImageReady,
  aspectRatio,
  cardWidth: cardWidthProp,
  TitleComponent,
  contentOverlayStyle,
  favoritePositionStyle,
  titleNumberOfLines,
  isPremiumLocked,
  showOfflineSave,
}: ImageFactCardProps) => {
  const { screenWidth, spacing, radius, config } = useResponsive();

  // Light opacity-dim press feedback (replaces the old scale spring)
  const { pressStyle, onPressIn, onPressOut } = usePressFeedback();

  // Card root, measured on press-in for the card → detail morph transition.
  // isMorphSourceActive hides this card while its morph presentation is on
  // screen, so the closing screen never lands on top of a visible duplicate.
  const cardRef = useRef<View>(null);
  const { registerMorphSource, isMorphSourceActive } = useFactMorphSource(factId);

  // Shimmer animation using Reanimated (runs on UI thread)
  const shimmerOpacity = useSharedValue(0.3);

  // Track if image has loaded successfully
  const [imageLoaded, setImageLoaded] = useState(false);

  // Resolved image URI: local cache or remote URL
  const resolvedUri = useResolvedImageUri(factId, imageUrl);

  // Retry state for re-rendering (handles Android timing issues with expo-image)
  const [renderRetryCount, setRenderRetryCount] = useState(0);

  // All retries exhausted and still no image — show error overlay
  const isPermanentlyFailed = !imageLoaded && renderRetryCount >= IMAGE_RETRY.MAX_RENDER_ATTEMPTS;

  // When offline and image failed, hide the image area entirely (text-only card)
  const isOfflineImageFailed = isPermanentlyFailed && !getIsConnected();

  // Show loading shimmer when image hasn't loaded yet, but NOT when permanently failed
  const showLoadingState = !imageLoaded && !isPermanentlyFailed;

  // Watchdog: after a render retry, if expo-image doesn't call onError/onLoad again
  // within a few seconds, force-advance the retry state to prevent getting stuck
  const renderWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (renderRetryCount === 0 || imageLoaded || isPermanentlyFailed) {
      return;
    }

    if (renderWatchdogRef.current) {
      clearTimeout(renderWatchdogRef.current);
      renderWatchdogRef.current = null;
    }

    renderWatchdogRef.current = setTimeout(() => {
      renderWatchdogRef.current = null;
      if (retryPendingRef.current) return;

      if (renderRetryCount < IMAGE_RETRY.MAX_RENDER_ATTEMPTS) {
        setRenderRetryCount((prev) => prev + 1);
      }
    }, 3000);

    return () => {
      if (renderWatchdogRef.current) {
        clearTimeout(renderWatchdogRef.current);
        renderWatchdogRef.current = null;
      }
    };
  }, [renderRetryCount, imageLoaded, isPermanentlyFailed]);

  // Shimmer animated style
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmerOpacity.value,
  }));

  // Run shimmer animation when loading (Reanimated - UI thread)
  useEffect(() => {
    if (showLoadingState) {
      shimmerOpacity.value = withRepeat(
        withSequence(withTiming(0.6, { duration: 1500 }), withTiming(0.3, { duration: 1500 })),
        -1,
        false
      );
    } else {
      // Dissolve the loading veil instead of cutting it. The real image is
      // already painted underneath (and itself cross-dissolves in via the
      // Image `transition`), so fading this overlay out reveals it smoothly.
      // Runs on the UI thread — one node, negligible cost.
      cancelAnimation(shimmerOpacity);
      shimmerOpacity.value = withTiming(0, { duration: IMAGE_FADE_MS });
    }
  }, [showLoadingState]);

  // Track if we're currently waiting for a retry (prevent duplicate error handling)
  const retryPendingRef = useRef(false);

  const Title = TitleComponent || Text.Title;

  // Calculate card height based on aspect ratio
  // Use a smaller aspect ratio for tablets so cards aren't too tall
  // When aspectRatio is provided, use the base width / aspectRatio for the height
  // cardWidthProp allows carousels to pass the actual card width for correct sizing
  const baseWidth = cardWidthProp || screenWidth;
  const cardHeight = aspectRatio ? baseWidth / aspectRatio : baseWidth * config.cardAspectRatio;

  // Handle image render error — retry by re-rendering (fixes Android timing issues)
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

  // Reset retry state and loaded state when imageUrl changes
  React.useEffect(() => {
    setRenderRetryCount(0);
    retryPendingRef.current = false;
    setImageLoaded(false);
  }, [imageUrl]);

  // Handle image load success
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    onImageReady?.();
  }, [onImageReady]);

  // Reset everything and retry from scratch when user taps error overlay
  const handleRetryFromError = useCallback(() => {
    setRenderRetryCount(0);
    setImageLoaded(false);
    retryPendingRef.current = false;
  }, []);

  // Generate image source - uses local cache if available, otherwise remote URL
  const imageSource: ImageSource | null = useMemo(
    () => (resolvedUri ? { uri: resolvedUri } : null),
    [resolvedUri]
  );

  // Style objects
  const imageContainerStyle = { height: cardHeight };
  // Simple image style - fill the container completely
  const imageStyle = {
    width: '100%' as const,
    height: '100%' as const,
  };
  const badgePositionStyle = {
    top: spacing.md,
    left: spacing.md,
  };
  const defaultFavoritePositionStyle = {
    top: spacing.md,
    right: spacing.md,
  };
  const defaultContentOverlayStyle = {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xl * 1.5,
  };

  const _favoritePositionStyle = favoritePositionStyle || defaultFavoritePositionStyle;
  const _contentOverlayStyle = contentOverlayStyle || defaultContentOverlayStyle;

  // Content-stable recycling key. expo-image uses this to decide whether the
  // decoded bitmap in a recycled view is still valid — keying it on fact id
  // (plus retry count when we explicitly re-attempt) avoids re-decoding the
  // same image on every FlashList recycle.
  const recyclingKey = `fact-image-${factId}-${renderRetryCount}`;

  const pressableStyle = useMemo(
    () => ({
      overflow: 'hidden' as const,
      borderRadius: radius.lg,
    }),
    [radius]
  );

  const cardWrapperStyle = useMemo(
    () => ({
      borderRadius: radius.lg,
      overflow: 'hidden' as const,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
    }),
    [radius]
  );

  // Register this card as the morph source on press-IN: measureInWindow is
  // async, so starting here guarantees the rect is registered by the time
  // onPress (touch up) opens the fact via openFactDetail (in-tab overlay). Skipped
  // while the image is still loading — morphing a shimmer reads broken, and
  // the press then falls back to the plain card presentation. A press-in that
  // turns into a scroll leaves a harmless entry (fact-id + TTL guarded).
  const handlePressIn = useCallback(() => {
    onPressIn();
    if (!imageLoaded) return;
    cardRef.current?.measureInWindow((x, y, width, height) => {
      if (!(width > 0 && height > 0)) return;
      registerMorphSource({
        kind: 'image-card',
        factId,
        x,
        y,
        width,
        height,
        borderRadius: radius.lg,
        imageUri: resolvedUri ?? null,
        imageUrl,
        title,
        category,
        categorySlug: typeof category === 'string' ? category : category?.slug,
        titleNumberOfLines: titleNumberOfLines ?? config.maxLines,
        isPremiumLocked,
        showOfflineSave,
        contentOverlayStyle: _contentOverlayStyle,
        favoritePositionStyle: _favoritePositionStyle,
        TitleComponent,
      });
    });
  }, [
    onPressIn,
    registerMorphSource,
    imageLoaded,
    factId,
    radius.lg,
    resolvedUri,
    imageUrl,
    title,
    category,
    titleNumberOfLines,
    config.maxLines,
    isPremiumLocked,
    showOfflineSave,
    _contentOverlayStyle,
    _favoritePositionStyle,
    TitleComponent,
  ]);

  // Offline text-only card: no image, just text on dark background
  if (isOfflineImageFailed) {
    return (
      <Animated.View
        style={[
          styles.shadowWrapper,
          { borderRadius: radius.lg, marginBottom: spacing.md },
          pressStyle,
        ]}
        shouldRasterizeIOS={true}
        renderToHardwareTextureAndroid={true}
      >
        <Pressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          android_ripple={androidRipple}
          style={pressableStyle}
          testID={testID || `fact-card-${factId}`}
          aria-label={title}
          role="button"
        >
          <View style={[cardWrapperStyle, styles.imageContainer, styles.offlineCard]}>
            <View style={StyleSheet.absoluteFill}>
              <ImagePlaceholder
                width={baseWidth}
                height={cardHeight}
                iconSize={cardHeight * 0.6}
                categoryIcon={typeof category === 'object' ? category?.icon : undefined}
                categoryColor={typeof category === 'object' ? category?.color_hex : undefined}
              />
            </View>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {category && (
              <View style={{ marginBottom: spacing.sm }}>
                <CategoryBadge category={category} />
              </View>
            )}
            <Title
              color="#FFFFFF"
              numberOfLines={titleNumberOfLines ?? config.maxLines}
              style={styles.titleShadow}
            >
              {title}
            </Title>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.shadowWrapper,
        { borderRadius: radius.lg, marginBottom: spacing.md },
        pressStyle,
      ]}
      shouldRasterizeIOS={true}
      renderToHardwareTextureAndroid={true}
    >
      <Pressable
        ref={cardRef}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={onPressOut}
        android_ripple={androidRipple}
        style={[pressableStyle, isMorphSourceActive && styles.morphSourceHidden]}
        testID={testID || `fact-card-${factId}`}
        aria-label={title}
        role="button"
      >
        <View style={cardWrapperStyle}>
          {/* Image Container */}
          <View style={[styles.imageContainer, imageContainerStyle]}>
            {/* Image or placeholder */}
            {imageSource ? (
              <>
                <Image
                  source={imageSource}
                  aria-hidden={true}
                  style={imageStyle}
                  contentFit="cover"
                  cachePolicy={Platform.OS === 'android' ? 'disk' : 'memory-disk'}
                  transition={IMAGE_FADE_MS}
                  placeholder={placeholder}
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                  recyclingKey={recyclingKey}
                  priority="high"
                />
                {/* Loading veil — kept mounted past load so it can fade out
                    (opacity is driven to 0 by shimmerStyle) rather than cut. */}
                {!isPermanentlyFailed && (
                  <Animated.View
                    style={[StyleSheet.absoluteFill, styles.shimmerOverlay, shimmerStyle]}
                    pointerEvents="none"
                  />
                )}
                {isPermanentlyFailed && (
                  <TouchableOpacity
                    style={[StyleSheet.absoluteFill, styles.errorOverlay]}
                    onPress={handleRetryFromError}
                    activeOpacity={0.7}
                  >
                    <RefreshCw size={32} color="rgba(255, 255, 255, 0.6)" />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <View style={StyleSheet.absoluteFill}>
                <ImagePlaceholder
                  width={baseWidth}
                  height={cardHeight}
                  iconSize={cardHeight * 0.6}
                  categoryIcon={typeof category === 'object' ? category?.icon : undefined}
                  categoryColor={typeof category === 'object' ? category?.color_hex : undefined}
                />
              </View>
            )}

            {/* Dark gradient overlay for text legibility */}
            <LinearGradient
              colors={gradientColors}
              locations={gradientLocations}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Category badge */}
            {category && (
              <View style={[styles.badgeContainer, badgePositionStyle]}>
                <CategoryBadge category={category} showLock={isPremiumLocked} />
              </View>
            )}

            {/* Favorite button or premium crown — with the offline-save control
                tucked to its left when enabled (premium-gated inside the button). */}
            <View style={[styles.badgeContainer, _favoritePositionStyle, styles.actionCluster]}>
              {showOfflineSave && !isPremiumLocked && <OfflineSaveButton factId={factId} />}
              {isPremiumLocked ? (
                <View style={styles.crownShadow}>
                  <Crown size={22} color="#FFD700" fill="#FFD700" />
                </View>
              ) : (
                <FavoriteButton
                  factId={factId}
                  imageUrl={imageUrl}
                  categorySlug={typeof category === 'string' ? category : category?.slug}
                />
              )}
            </View>

            {/* Content overlay */}
            <View style={[styles.contentOverlay, _contentOverlayStyle]}>
              <Title
                color="#FFFFFF"
                numberOfLines={titleNumberOfLines ?? config.maxLines}
                style={styles.titleShadow}
              >
                {title}
              </Title>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
};

// Static values moved outside component to prevent recreation
const androidRipple = {
  color: 'rgba(255, 255, 255, 0.15)',
  borderless: false,
};

const placeholder = { blurhash: IMAGE_PLACEHOLDER.DEFAULT_BLURHASH };
// Cross-dissolve duration shared by the image's native fade-in and the loading
// veil's fade-out, so both resolve together for one cohesive reveal.
const IMAGE_FADE_MS = 300;
const gradientColors = ['transparent', 'rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.85)'] as const;
const gradientLocations = [0.25, 0.55, 1] as const;

const styles = StyleSheet.create({
  shadowWrapper: {
    // iOS shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    // Android: elevation causes thick border artifact inside animated opacity parents
    elevation: Platform.OS === 'android' ? 0 : 4,
  },
  imageContainer: {
    overflow: 'hidden',
  },
  shimmerOverlay: {
    backgroundColor: '#26262c', // Neutral charcoal shimmer (de-blued to match the placeholder)
  },
  errorOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    zIndex: 10,
  },
  // Right-anchored row so the favorite stays put and the offline-save control
  // (when present) sits just to its left.
  actionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  titleShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  crownShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 6,
    padding: 3,
  },
  offlineCard: {
    padding: 20,
    justifyContent: 'flex-end',
    minHeight: 120,
  },
  // Hides the card while it is the active morph source (the expanded detail
  // presentation covers this exact rect, so no hole is ever visible).
  morphSourceHidden: {
    opacity: 0,
  },
});

// Shared with FactCardReplica (the morph transition's static card clone) so
// the replica can't drift from the card's actual look.
export const FACT_CARD_GRADIENT = {
  colors: gradientColors,
  locations: gradientLocations,
} as const;
export const factCardTitleShadow = styles.titleShadow;
export const factCardCrownShadow = styles.crownShadow;

// Memoize the component to prevent unnecessary re-renders
export const ImageFactCard = React.memo(ImageFactCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.title === nextProps.title &&
    prevProps.imageUrl === nextProps.imageUrl &&
    prevProps.factId === nextProps.factId &&
    prevProps.categorySlug === nextProps.categorySlug &&
    prevProps.isTablet === nextProps.isTablet &&
    prevProps.aspectRatio === nextProps.aspectRatio &&
    prevProps.cardWidth === nextProps.cardWidth &&
    prevProps.TitleComponent === nextProps.TitleComponent &&
    prevProps.contentOverlayStyle === nextProps.contentOverlayStyle &&
    prevProps.favoritePositionStyle === nextProps.favoritePositionStyle &&
    prevProps.titleNumberOfLines === nextProps.titleNumberOfLines &&
    prevProps.isPremiumLocked === nextProps.isPremiumLocked &&
    prevProps.showOfflineSave === nextProps.showOfflineSave
  );
});
