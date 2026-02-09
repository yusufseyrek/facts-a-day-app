import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FlashList } from '@shopify/flash-list';
import { ChevronRight, ChevronUp, X } from '@tamagui/lucide-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { StoryNativeAdCard } from '../../src/components/ads/StoryNativeAdCard';
import { CategoryBadge } from '../../src/components/CategoryBadge';
import { FONT_FAMILIES, Text } from '../../src/components/Typography';
import { NATIVE_ADS } from '../../src/config/app';
import { usePremium } from '../../src/contexts';
import { useTranslation } from '../../src/i18n';
import {
  Screens,
  trackScreenView,
  trackStoryClose,
  trackStoryFactView,
  trackStoryOpen,
  trackStoryReadMore,
} from '../../src/services/analytics';
import * as database from '../../src/services/database';
import { prefetchFactImagesWithLimit } from '../../src/services/images';
import { getSelectedCategories } from '../../src/services/onboarding';
import { hexColors, useTheme } from '../../src/theme';
import { insertNativeAds, isNativeAdPlaceholder, NativeAdPlaceholder } from '../../src/utils/insertNativeAds';
import { useFactImage } from '../../src/utils/useFactImage';
import { useResponsive } from '../../src/utils/useResponsive';

import type { FactWithRelations } from '../../src/services/database';

type StoryListItem = FactWithRelations | NativeAdPlaceholder;

export default function StoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const { locale } = useTranslation();
  const { theme } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { spacing, iconSizes, radius } = useResponsive();
  const colors = hexColors[theme];

  const { isPremium } = usePremium();

  const [facts, setFacts] = useState<FactWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const viewedFactIds = useRef(new Set<number>());

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
      insertNativeAds(facts, NATIVE_ADS.FIRST_AD_INDEX.STORY, undefined, NATIVE_ADS.INTERVAL * 2).filter(
        (item) => !isNativeAdPlaceholder(item) || !failedAdKeys.has(item.key)
      ),
    [facts, isPremium, failedAdKeys]
  );

  // Bouncing animation for scroll hint
  const hintBounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(hintBounce, { toValue: -8, duration: 600, useNativeDriver: true }),
        Animated.timing(hintBounce, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  useEffect(() => {
    loadFacts();
  }, [category, locale]);

  const loadFacts = async () => {
    try {
      setLoading(true);
      let result: FactWithRelations[];

      if (category === 'mix') {
        const slugs = await getSelectedCategories();
        result = await database.getFactsForMixedStory(slugs, locale);
      } else {
        result = await database.getFactsForStory(category!, locale);
      }

      setFacts(result);
      prefetchFactImagesWithLimit(result, 4);
      trackScreenView(Screens.STORY);
      trackStoryOpen({
        category: category!,
        factCount: result.length,
        isMix: category === 'mix',
      });
    } catch (error) {
      console.error('Failed to load story facts:', error);
    } finally {
      setLoading(false);
    }
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: any; index: number | null }> }) => {
      for (const entry of viewableItems) {
        if (entry.index != null) {
          setCurrentIndex(entry.index);
        }
        if (isNativeAdPlaceholder(entry.item)) continue;
        const fact = entry.item as FactWithRelations;
        if (fact && !viewedFactIds.current.has(fact.id)) {
          viewedFactIds.current.add(fact.id);
          database.markFactViewedInStory(fact.id).catch(() => {});
          trackStoryFactView({
            factId: fact.id,
            category: category!,
            index: entry.index ?? 0,
          });
        }
      }
    },
    [category]
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 60,
    }),
    []
  );

  const handleClose = useCallback(() => {
    trackStoryClose({
      category: category!,
      factsViewed: viewedFactIds.current.size,
      totalFacts: facts.length,
    });
    router.back();
  }, [router, category, facts.length]);

  const renderItem = useCallback(
    ({ item }: { item: StoryListItem }) => {
      if (isNativeAdPlaceholder(item)) {
        return (
          <StoryNativeAdCard
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            onAdFailed={() => handleAdFailed(item.key)}
          />
        );
      }
      return <StoryPage fact={item} screenWidth={screenWidth} screenHeight={screenHeight} />;
    },
    [screenWidth, screenHeight]
  );

  const keyExtractor = useCallback(
    (item: StoryListItem) => (isNativeAdPlaceholder(item) ? item.key : String(item.id)),
    []
  );

  if (loading || facts.length === 0) {
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlashList
        data={storyDataWithAds}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        snapToInterval={screenHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Close button */}
      <View
        style={[
          styles.closeButtonContainer,
          {
            top: insets.top + spacing.sm,
            right: spacing.lg,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[
            styles.closeButton,
            {
              width: iconSizes.xl,
              height: iconSizes.xl,
              borderRadius: radius.full,
            },
          ]}
        >
          <X size={iconSizes.md} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Scroll hint — hidden on last story */}
      {currentIndex < storyDataWithAds.length - 1 && (
        <Animated.View
          style={[
            styles.scrollHint,
            {
              bottom: spacing.sm,
              transform: [{ translateY: hintBounce }],
            },
          ]}
          pointerEvents="none"
        >
          <ChevronUp size={iconSizes.lg} color="rgba(255,255,255,0.7)" />
        </Animated.View>
      )}
    </View>
  );
}

// Individual story page component — full-screen image with text overlay
const StoryPage = React.memo(
  ({
    fact,
    screenWidth,
    screenHeight,
  }: {
    fact: FactWithRelations;
    screenWidth: number;
    screenHeight: number;
  }) => {
    const router = useRouter();
    const { t } = useTranslation();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const { spacing, typography, iconSizes } = useResponsive();
    const colors = hexColors[theme];

    const { imageUri } = useFactImage(fact.image_url, fact.id);

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

    // Scale gently pulses between 1 and 1.08
    const imageScale = kenBurns.interpolate({
      inputRange: [0, 1, 2, 3, 4],
      outputRange: [1, 1.06, 1.08, 1.06, 1],
    });
    // Drift left → right → back
    const imageTranslateX = kenBurns.interpolate({
      inputRange: [0, 1, 2, 3, 4],
      outputRange: [0, -screenWidth * 0.02, 0, screenWidth * 0.02, 0],
    });
    // Drift up → down → back
    const imageTranslateY = kenBurns.interpolate({
      inputRange: [0, 1, 2, 3, 4],
      outputRange: [0, -screenHeight * 0.015, 0, screenHeight * 0.015, 0],
    });

    const categorySlug = fact.categoryData?.slug || fact.category || 'unknown';

    const handleReadMore = useCallback(() => {
      trackStoryReadMore({ factId: fact.id, category: categorySlug });
      router.push(`/fact/${fact.id}?source=story`);
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
            />
          </Animated.View>
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme === 'dark' ? '#1a1a2e' : '#e8e8f0' },
            ]}
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
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.sm,
          }}
        >
          {/* Category badge */}
          {(fact.categoryData || fact.category) && (
            <CategoryBadge category={fact.categoryData || fact.category!} compact />
          )}

          {/* Title */}
          {fact.title && (
            <Text.Headline numberOfLines={3} color="#FFFFFF">
              {fact.title}
            </Text.Headline>
          )}

          {/* Summary */}
          {fact.summary && (
            <Text.Body color="rgba(255,255,255,0.8)" fontFamily={FONT_FAMILIES.regular}>
              {fact.summary}
            </Text.Body>
          )}

          {/* Read More link */}
          <Pressable
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
  closeButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollHint: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
  },
});
