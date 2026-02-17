import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styled } from '@tamagui/core';
import { Calendar, ExternalLink, ImagePlus, RefreshCw, X } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { XStack, YStack } from 'tamagui';

import { useTranslation } from '../i18n';
import { trackSourceLinkClick } from '../services/analytics';
import { onFactViewed } from '../services/appReview';
import { getIsConnected } from '../services/network';
import { addFactDetailTimeSpent, markFactDetailOpened, markFactDetailRead } from '../services/database';
import { deleteNotificationImage, getLocalNotificationImagePath } from '../services/notifications';
import { getCategoryNeonColor, hexColors, useTheme } from '../theme';
import { openInAppBrowser } from '../utils/browser';
import { useResponsive } from '../utils/useResponsive';

import { BannerAd } from './ads';
import { CategoryBadge } from './CategoryBadge';
import { FactActions } from './FactActions';
import { FONT_FAMILIES, Text } from './Typography';

import type { Category, FactWithRelations } from '../services/database';

interface FactModalProps {
  fact: FactWithRelations;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

// Styled components without static responsive values - use inline props with useResponsive()
const HeaderTitleContainer = styled(XStack, {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
});

function slugToTitleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatLastUpdated(dateString: string, locale: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function FactModal({
  fact,
  onClose,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  currentIndex,
  totalCount,
}: FactModalProps) {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const {
    typography,
    spacing,
    iconSizes,
    isTablet,
    screenWidth: SCREEN_WIDTH,
    screenHeight: SCREEN_HEIGHT,
    radius,
    borderWidths,
    media,
  } = useResponsive();

  const insets = useSafeAreaInsets();
  const isLandscape = SCREEN_WIDTH > SCREEN_HEIGHT;
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const currentScrollY = useRef(0);
  const [titleHeight, setTitleHeight] = useState<number>(typography.lineHeight.headline); // Default to 1 line height
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH); // Actual modal width

  // Image loading state tracked via expo-image callbacks
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isImageError, setIsImageError] = useState(false);

  // Shimmer animation for loading placeholder
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Reset image state when fact changes
  useEffect(() => {
    setIsImageLoaded(false);
    setIsImageError(false);
  }, [fact.id]);

  // Show placeholder when loading OR when error (before image loads)
  const showImagePlaceholder = !!fact.image_url && !isImageLoaded;

  // Show error state when image fails
  const isImageFailed = !!fact.image_url && isImageError && !isImageLoaded;

