import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { IdleScreen } from '../../src/components/ads/IdleScreen';
import { StoryNativeAdCard } from '../../src/components/ads/StoryNativeAdCard';
import { CategoryBadge } from '../../src/components/CategoryBadge';
import { CloseButton } from '../../src/components/CloseButton';
import { FavoriteButton } from '../../src/components/FavoriteButton';
import { ChevronRight, ChevronsUp } from '../../src/components/icons';
import { useStoryMorph } from '../../src/components/storyMorph/StoryMorphContext';
import { FONT_FAMILIES, Text } from '../../src/components/Typography';
import { NATIVE_ADS } from '../../src/config/app';
import { usePremium } from '../../src/contexts';
import { useResolvedImageUri } from '../../src/hooks/useResolvedImageUri';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackScreenView,
  trackStoryClose,
  trackStoryFactView,
  trackStoryOpen,
  trackStoryReadMore,
} from '../../src/services/analytics';
import * as api from '../../src/services/api';
import { checkAndAwardBadges, popModalScreen, pushModalScreen } from '../../src/services/badges';
import * as database from '../../src/services/database';
import { mapApiFactToRelations } from '../../src/services/database';
import { hasReadyAd } from '../../src/services/nativeAds';
import { getSelectedCategories } from '../../src/services/onboarding';
import { takePrefetchedStory, THEME_STORY_PREFIX } from '../../src/services/storyPrefetch';
import { hexColors, useTheme } from '../../src/theme';
import {
  insertNativeAds,
  isNativeAdPlaceholder,
  NativeAdPlaceholder,
} from '../../src/utils/insertNativeAds';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactWithRelations } from '../../src/services/database';

type StoryListItem = FactWithRelations | NativeAdPlaceholder;

