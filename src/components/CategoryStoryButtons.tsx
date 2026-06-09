import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Shuffle } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';

import { useTranslation } from '../i18n';
import * as api from '../services/api';
import { onFeedRefresh } from '../services/contentRefresh';
import * as database from '../services/database';
import { getSelectedCategories } from '../services/onboarding';
import { onPreferenceFeedRefresh } from '../services/preferences';
import { prefetchStory } from '../services/storyPrefetch';
import { hexColors, useTheme } from '../theme';
import { getLucideIcon } from '../utils/iconMapper';
import { useResponsive } from '../utils/useResponsive';

import { FONT_FAMILIES, Text } from './Typography';

import type { Category } from '../services/database';

interface CategoryItem {
  slug: string;
  name: string;
  icon?: string;
  color_hex?: string;
  isMix?: boolean;
}

export interface CategoryStoryButtonsRef {
  scrollToStart: () => void;
}

// Module-level cache so the row renders the previous session's buttons
// immediately on remount instead of flashing a skeleton while the async
// load (AsyncStorage → SQLite → SQLite) runs. Keyed by locale because the
// `name` field is localized.
type CachedRow = { items: CategoryItem[]; unseenStatus: Record<string, boolean> };
const CACHE_KEY_PREFIX = '@category_buttons_cache_v1_';
const memCache = new Map<string, CachedRow>();
const hydrationByLocale = new Map<string, Promise<CachedRow | null>>();

function getCachedRowSync(locale: string): CachedRow | null {
  return memCache.get(locale) ?? null;
}

function setCachedRow(locale: string, data: CachedRow): void {
  // Never cache a degraded row (empty, or only the Mix button). Persisting one
  // would make the buttons "disappear" on the next cold start until the live
  // load ran. Only real category buttons are worth caching.
  const hasRealCategories = data.items.some((it) => !it.isMix);
  if (!hasRealCategories) return;
  memCache.set(locale, data);
  AsyncStorage.setItem(CACHE_KEY_PREFIX + locale, JSON.stringify(data)).catch(() => {});
}

function hydrateCachedRow(locale: string): Promise<CachedRow | null> {
  const existing = hydrationByLocale.get(locale);
  if (existing) return existing;
  const promise = (async () => {
    const fromMem = memCache.get(locale);
    if (fromMem) return fromMem;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY_PREFIX + locale);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedRow;
      memCache.set(locale, parsed);
      return parsed;
    } catch {
      return null;
    }
  })();
  hydrationByLocale.set(locale, promise);
  return promise;
}