  // Run shimmer animation only during actual loading (not on permanent error)
  const isActivelyLoading = showImagePlaceholder && !isImageFailed;
  useEffect(() => {
    if (isActivelyLoading) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      shimmerAnim.setValue(0);
    }
  }, [isActivelyLoading, shimmerAnim]);

  // Track fact view for app review prompt and interstitial ads
  useEffect(() => {
    onFactViewed();
  }, [fact.id]);

  // Track detail interactions
  const mountTimeRef = useRef(Date.now());
  const hasMarkedRead = useRef(false);

  // Mark detail as opened on mount
  useEffect(() => {
    markFactDetailOpened(fact.id).catch(() => {});
    mountTimeRef.current = Date.now();
    hasMarkedRead.current = false;

    return () => {
      // Track time spent on unmount
      const seconds = Math.round((Date.now() - mountTimeRef.current) / 1000);
      if (seconds > 0) {
        addFactDetailTimeSpent(fact.id, seconds).catch(() => {});
      }
    };
  }, [fact.id]);

  // Local notification image state - prioritize notification image if available
  const [notificationImageUri, setNotificationImageUri] = useState<string | null>(null);

  // Check for local notification image and use it if available, then delete it
  useEffect(() => {
    let isMounted = true;

    const checkAndUseLocalImage = async () => {
      if (!fact.image_url) return;

      try {
        // Check if we have a locally cached notification image
        const localImagePath = await getLocalNotificationImagePath(fact.id);

        if (localImagePath && isMounted) {
          setNotificationImageUri(localImagePath);

          // Delete the notification image after a short delay to ensure it's loaded
          // This prevents the image from being deleted before it's displayed
          setTimeout(async () => {
            await deleteNotificationImage(fact.id);
          }, 1000);
        }
      } catch {
        // Ignore errors checking local notification image
      }
    };

    checkAndUseLocalImage();

    return () => {
      isMounted = false;
    };
  }, [fact.id, fact.image_url]);

  // Use notification image if available, otherwise use remote URL directly
  const imageUri = notificationImageUri || fact.image_url;

  // Smart image availability check: cache → network status → safety timeout
  useEffect(() => {
    if (!imageUri || isImageLoaded || isImageError) return;

    let cancelled = false;
    let safetyTimeoutId: ReturnType<typeof setTimeout>;

    async function checkImageAvailability() {
      // Check expo-image disk cache first
      try {
        const cachePath = await Image.getCachePathAsync(imageUri!);
        if (cachePath || cancelled) return; // Cached — expo-image will load it
      } catch {}

      // Not cached — check network status
      if (!getIsConnected() && !cancelled) {
        setIsImageError(true); // Offline + no cache → immediate no-image
        return;
      }

      // Online but not cached — expo-image loads from network
      // Safety timeout in case network is flaky or image server is down
      if (!cancelled) {
        safetyTimeoutId = setTimeout(() => {
          setIsImageError(true);
        }, 8000);
      }
    }

    checkImageAvailability();
    return () => {
      cancelled = true;
      clearTimeout(safetyTimeoutId);
    };
  }, [imageUri, isImageLoaded, isImageError]);

  // Images are always square (1:1)
  // For tablets: landscape shows 50% height (more content visible), portrait shows 80% height centered
  // For phones: square (full width)
  // Use actual container width (measured via onLayout) instead of screen width for accurate sizing
  const IMAGE_WIDTH = containerWidth;
  const IMAGE_HEIGHT = isTablet
    ? isLandscape
      ? IMAGE_WIDTH * 0.7
      : IMAGE_WIDTH * 0.8
    : containerWidth;

  const handleScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
  });

  // Detect scroll to bottom for read tracking
  const checkScrolledToBottom = useCallback(
    (event: any) => {
      if (hasMarkedRead.current) return;
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      const threshold = 50;
      if (contentOffset.y + layoutMeasurement.height >= contentSize.height - threshold) {
        hasMarkedRead.current = true;
        markFactDetailRead(fact.id).catch(() => {});
      }
    },
    [fact.id]
  );

  const handleSourcePress = useCallback(
    (url: string) => {
      trackSourceLinkClick({ factId: fact.id, domain: extractDomain(url) });
      openInAppBrowser(url, { theme });
    },
    [fact.id, theme]
  );

  let categoryForBadge: string | Category | null = null;
  if (fact.categoryData) {
    categoryForBadge = fact.categoryData;
  } else if (fact.category) {
    try {
      const parsed = JSON.parse(fact.category);
      categoryForBadge = parsed.name || parsed.slug || fact.category;
    } catch {
      categoryForBadge = slugToTitleCase(fact.category);
    }
  }

  // Get category color (same logic as CategoryBadge)
  const categoryColor = React.useMemo(() => {
    if (!categoryForBadge) return null;
    if (typeof categoryForBadge === 'string') {
      return getCategoryNeonColor(categoryForBadge, theme);
    }
    return categoryForBadge.color_hex || getCategoryNeonColor(categoryForBadge.slug, theme);
  }, [categoryForBadge, theme]);

  const hasImage = !!imageUri && !isImageError;

  // Calculate dynamic header height first (needed for transition calculations)
  const basePaddingTop = Platform.OS === 'ios' ? spacing.xl : insets.top;
  const basePaddingBottom = spacing.xl;
  const dynamicHeaderHeight = basePaddingTop + basePaddingBottom + titleHeight;
  const minHeaderHeight =
    Platform.OS === 'ios'
      ? media.buttonHeight + media.searchInputHeight
      : media.searchInputHeight + spacing.xxl + insets.top;
  const headerHeight = Math.max(dynamicHeaderHeight, minHeaderHeight);

  // Header background appears when image starts to be covered (for images) or early for no image
  const HEADER_BG_TRANSITION = hasImage ? IMAGE_HEIGHT - headerHeight : 100;

  // Track scroll position for gesture handling
  React.useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      currentScrollY.current = value;
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  // Fade-in animation for text content on navigation
  const textFadeAnim = useRef(new Animated.Value(1)).current;
  const isFirstRender = useRef(true);

  // Reset scroll position and animate text when fact changes (next/prev navigation)
  useEffect(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    scrollY.setValue(0);
    currentScrollY.current = 0;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Instantly hide text, then fade in (synced with expo-image transition)
    textFadeAnim.setValue(0);
    Animated.timing(textFadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fact.id]);

  // Image scale - stays at 1, no scaling
  const imageScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.3, 1],
    extrapolateRight: 'clamp',
  });

  // Image parallax - moves image down to show center portion
  // At transition: scroll = IMAGE_HEIGHT - headerHeight
  // Visible portion = headerHeight, we want to show center
  // To center: translateY = (IMAGE_HEIGHT - headerHeight) / 2
  const centeredTranslateY = hasImage ? (IMAGE_HEIGHT - headerHeight) / 2 : 0;
  const imageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, HEADER_BG_TRANSITION],
    outputRange: [-50, 0, centeredTranslateY], // At transition, show center portion
    extrapolate: 'clamp',
  });

  // Body image opacity - hides instantly when header background appears (no fade)
  // Use very small epsilon to create instant cutoff without fade
  const bodyImageOpacity = scrollY.interpolate({
    inputRange: [0, Math.max(0, HEADER_BG_TRANSITION - 0.01), HEADER_BG_TRANSITION],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });

  // Header container opacity - appears when image scrolls under (has-image only)
  // For no-image: header is completely hidden; title is sticky via stickyHeaderIndices
  const headerOpacity = hasImage
    ? scrollY.interpolate({
        inputRange: [0, Math.max(0, HEADER_BG_TRANSITION - 0.01), HEADER_BG_TRANSITION],
        outputRange: [0, 0, 1],
        extrapolate: 'clamp',
      })
    : 0;

  // Fade opacity - overlay for header background image (slowly fades in after header becomes visible)
  const FADE_DURATION = 70; // Pixels over which to fade in after header becomes visible
  const fadeOpacity = scrollY.interpolate({
    inputRange: [HEADER_BG_TRANSITION, HEADER_BG_TRANSITION + FADE_DURATION],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Content title opacity - stays visible, no fade
  const contentTitleOpacity = scrollY.interpolate({
    inputRange: [0, 1000],
    outputRange: [1, 1],
    extrapolate: 'clamp',
  });

  // const tabletMagicNumber = isTablet ? 10 : 0;

  const tabletMagicNumber = 0;

  // Header title translateY - slides up from bottom of header as scrollY increases
  // Animation starts when header becomes visible (at HEADER_BG_TRANSITION)
  // Account for centering offset when header is clamped to minimum height
  // When clamped, extra space is distributed above/below title due to alignItems: "center"
  const clampedExtraSpace = Math.max(0, headerHeight - dynamicHeaderHeight);
  const centeringOffset = clampedExtraSpace / 2;
  const headerTitleStartY =
    headerHeight - basePaddingTop + basePaddingBottom + tabletMagicNumber - centeringOffset; // Start from bottom of header, adjusted for centering

  // Continuous animation: translateY decreases (moves up) as scrollY increases
  // The title starts moving up when header becomes visible and continues to move up as user scrolls
  // Clamped at 0 to prevent going below the header
  // For no-image layout: title is static (no slide-up) to avoid distracting motion while reading
  const headerTitleTranslateY = hasImage
    ? scrollY.interpolate({
        inputRange: [
          Math.max(0, HEADER_BG_TRANSITION - 1),
          HEADER_BG_TRANSITION,
          HEADER_BG_TRANSITION + headerTitleStartY,
        ],
        outputRange: [headerTitleStartY, headerTitleStartY, 0],
        extrapolate: 'clamp',
      })
    : 0;

  // Header background image position - shows the center portion of the image
  // To center the image in the header: translate up by (IMAGE_HEIGHT - headerHeight) / 2
  // This aligns the center of the image with the center of the header
  const headerImageTranslateY = hasImage ? -(IMAGE_HEIGHT - headerHeight) / 2 : 0;
  const fadedImageTranslateY = hasImage
    ? scrollY.interpolate({
        inputRange: [-100, 0, HEADER_BG_TRANSITION, HEADER_BG_TRANSITION + 1000],
        outputRange: [-50, headerImageTranslateY, headerImageTranslateY, headerImageTranslateY], // Show center portion
        extrapolate: 'clamp',
      })
    : new Animated.Value(0);

  // Close button is always visible for better UX (especially on iOS where there's no back button)

  // Badge scroll threshold - when category badge scrolls under the header
  // Badge is at: IMAGE_HEIGHT (or 0 if no image) + contentPadding + titleHeight + gap
  // Ensure non-negative to prevent invalid interpolation inputRange
  const BADGE_SCROLL_THRESHOLD = Math.max(
    0,
    (hasImage ? IMAGE_HEIGHT : 0) + spacing.lg + titleHeight + spacing.md - headerHeight
  );

  // Header border animations - appears when category badge scrolls under header
  // ScaleX animation for sleek reveal from center
  const headerBorderScaleX = scrollY.interpolate({
    inputRange: [BADGE_SCROLL_THRESHOLD, BADGE_SCROLL_THRESHOLD + 40],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Subtle opacity fade for polish
  const headerBorderOpacity = scrollY.interpolate({
    inputRange: [BADGE_SCROLL_THRESHOLD, BADGE_SCROLL_THRESHOLD + 20],
    outputRange: [0, 0.7],
    extrapolate: 'clamp',
  });

  // Category badge fade out as it approaches the header
  // Category badge fades out as it scrolls under the header (has-image only)
  // For no-image: badge is always visible (no header to scroll under)
  const categoryBadgeOpacity = hasImage
    ? scrollY.interpolate({
        inputRange: [Math.max(0, BADGE_SCROLL_THRESHOLD - 5), BADGE_SCROLL_THRESHOLD + 35],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      })
    : 1;

  const factTitle = fact.title || fact.content.substring(0, 60) + '...';

  // Announce modal opening to screen readers
  useEffect(() => {
    // Small delay to ensure the modal is rendered
    const timer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(factTitle);
    }, 100);
    return () => clearTimeout(timer);
  }, [factTitle]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme === 'dark' ? hexColors.dark.surface : hexColors.light.surface,
      }}
      accessibilityViewIsModal={true}
      accessibilityLabel={factTitle}
      accessibilityRole="none"
      importantForAccessibility="yes"
      onLayout={(event) => {
        const { width } = event.nativeEvent.layout;
        if (width > 0 && width !== containerWidth) {
          setContainerWidth(width);
        }
      }}
    >
      {/* Sticky Header with Faded Image Background */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          opacity: headerOpacity,
          minHeight: headerHeight,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
            },
          }),
        }}
        collapsable={false}
        pointerEvents="box-none"
      >
        <Animated.View
          pointerEvents="none"
          style={{
            minHeight: headerHeight,
            overflow: 'hidden',
            ...Platform.select({
              android: {
                elevation: 12,
                // Background color for elevation - matches the overlay/solid background
                backgroundColor: hasImage
                  ? theme === 'dark'
                    ? 'rgba(0, 0, 0, 0.35)'
                    : 'rgba(255, 255, 255, 0.5)'
                  : theme === 'dark'
                    ? 'rgba(0, 0, 0, 0.85)'
                    : 'rgba(255, 255, 255, 0.95)',
              },
            }),
          }}
        >
          {/* Faded background image behind header */}
          {hasImage && (
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={{
                  width: IMAGE_WIDTH,
                  height: IMAGE_HEIGHT,
                  transform: [{ translateY: fadedImageTranslateY }],
                }}
              >
                <Image
                  source={{ uri: imageUri! }}
                  aria-label={t('a11y_factImage', { title: factTitle })}
                  role="img"
                  style={{
                    width: IMAGE_WIDTH,
                    height: IMAGE_HEIGHT,
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              </Animated.View>
              {/* Overlay for better text readability */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: fadeOpacity,
                    backgroundColor:
                      theme === 'dark' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.5)',
                  },
                ]}
              />
            </Animated.View>
          )}
          {/* Solid background for header when no image */}
          {!hasImage && (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    theme === 'dark' ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.95)',
                },
              ]}
            />
          )}
          {/* Header content */}
          <XStack
            position="absolute"
            top={0}
            left={0}
            right={0}
            zIndex={100}
            alignItems="center"
            justifyContent="space-between"
            paddingHorizontal={spacing.xl}
            pointerEvents="box-none"
            style={{
              paddingTop: basePaddingTop,
              minHeight: headerHeight,
              paddingBottom: basePaddingBottom,
              zIndex: 101,
              alignItems: 'center',
            }}
          >
            <HeaderTitleContainer pointerEvents="none">
              <Animated.View
                style={{
                  flex: 1,
                  paddingRight: iconSizes.xl + spacing.xs,
                  transform: [{ translateY: headerTitleTranslateY }],
                }}
              >
                <Text.Headline>{factTitle}</Text.Headline>
              </Animated.View>
            </HeaderTitleContainer>
          </XStack>
          {/* Animated border bottom when category badge is hidden */}
          {categoryColor && (
            <Animated.View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: borderWidths.heavy,
                backgroundColor: categoryColor,
                opacity: headerBorderOpacity,
                transform: [{ scaleX: headerBorderScaleX }],
              }}
              pointerEvents="none"
            />
          )}
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        bounces={true}
        onScroll={handleScroll}
        onScrollEndDrag={checkScrolledToBottom}
        onMomentumScrollEnd={checkScrolledToBottom}
        scrollEventThrottle={16}
        // Optimize scroll performance on Android
        removeClippedSubviews={Platform.OS === 'android'}
        stickyHeaderIndices={!hasImage ? [0] : undefined}
      >
        {/* First child: Hero Image (has-image) or Sticky Title (no-image) */}
        {hasImage ? (
          <Animated.View
            style={{
              position: 'relative',
              overflow: 'hidden',
              width: IMAGE_WIDTH,
              height: IMAGE_HEIGHT,
              opacity: bodyImageOpacity,
            }}
          >
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                transform: [{ scale: imageScale }, { translateY: imageTranslateY }],
              }}
            >
              <Image
                source={{ uri: imageUri! }}
                aria-label={t('a11y_factImage', { title: factTitle })}
                role="img"
                style={{
                  width: IMAGE_WIDTH,
                  height: isTablet ? IMAGE_HEIGHT : IMAGE_WIDTH,
                  backgroundColor: theme === 'dark' ? '#1a1a2e' : '#e8e8f0',
                }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                placeholder={
                  !isImageLoaded ? { blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' } : undefined
                }
                onLoad={() => setIsImageLoaded(true)}
                onError={() => setIsImageError(true)}
              />
            </Animated.View>
            {/* Gradient overlay */}
            <LinearGradient
              colors={['rgba(0,0,0,0.5)', 'transparent', 'transparent']}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: media.buttonHeight + media.tabBarHeight,
              }}
              pointerEvents="none"
            />
            {/* Image Loading / Error Placeholder (absolute overlay inside hero) */}
            {showImagePlaceholder && (
              <TouchableOpacity
                activeOpacity={isImageFailed ? 0.7 : 1}
                onPress={
                  isImageFailed
                    ? () => {
                        setIsImageError(false);
                        setIsImageLoaded(false);
                      }
                    : undefined
                }
                disabled={!isImageFailed}
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: theme === 'dark' ? '#1a1a2e' : '#e8e8f0',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Shimmer only during active loading */}
                {isActivelyLoading && (
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        backgroundColor: theme === 'dark' ? '#2d2d44' : '#d0d0e0',
                        opacity: shimmerAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.3, 0.6],
                        }),
                      },
                    ]}
                  />
                )}
                <View style={{ alignItems: 'center', gap: spacing.sm }}>
                  {isImageFailed ? (
                    <RefreshCw
                      size={iconSizes.xl}
                      color={theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)'}
                    />
                  ) : (
                    <ImagePlus
                      size={iconSizes.xl}
                      color={theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'}
                    />
                  )}
                </View>
              </TouchableOpacity>
            )}
          </Animated.View>
        ) : (
          <Animated.View
            style={{
              opacity: textFadeAnim,
              backgroundColor: theme === 'dark' ? hexColors.dark.surface : hexColors.light.surface,
              paddingTop: spacing.xl,
              paddingHorizontal: spacing.xl,
              paddingBottom: spacing.md,
              borderBottomWidth: categoryColor ? borderWidths.heavy : 0,
              borderBottomColor: categoryColor || 'transparent',
            }}
          >
            <View style={{ paddingRight: iconSizes.xl + spacing.xs }}>
              <Text.Headline
                role="heading"
                onTextLayout={(e) => {
                  const lines = e.nativeEvent.lines;
                  const totalHeight = lines.reduce((sum, line) => sum + line.height, 0);
                  if (totalHeight > 0 && totalHeight !== titleHeight) {
                    setTitleHeight(totalHeight);
                  }
                }}
              >
                {factTitle}
              </Text.Headline>
            </View>
          </Animated.View>
        )}

        {/* Content Section */}
        <Animated.View style={{ opacity: textFadeAnim }}>
          <YStack padding={spacing.xl} gap={spacing.md}>
            {/* Title - shown in content only when has image (no-image uses sticky title above) */}
            {hasImage && (
              <Animated.View
                style={{
                  opacity: contentTitleOpacity,
                  paddingRight: iconSizes.xl + spacing.xs,
                }}
              >
                <Text.Headline
                  role="heading"
                  onTextLayout={(e) => {
                    const lines = e.nativeEvent.lines;
                    const totalHeight = lines.reduce((sum, line) => sum + line.height, 0);
                    if (totalHeight > 0 && totalHeight !== titleHeight) {
                      setTitleHeight(totalHeight);
                    }
                  }}
                >
                  {factTitle}
                </Text.Headline>
              </Animated.View>
            )}

            {/* Category Badge & Date */}
            {(categoryForBadge || fact.last_updated || fact.created_at) && (
              <XStack
                gap={spacing.sm}
                flexWrap="wrap"
                alignItems="center"
                justifyContent="space-between"
                width="100%"
              >
                {categoryForBadge && (
                  <Animated.View style={{ opacity: categoryBadgeOpacity }}>
                    <CategoryBadge category={categoryForBadge} factId={fact.id} />
                  </Animated.View>
                )}
                {(fact.last_updated || fact.created_at) && (
                  <XStack alignItems="center" gap={spacing.xs}>
                    <Text.Body
                      fontSize={typography.fontSize.label}
                      color="$textSecondary"
                      fontFamily={FONT_FAMILIES.semibold}
                    >
                      {formatLastUpdated(fact.last_updated || fact.created_at, locale)}
                    </Text.Body>
                    <Calendar size={iconSizes.xs} color="$textSecondary" />
                  </XStack>
                )}
              </XStack>
            )}

            {/* Summary */}
            {fact.summary && (
              <Text.Body color="$text" fontFamily={FONT_FAMILIES.semibold}>
                {fact.summary}
              </Text.Body>
            )}

            {/* Main Content */}
            <Text.Body color="$text" fontFamily={FONT_FAMILIES.regular}>
              {fact.content}
            </Text.Body>

            {/* Source link */}
            {fact.source_url && (
              <Pressable
                onPress={() => handleSourcePress(fact.source_url!)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <XStack alignItems="center" gap={spacing.xs}>
                  <ExternalLink
                    size={iconSizes.xs}
                    color={theme === 'dark' ? hexColors.dark.textMuted : hexColors.light.textMuted}
                  />
                  <Text.Caption color="$textMuted" numberOfLines={1}>
                    {extractDomain(fact.source_url)}
                  </Text.Caption>
                </XStack>
              </Pressable>
            )}
          </YStack>
        </Animated.View>
      </Animated.ScrollView>

      {/* Fixed Close Button - always visible for easy dismissal */}
      {hasImage && (
        <View
          style={{
            position: 'absolute',
            top: (Platform.OS === 'ios' ? 0 : insets.top) + spacing.xl,
            right: spacing.xl,
            zIndex: 9999,
            ...Platform.select({
              android: {
                elevation: 999, // Much higher than any other element to receive touches
              },
            }),
          }}
          collapsable={false}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: spacing.lg, bottom: spacing.lg, left: spacing.lg, right: spacing.lg }}
            testID="fact-modal-close-button"
            aria-label={t('a11y_closeButton')}
            role="button"
            style={{
              width: iconSizes.xl,
              height: iconSizes.xl,
              borderRadius: radius.full,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={iconSizes.md} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Close button for facts without images */}
      {!hasImage && (
        <View
          style={{
            position: 'absolute',
            top: spacing.xl,
            right: spacing.xl,
            zIndex: 9999,
            ...Platform.select({
              android: {
                elevation: 999, // Much higher than any other element to receive touches
              },
            }),
          }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: spacing.lg, bottom: spacing.lg, left: spacing.lg, right: spacing.lg }}
            testID="fact-modal-close-button"
            aria-label={t('a11y_closeButton')}
            role="button"
            style={{
              width: iconSizes.xl,
              height: iconSizes.xl,
              borderRadius: radius.full,
              backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={iconSizes.md} color={theme === 'dark' ? '#FFFFFF' : hexColors.light.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* Anchored Banner Ad at bottom */}
      <BannerAd position="fact-modal" />

      <FactActions
        factId={fact.id}
        factSlug={fact.slug}
        factTitle={fact.title}
        factContent={fact.content}
        imageUrl={imageUri || undefined}
        category={fact.categoryData || fact.category}
        sourceUrl={fact.source_url || undefined}
        onNext={onNext}
        onPrevious={onPrevious}
        hasNext={hasNext}
        hasPrevious={hasPrevious}
        currentIndex={currentIndex}
        totalCount={totalCount}
      />
    </View>
  );
}