// How many facts to pull for a story session (one feed page).
const STORY_FETCH_LIMIT = 100;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function StoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const { locale, t } = useTranslation();
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { spacing, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  // Dimensions.get('screen').height returns the full physical screen height
  // including the area behind system bars. Unlike useWindowDimensions().height,
  // this is consistent across Android versions and OEM skins (e.g. Xiaomi/MIUI)
  // where the window height may incorrectly exclude the nav bar with edgeToEdge.
  // See: https://github.com/facebook/react-native/issues/41918
  const screenHeight = Dimensions.get('screen').height;

  const { isPremium } = usePremium();

  // Track modal screen for badge toast deferral
  useEffect(() => {
    pushModalScreen();
    return () => popModalScreen();
  }, []);

  const [facts, setFacts] = useState<FactWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const viewedFactIds = useRef(new Set<number>());

  // Ad scroll-lock: pause scrolling briefly when landing on a native ad
  const [scrollLocked, setScrollLocked] = useState(false);
  const adPauseProgress = useRef(new Animated.Value(0)).current;
  const adPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Orientation-change handling
  const listRef = useRef<FlashListRef<StoryListItem>>(null);
  const currentIndexRef = useRef(0);
  const isResizingRef = useRef(false);
  const prevDimensionsRef = useRef({ width: screenWidth, height: screenHeight });
  const needsScrollRef = useRef(false);

  // Event-driven prefetch refs
  const prefetchTriggeredRef = useRef(false);
  const factsRef = useRef<FactWithRelations[]>([]);
  const prefetchFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerPrefetch = useCallback(() => {
    if (prefetchTriggeredRef.current) return;
    prefetchTriggeredRef.current = true;
    if (prefetchFallbackRef.current) {
      clearTimeout(prefetchFallbackRef.current);
      prefetchFallbackRef.current = null;
    }
  }, []);

  const [failedAdKeys, setFailedAdKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFailedAdKeys(new Set());
  }, [facts]);

  const handleAdFailed = useCallback((key: string) => {
    setFailedAdKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const storyDataWithAds = useMemo(
    () =>
      insertNativeAds(
        facts,
        NATIVE_ADS.FIRST_AD_INDEX.STORY,
        undefined,
        NATIVE_ADS.STORY_AD_INTERVAL
      ).filter((item) => !isNativeAdPlaceholder(item) || !failedAdKeys.has(item.key)),
    [facts, isPremium, failedAdKeys]
  );

  // Orientation change: clear FlashList layout cache (must run during render,
  // before commit) and flag that we need to scroll back to the current item.
  if (
    prevDimensionsRef.current.width !== screenWidth ||
    prevDimensionsRef.current.height !== screenHeight
  ) {
    prevDimensionsRef.current = { width: screenWidth, height: screenHeight };
    listRef.current?.clearLayoutCacheOnUpdate();
    needsScrollRef.current = true;
  }

  useEffect(() => {
    if (!needsScrollRef.current) return;
    needsScrollRef.current = false;

    const targetIndex = currentIndexRef.current;
    if (storyDataWithAds.length === 0 || targetIndex === 0) return;

    isResizingRef.current = true;
    const raf = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: targetIndex, animated: false });
    });
    const timer = setTimeout(() => {
      isResizingRef.current = false;
    }, 400);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      isResizingRef.current = false;
    };
  }, [screenHeight, screenWidth]);

  // Swipe-up hint animation: slides up while fading out, then resets
  const hintTranslateY = useRef(new Animated.Value(0)).current;
  const hintOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (scrollLocked) return;
    hintTranslateY.setValue(0);
    hintOpacity.setValue(1);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(hintTranslateY, {
            toValue: -14,
            duration: 800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(hintOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(hintTranslateY, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(hintOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [scrollLocked]);

  useEffect(() => {
    loadFacts();
    return () => {
      if (prefetchFallbackRef.current) {
        clearTimeout(prefetchFallbackRef.current);
        prefetchFallbackRef.current = null;
      }
      if (adPauseTimer.current) {
        clearTimeout(adPauseTimer.current);
        adPauseTimer.current = null;
      }
    };
  }, [category, locale]);

  const loadFacts = async () => {
    try {
      setLoading(true);

      // Stories are fed from the cursor feed (single or multiple categories),
      // then ordered unseen-first using the local story-view log — there's no
      // local facts mirror to compute is_viewed anymore. `theme:<slug>` story
      // slugs (event theme buttons) page from the theme facts endpoint instead;
      // both paths share the prefetch cache, keyed by the same string.
      const isTheme = category!.startsWith(THEME_STORY_PREFIX);
      const categories =
        category === 'mix' ? (await getSelectedCategories()).join(',') : category!;
      // Use a warmed feed from the story-button prefetch when available, so the
      // first card shows instantly instead of waiting on a network round-trip.
      const res =
        (await takePrefetchedStory(locale, categories)) ??
        (isTheme
          ? await api.getStoryThemeFacts({
              slug: category!.slice(THEME_STORY_PREFIX.length),
              language: locale,
              limit: STORY_FETCH_LIMIT,
            })
          : await api.getFactsFeed({
              language: locale,
              categories,
              limit: STORY_FETCH_LIMIT,
              order: 'oldest', // earliest-first; stories read the archive from the start
            }));
      const fetched = res.facts.map(mapApiFactToRelations);

      const viewed = await database.getViewedStoryFactIds();
      // The feed arrives newest-first (same as the Latest view), but a story
      // should start at the EARLIEST fact the user hasn't seen yet and move
      // forward chronologically. Order each group oldest-first by created_at
      // (id as a stable tiebreak), with unseen leading.
      const ca = (f: FactWithRelations) => f.created_at ?? '';
      const byOldest = (a: FactWithRelations, b: FactWithRelations) =>
        ca(a) < ca(b) ? -1 : ca(a) > ca(b) ? 1 : a.id - b.id;
      const unseen = fetched.filter((f) => !viewed.has(f.id)).sort(byOldest);
      const seen = fetched.filter((f) => viewed.has(f.id)).sort(byOldest);
      const result: FactWithRelations[] = [...unseen, ...seen];

      setFacts(result);
      // Store facts for event-driven prefetch and reset trigger
      factsRef.current = result;
      prefetchTriggeredRef.current = false;
      // Fallback: prefetch after 2s if first image hasn't loaded yet
      if (prefetchFallbackRef.current) clearTimeout(prefetchFallbackRef.current);
      prefetchFallbackRef.current = setTimeout(() => {
        triggerPrefetch();
      }, 2000);
      trackScreenView(Screens.STORY);
      trackStoryOpen({
        category: category!,
        factCount: result.length,
        isMix: category === 'mix',
        isTheme,
        themeSlug: isTheme ? category!.slice(THEME_STORY_PREFIX.length) : '',
        sourceType: isTheme ? 'theme' : category === 'mix' ? 'mix' : 'category',
      });
    } catch (error) {
      console.error('Failed to load story facts:', error);
    } finally {
      setLoading(false);
    }
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: any; index: number | null }> }) => {
      let landedAdKey: string | null = null;
      for (const entry of viewableItems) {
        if (entry.index != null && !isResizingRef.current) {
          setCurrentIndex(entry.index);
          currentIndexRef.current = entry.index;
        }
        if (isNativeAdPlaceholder(entry.item)) {
          landedAdKey = entry.item.key;
          continue;
        }
        const fact = entry.item as FactWithRelations;
        if (fact && !viewedFactIds.current.has(fact.id)) {
          viewedFactIds.current.add(fact.id);
          database
            .markFactViewedInStory(fact.id)
            .then(() => checkAndAwardBadges())
            .catch(() => {});
          trackStoryFactView({
            factId: fact.id,
            category: category!,
            index: entry.index ?? 0,
          });
        }
      }

      // Landing on a native ad page: only pause scrolling (with the progress
      // ring) when the slot actually has an ad bound — same gate as the trivia
      // game, which only presents its ad page when `nativeAd` is non-null.
      // No-fill slots park in 'loading' forever, so without this check the
      // user gets locked onto a BLANK page with a progress ring. Instead, drop
      // the placeholder: the list closes the gap and the next fact takes the
      // page's place immediately.
      if (landedAdKey !== null && !scrollLocked) {
        if (!hasReadyAd(landedAdKey)) {
          handleAdFailed(landedAdKey);
          return;
        }
        setScrollLocked(true);
        adPauseProgress.setValue(0);
        Animated.timing(adPauseProgress, {
          toValue: 1,
          duration: NATIVE_ADS.NAV_LOCK_DURATION_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        }).start();
        if (adPauseTimer.current) clearTimeout(adPauseTimer.current);
        adPauseTimer.current = setTimeout(() => {
          setScrollLocked(false);
          adPauseTimer.current = null;
        }, NATIVE_ADS.NAV_LOCK_DURATION_MS);
      }
    },
    [category, scrollLocked, adPauseProgress, handleAdFailed]
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 60,
    }),
    []
  );

  // Non-null when hosted by the story/morph route: closing must go through
  // the controller so the reverse morph (screen → story button circle) plays
  // before the pop. Null under the plain fullScreenModal presentation.
  const morph = useStoryMorph();

  const handleClose = useCallback(async () => {
    trackStoryClose({
      category: category!,
      factsViewed: viewedFactIds.current.size,
      totalFacts: facts.length,
    });
    if (morph) {
      morph.close();
    } else {
      router.back();
    }
  }, [router, category, facts.length, morph]);

  const renderItem = useCallback(
    ({ item, index }: { item: StoryListItem; index: number }) => {
      if (isNativeAdPlaceholder(item)) {
        return (
          <StoryNativeAdCard
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            slotKey={item.key}
            onAdFailed={() => handleAdFailed(item.key)}
          />
        );
      }
      return (
        <StoryPage
          key={item.id}
          fact={item}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
          onImageReady={index === 0 ? triggerPrefetch : undefined}
        />
      );
    },
    [screenWidth, screenHeight, triggerPrefetch, handleAdFailed]
  );

  const keyExtractor = useCallback(
    (item: StoryListItem) => (isNativeAdPlaceholder(item) ? item.key : String(item.id)),
    []
  );

  // Split FlashList recycle pools: ad pages and story pages never share a reusable view.
  const getItemType = useCallback(
    (item: StoryListItem) => (isNativeAdPlaceholder(item) ? 'ad' : 'fact'),
    []
  );

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // A failed or empty load must stay dismissable: render the close button and a
  // message instead of trapping the user on an inescapable blank screen.
  if (facts.length === 0) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.xl,
          },
        ]}
      >
        <Text.Body color="$textSecondary" style={{ textAlign: 'center' }}>
          {t('noFactsAvailable')}
        </Text.Body>
        <View
          style={[styles.closeButtonContainer, { top: insets.top + spacing.xl, right: spacing.lg }]}
        >
          <CloseButton testID="story-close-button" onPress={handleClose} />
        </View>
      </View>
    );
  }

  return (
    // IdleScreen runs the story-view idle interstitial: story is a fullScreenModal
    // that pushModalScreen()s, so the global IdleInterstitial can't serve it (its
    // touches bypass the root capture, its overlay renders under the modal, and it
    // self-skips on isModalScreenActive). Only mounted in this branch, so the
    // loading / empty early-returns above never arm an idle ad over a spinner.
    <IdleScreen
      style={[styles.container, { backgroundColor: colors.background }]}
      badgeStyle={{ bottom: insets.bottom + spacing.xl, right: spacing.lg }}
    >
      <FlashList
        ref={listRef}
        data={storyDataWithAds}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        // Native ads load on demand when their card mounts. Mount pages ~3
        // screens ahead (FlashList's default is 250px) so an ad request has
        // time to resolve before the viewability gate (hasReadyAd) decides
        // whether to present it — otherwise the ad page is dropped as not-ready.
        drawDistance={screenHeight * 3}
        snapToInterval={screenHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        scrollEnabled={!scrollLocked}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Close button — floating over the story imagery */}
      <View
        style={[
          styles.closeButtonContainer,
          {
            top: insets.top + spacing.xl,
            right: spacing.lg,
          },
        ]}
      >
        <CloseButton testID="story-close-button" onPress={handleClose} />
      </View>

      {/* Scroll hint — circular progress on ad pause, bouncing chevron otherwise */}
      {currentIndex < storyDataWithAds.length - 1 &&
        (scrollLocked ? (
          <View
            style={[styles.scrollHint, { bottom: insets.bottom + spacing.sm }]}
            pointerEvents="none"
          >
            <CircularProgress progress={adPauseProgress} size={iconSizes.lg} />
          </View>
        ) : (
          <Animated.View
            style={[
              styles.scrollHint,
              {
                bottom: insets.bottom + spacing.sm,
                opacity: hintOpacity,
                transform: [{ translateY: hintTranslateY }],
              },
            ]}
            pointerEvents="none"
          >
            <ChevronsUp size={iconSizes.lg} color="rgba(255,255,255,0.7)" />
          </Animated.View>
        ))}
    </IdleScreen>
  );
}