export const CategoryStoryButtons = React.forwardRef<CategoryStoryButtonsRef>(
  function CategoryStoryButtons(_props, ref) {
    const { t, locale } = useTranslation();
    const { theme } = useTheme();
    const router = useRouter();
    const { spacing, iconSizes, borderWidths, typography } = useResponsive();
    const colors = hexColors[theme];

    // Responsive circle and icon sizes: 64/28 on phone, 96/42 on tablet
    const circleSize = iconSizes.heroLg;
    const iconSize = iconSizes.lg;

    const flashListRef = useRef<FlashListRef<CategoryItem>>(null);

    // Seed from the in-memory cache so re-mounts (tab switches, focus
    // changes, etc.) within a session render the previous buttons
    // immediately instead of flashing the skeleton.
    const initialCache = getCachedRowSync(locale);
    const [categories, setCategories] = useState<CategoryItem[]>(
      () => initialCache?.items ?? []
    );
    const [unseenStatus, setUnseenStatus] = useState<Record<string, boolean>>(
      () => initialCache?.unseenStatus ?? {}
    );
    // `loaded` gates skeleton vs real row. Treat a cache hit (mem or disk)
    // as loaded so we never show the skeleton when we have buttons to show.
    const [loaded, setLoaded] = useState<boolean>(() => initialCache !== null);

    // Tracks the latest categories synchronously so loadUnseenStatus can
    // recompute the sorted row without relying on a setState updater (which
    // would force the cache-persist side effect into the updater body).
    const categoriesRef = useRef(categories);
    categoriesRef.current = categories;
    // User's selected category slugs — needed to expand the 'mix' button into a
    // concrete categories param when prefetching. Populated by loadCategories.
    const selectedSlugsRef = useRef<string[]>([]);

    useImperativeHandle(ref, () => ({
      scrollToStart: () => {
        flashListRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    }));

    useEffect(() => {
      let cancelled = false;

      // First-mount-per-locale cold path: try the AsyncStorage cache while
      // the live load runs in parallel. Whichever finishes first paints the
      // row; the live load always wins the final state.
      if (!getCachedRowSync(locale)) {
        hydrateCachedRow(locale).then((disk) => {
          if (cancelled || !disk) return;
          if (getCachedRowSync(locale) !== disk) return; // a live load already wrote a newer entry
          // Ignore a poisoned/degraded cached row (empty, or Mix-only). Better
          // to keep the skeleton until the live load resolves real buttons than
          // to flash a lone Mix button from a bad earlier cache entry.
          const hasRealCategories = disk.items.some((it) => !it.isMix);
          if (!hasRealCategories) return;
          setCategories(disk.items);
          setUnseenStatus(disk.unseenStatus);
          setLoaded(true);
        });
      }

      loadCategories();
      const unsubPreference = onPreferenceFeedRefresh(() => {
        loadCategories();
      });
      const unsubFeed = onFeedRefresh(() => {
        loadCategories();
      });
      return () => {
        cancelled = true;
        unsubPreference();
        unsubFeed();
      };
    }, []);

    // Refresh unseen status when screen is focused (returning from story)
    useFocusEffect(
      useCallback(() => {
        loadUnseenStatus();
      }, [locale])
    );

    const loadCategories = async () => {
      // The Mix button is always present — it doesn't depend on metadata, so
      // the row never fully disappears even if the metadata fetch fails.
      const mixItem: CategoryItem = { slug: 'mix', name: t('mix'), isMix: true };
      try {
        const selectedSlugs = await getSelectedCategories();
        selectedSlugsRef.current = selectedSlugs;

        // Fetch metadata, but tolerate failure (App Check not ready, transient
        // error, empty response). On failure we still render Mix + whatever
        // category buttons we can resolve from the cached row.
        let allCategories: Category[] = [];
        try {
          const metadata = await api.getMetadata(locale);
          allCategories = (metadata.categories ?? []) as Category[];
        } catch {
          allCategories = [];
        }

        // Build a map for quick lookup
        const categoryMap = new Map<string, Category>();
        allCategories.forEach((cat) => categoryMap.set(cat.slug, cat as Category));

        // Build items from user's selected categories
        const items: CategoryItem[] = [];
        for (const slug of selectedSlugs) {
          const cat = categoryMap.get(slug);
          if (cat) {
            items.push({
              slug: cat.slug,
              name: cat.name,
              icon: cat.icon,
              color_hex: cat.color_hex,
            });
          }
        }

        // If metadata failed/empty but we had previously cached category
        // buttons, keep showing those alongside Mix instead of dropping to a
        // lone Mix button. Only the freshly-resolved set replaces them.
        const cachedRest = (getCachedRowSync(locale)?.items ?? []).filter((it) => !it.isMix);
        const resolvedItems = items.length > 0 ? items : cachedRest;

        // Load unseen status
        const status = await database.getUnseenStoryStatus(selectedSlugs, locale);

        // Sort categories: unseen (has new facts) first
        resolvedItems.sort((a, b) => {
          const aUnseen = status[a.slug] ? 0 : 1;
          const bUnseen = status[b.slug] ? 0 : 1;
          return aUnseen - bUnseen;
        });

        const newItems: CategoryItem[] = [mixItem, ...resolvedItems];

        setUnseenStatus(status);
        setCategories(newItems);
        // Only persist a row that actually resolved real category buttons, so
        // we never cache a degraded (Mix-only) row over a good one.
        if (resolvedItems.length > 0) {
          setCachedRow(locale, { items: newItems, unseenStatus: status });
        }

        // Warm the feeds most likely to be tapped (Mix + first couple of
        // categories) once the row is on screen, so the first story card is
        // instant. Press-in prefetch (below) covers the rest.
        newItems.slice(0, 3).forEach((it) => prefetchStory(locale, it.slug, selectedSlugs));
      } catch {
        // Last-resort: at least show the Mix button so the row is never empty.
        setCategories((prev) => (prev.length > 0 ? prev : [mixItem]));
      } finally {
        setLoaded(true);
      }
    };

    const loadUnseenStatus = async () => {
      try {
        const selectedSlugs = await getSelectedCategories();

        // Re-sort ONLY an already-populated row. If the row hasn't loaded its
        // category buttons yet (cold/in-flight), do nothing here — otherwise we
        // would overwrite (and worse, persist) an empty row, which is exactly
        // what made the buttons vanish on refresh/focus. loadCategories owns
        // building the row; this only refreshes unseen highlighting.
        const prev = categoriesRef.current;
        const rest = prev.filter((c) => !c.isMix);
        if (rest.length === 0) {
          // Nothing to re-sort yet; trigger a real (re)load instead of wiping.
          loadCategories();
          return;
        }

        const status = await database.getUnseenStoryStatus(selectedSlugs, locale);
        const mix = prev.find((c) => c.isMix) ?? { slug: 'mix', name: t('mix'), isMix: true };
        rest.sort((a, b) => {
          const aUnseen = status[a.slug] ? 0 : 1;
          const bUnseen = status[b.slug] ? 0 : 1;
          return aUnseen - bUnseen;
        });
        const newItems = [mix, ...rest];

        setUnseenStatus(status);
        setCategories(newItems);
        setCachedRow(locale, { items: newItems, unseenStatus: status });
      } catch {
        // Ignore errors
      }
    };

    const handlePress = useCallback(
      (item: CategoryItem) => {
        router.push(`/story/${item.slug}`);
      },
      [router]
    );

    // Warm a category's story feed before the tap so the first card shows
    // instantly. Fired on press-in (below) and for the first few buttons on load.
    const handlePrefetch = useCallback(
      (item: CategoryItem) => {
        prefetchStory(locale, item.slug, selectedSlugsRef.current);
      },
      [locale]
    );

    const renderItem = useCallback(
      ({ item }: { item: CategoryItem }) => {
        // Mix button has unseen if ANY category has unseen
        const hasUnseen = item.isMix
          ? Object.values(unseenStatus).some(Boolean)
          : (unseenStatus[item.slug] ?? true);

        return (
          <CategoryButton
            item={item}
            hasUnseen={hasUnseen}
            primaryColor={colors.primary}
            textColor={colors.text}
            surfaceColor={colors.surface}
            borderColor={colors.border}
            onPress={() => handlePress(item)}
            onPrefetch={() => handlePrefetch(item)}
            circleSize={circleSize}
            iconSize={iconSize}
            borderWidth={borderWidths.medium}
            labelMarginTop={spacing.xs}
            labelFontSize={typography.fontSize.tiny}
          />
        );
      },
      [
        colors,
        handlePress,
        handlePrefetch,
        circleSize,
        iconSize,
        borderWidths,
        spacing,
        typography,
        unseenStatus,
      ]
    );

    const keyExtractor = useCallback((item: CategoryItem) => item.slug, []);

    // Height for horizontal FlashList container: circle + label margin + label line.
    // Reserved on every render (including skeleton) so the row never collapses
    // while data loads — that collapse was the source of the home-feed jump.
    const rowHeight = circleSize + spacing.xs + typography.fontSize.tiny * 2;
    const outerSize = circleSize + (borderWidths.medium + 1) * 2;

    const itemSeparator = useCallback(() => <View style={{ width: spacing.md }} />, [spacing.md]);

    // After load completes with zero categories (user deselected everything,
    // or both DB queries failed), collapse the row — same as the original behavior.
    if (loaded && categories.length === 0) return null;

    return (
      <View style={{ width: '100%', height: rowHeight }}>
        {loaded ? (
          <FlashList
            ref={flashListRef}
            data={categories}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            horizontal
            showsHorizontalScrollIndicator={false}
            overScrollMode="never"
            ItemSeparatorComponent={itemSeparator}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
            }}
          />
        ) : (
          <CategoryRowSkeleton
            count={6}
            outerSize={outerSize}
            labelMarginTop={spacing.xs}
            labelHeight={typography.fontSize.tiny * 2}
            paddingHorizontal={spacing.lg}
            gap={spacing.md}
            placeholderColor={colors.surface}
          />
        )}
      </View>
    );
  }
);