// Circular progress indicator shown during ad scroll-lock
const CircularProgress = React.memo(
  ({ progress, size }: { progress: Animated.Value; size: number }) => {
    const strokeWidth = 2.5;
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;

    const strokeDashoffset = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [circumference, 0],
    });

    return (
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated fill */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
    );
  }
);
CircularProgress.displayName = 'CircularProgress';

// Individual story page component — full-screen image with text overlay
const StoryPage = React.memo(
  ({
    fact,
    screenWidth,
    screenHeight,
    onImageReady,
  }: {
    fact: FactWithRelations;
    screenWidth: number;
    screenHeight: number;
    onImageReady?: () => void;
  }) => {
    const router = useRouter();
    const { t } = useTranslation();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const { spacing, typography, iconSizes } = useResponsive();
    const colors = hexColors[theme];

    // Resolved image URI: local cache or remote URL
    const imageUri = useResolvedImageUri(fact.id, fact.image_url);

    // Looping Ken Burns: gentle scale + drift in X/Y to reveal more of the image
    const kenBurns = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      kenBurns.setValue(0);
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(kenBurns, { toValue: 1, duration: 8000, useNativeDriver: true }),
          Animated.timing(kenBurns, { toValue: 2, duration: 8000, useNativeDriver: true }),
          Animated.timing(kenBurns, { toValue: 3, duration: 8000, useNativeDriver: true }),
          Animated.timing(kenBurns, { toValue: 4, duration: 8000, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }, [fact.id]);

    // Scale gently pulses between 1 and 1.12
    const imageScale = kenBurns.interpolate({
      inputRange: [0, 1, 2, 3, 4],
      outputRange: [1, 1.08, 1.12, 1.08, 1],
    });
    // Drift left → right → back
    const imageTranslateX = kenBurns.interpolate({
      inputRange: [0, 1, 2, 3, 4],
      outputRange: [0, -screenWidth * 0.035, 0, screenWidth * 0.035, 0],
    });
    // Drift up → down → back
    const imageTranslateY = kenBurns.interpolate({
      inputRange: [0, 1, 2, 3, 4],
      outputRange: [0, -screenHeight * 0.025, 0, screenHeight * 0.025, 0],
    });

    const categorySlug = fact.categoryData?.slug || fact.category || 'unknown';

    const handleReadMore = useCallback(() => {
      // Never let analytics abort navigation — a throw here previously meant the
      // tap did "nothing".
      try {
        trackStoryReadMore({ factId: fact.id, category: categorySlug });
      } catch {
        // ignore analytics failures
      }
      // Use the modal-presented variant: the story is a fullScreenModal, and on
      // iOS a `card` (the default fact/[id]) pushed over it lands BEHIND it.
      router.push(`/fact/modal/${fact.id}?source=story`);
    }, [router, fact.id, categorySlug]);

    return (
      <View style={{ width: screenWidth, height: screenHeight, overflow: 'hidden' }}>
        {/* Full-screen image with slow Ken Burns drift */}
        {imageUri ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [
                  { scale: imageScale },
                  { translateX: imageTranslateX },
                  { translateY: imageTranslateY },
                ],
              },
            ]}
          >
            <Image
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              onLoad={onImageReady}
              recyclingKey={`story-${fact.id}`}
            />
          </Animated.View>
        ) : (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]}
          />
        )}

        {/* Gradient overlay at bottom for text readability */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']}
          locations={[0.3, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Text content overlaid at bottom */}
        <View
          testID="story-content"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + spacing.xxl * 2,
            gap: spacing.sm,
          }}
        >
          {/* Category badge + Favorite button row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View>
              {(fact.categoryData || fact.category) && (
                <CategoryBadge category={fact.categoryData || fact.category!} compact />
              )}
            </View>
            <FavoriteButton
              factId={fact.id}
              imageUrl={fact.image_url}
              categorySlug={categorySlug}
            />
          </View>

          {/* Title */}
          {fact.title && (
            <Pressable
              accessibilityRole="link"
              onPress={handleReadMore}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text.Headline color="#FFFFFF">{fact.title}</Text.Headline>
            </Pressable>
          )}

          {/* Summary */}
          {fact.summary && (
            <Text.Body color="rgba(255,255,255,0.8)" fontFamily={FONT_FAMILIES.regular}>
              {fact.summary}
            </Text.Body>
          )}

          {/* Read More link */}
          <Pressable
            accessibilityRole="link"
            onPress={handleReadMore}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              opacity: pressed ? 0.7 : 1,
              marginTop: spacing.xs,
            })}
          >
            <Text.Body
              color={colors.primary}
              fontFamily={FONT_FAMILIES.semibold}
              fontSize={typography.fontSize.body}
            >
              {t('readMore')}
            </Text.Body>
            <ChevronRight size={iconSizes.sm} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    );
  }
);

StoryPage.displayName = 'StoryPage';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButtonContainer: {
    position: 'absolute',
    zIndex: 9999,
    ...Platform.select({
      android: {
        elevation: 999,
      },
    }),
  },
  scrollHint: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
  },
});