/**
 * Placeholder row shown during the initial async load of selected categories.
 * Renders at the same height as the real row so the carousels below don't
 * shift down once the real data arrives.
 */
const CategoryRowSkeleton = React.memo(
  ({
    count,
    outerSize,
    labelMarginTop,
    labelHeight,
    paddingHorizontal,
    gap,
    placeholderColor,
  }: {
    count: number;
    outerSize: number;
    labelMarginTop: number;
    labelHeight: number;
    paddingHorizontal: number;
    gap: number;
    placeholderColor: string;
  }) => {
    // Single shared pulse value — every placeholder reads from it, so we run
    // exactly one animation regardless of count.
    const pulse = useSharedValue(0.5);
    useEffect(() => {
      pulse.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }, [pulse]);
    const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

    return (
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal,
          alignItems: 'flex-start',
        }}
      >
        {Array.from({ length: count }).map((_, i) => (
          <View
            key={i}
            style={{
              alignItems: 'center',
              marginRight: i < count - 1 ? gap : 0,
            }}
          >
            <Animated.View
              style={[
                {
                  width: outerSize,
                  height: outerSize,
                  borderRadius: outerSize / 2,
                  backgroundColor: placeholderColor,
                },
                animatedStyle,
              ]}
            />
            <Animated.View
              style={[
                {
                  marginTop: labelMarginTop,
                  width: outerSize * 0.7,
                  height: labelHeight * 0.4,
                  borderRadius: 4,
                  backgroundColor: placeholderColor,
                },
                animatedStyle,
              ]}
            />
          </View>
        ))}
      </View>
    );
  }
);

CategoryRowSkeleton.displayName = 'CategoryRowSkeleton';

/**
 * Lighten a hex color by a given amount (0–1)
 */
function lightenColor(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const newR = Math.min(255, Math.round(r + (255 - r) * amount));
  const newG = Math.min(255, Math.round(g + (255 - g) * amount));
  const newB = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Separate memoized button component for performance
const CategoryButton = React.memo(
  ({
    item,
    hasUnseen,
    primaryColor,
    textColor,
    surfaceColor,
    borderColor,
    onPress,
    onPrefetch,
    circleSize,
    iconSize,
    borderWidth,
    labelMarginTop,
    labelFontSize: _labelFontSize,
  }: {
    item: CategoryItem;
    hasUnseen: boolean;
    primaryColor: string;
    textColor: string;
    surfaceColor: string;
    borderColor: string;
    onPress: () => void;
    onPrefetch: () => void;
    circleSize: number;
    iconSize: number;
    borderWidth: number;
    labelMarginTop: number;
    labelFontSize: number;
  }) => {
    const ringColor = item.isMix ? primaryColor : item.color_hex || primaryColor;
    const iconColor = item.isMix ? primaryColor : item.color_hex || primaryColor;
    const ringWidth = borderWidth + 1; // Slightly thicker than regular border
    const outerSize = circleSize + ringWidth * 2;
    const innerSize = circleSize - 2; // Gap between gradient/border and inner circle
    // Spring scale animation
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
      opacity: scale.value < 1 ? 0.85 : 1,
    }));
    const handlePressIn = useCallback(() => {
      scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
      // Warm this category's feed the instant the finger lands, before the
      // navigation completes — a usable head start even on a cache miss.
      onPrefetch();
    }, [onPrefetch]);
    const handlePressOut = useCallback(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
    }, []);

    const icon = item.isMix ? (
      <Shuffle size={iconSize} color={iconColor} />
    ) : (
      getLucideIcon(item.icon, iconSize, iconColor)
    );

    return (
      <Pressable
        testID={`story-button-${item.slug}`}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.buttonContainer, { width: outerSize + labelMarginTop }]}
      >
        <Animated.View style={animatedStyle}>
          <View>
            {hasUnseen ? (
              // Gradient ring for unseen facts
              <LinearGradient
                colors={[ringColor, lightenColor(ringColor, 0.4)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.circle,
                  {
                    width: outerSize,
                    height: outerSize,
                    borderRadius: outerSize / 2,
                  },
                ]}
              >
                <View
                  style={[
                    styles.circle,
                    {
                      width: innerSize,
                      height: innerSize,
                      borderRadius: innerSize / 2,
                      backgroundColor: surfaceColor,
                    },
                  ]}
                >
                  {icon}
                </View>
              </LinearGradient>
            ) : (
              // Muted border for all-viewed categories
              <View
                style={[
                  styles.circle,
                  {
                    width: outerSize,
                    height: outerSize,
                    borderRadius: outerSize / 2,
                    borderWidth: ringWidth,
                    borderColor,
                    backgroundColor: surfaceColor,
                  },
                ]}
              >
                {icon}
              </View>
            )}
          </View>
        </Animated.View>
        <Text.Tiny
          numberOfLines={1}
          color={textColor}
          adjustsFontSizeToFit
          fontFamily={FONT_FAMILIES.medium}
          style={{
            marginTop: labelMarginTop,
            textAlign: 'center',
            textAlignVertical: 'center',
          }}
        >
          {item.name}
        </Text.Tiny>
      </Pressable>
    );
  }
);

CategoryButton.displayName = 'CategoryButton';

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'center',
  },
  circle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
