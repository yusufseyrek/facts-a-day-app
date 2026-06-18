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

import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';

import { useStoryMorphSource } from '../hooks/useStoryMorphSource';
import { useTranslation } from '../i18n';
import * as api from '../services/api';
import { getCachedRowSync, hydrateCachedRow, setCachedRow } from '../services/categoryButtonsCache';
import { onFeedRefresh } from '../services/contentRefresh';
import * as database from '../services/database';
import { getSelectedCategories } from '../services/onboarding';
import { onPreferenceFeedRefresh } from '../services/preferences';
import { storyBasePath } from '../services/storyMorph';
import { prefetchStory } from '../services/storyPrefetch';
import { hexColors, useTheme } from '../theme';
import { blendHexColors } from '../utils/colors';
import { useResponsive } from '../utils/useResponsive';

import { StoryButtonCircle, THEME_GLOW_BLEED } from './storyMorph/StoryButtonCircle';
import { FONT_FAMILIES, Text } from './Typography';

import type { CachedCategoryItem } from '../services/categoryButtonsCache';
import type { Category } from '../services/database';

type CategoryItem = CachedCategoryItem;

/**
 * The slug the story routes (and the morph/prefetch keys) use for a button.
 * Themes are namespaced so they can't collide with a category slug and so the
 * story screen knows to page them from the theme endpoint.
 */
function storySlugFor(item: CategoryItem): string {
  return item.isTheme ? `theme:${item.slug}` : item.slug;
}

export interface CategoryStoryButtonsRef {
  scrollToStart: () => void;
}

export const CategoryStoryButtons = React.forwardRef<CategoryStoryButtonsRef>(
  function CategoryStoryButtons(_props, ref) {
    const { t, locale } = useTranslation();
    const { theme } = useTheme();
    const router = useRouter();
    const { spacing, radius, iconSizes, borderWidths, typography } = useResponsive();
    const colors = hexColors[theme];

    // Responsive circle and icon sizes: 64/28 on phone, 96/42 on tablet
    const circleSize = iconSizes.heroLg;
    const iconSize = iconSizes.lg;

    const flashListRef = useRef<FlashListRef<CategoryItem>>(null);

    // Seed from the in-memory cache so re-mounts (tab switches, focus
    // changes, etc.) within a session render the previous buttons
    // immediately instead of flashing the skeleton.
    const initialCache = getCachedRowSync(locale);
    const [categories, setCategories] = useState<CategoryItem[]>(() => initialCache?.items ?? []);
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
        // Active event themes (admin-managed), fetched in parallel with the
        // metadata below. null = fetch failed → fall back to the cached row's
        // theme buttons so a transient error doesn't drop a running event.
        const themesPromise = api.getStoryThemes(locale).catch(() => null);

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

        const themes = await themesPromise;
        // Only show a theme button when its gating category is among the user's
        // selected categories. A theme with no category (null/undefined) is
        // global and shown to everyone. Applied to both the fresh fetch and the
        // cached fallback so a selection change can't resurrect a hidden theme.
        const isThemeVisible = (cat?: string | null) =>
          cat == null || selectedSlugs.includes(cat);
        const themeItems: CategoryItem[] =
          themes !== null
            ? themes
                .filter((theme) => isThemeVisible(theme.category))
                .map((theme) => ({
                  slug: theme.slug,
                  name: theme.name,
                  color_hex: theme.color_hex ?? undefined,
                  image_url: theme.image_url,
                  category: theme.category,
                  isTheme: true,
                }))
            : (getCachedRowSync(locale)?.items ?? []).filter(
                (it) => it.isTheme && isThemeVisible(it.category),
              );

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
        // lone Mix button — but only the ones still selected, so a stale cache
        // from a previous onboarding run can never resurrect deselected rows.
        const cachedRest = (getCachedRowSync(locale)?.items ?? []).filter(
          (it) => !it.isMix && !it.isTheme && selectedSlugs.includes(it.slug)
        );
        const resolvedItems = items.length > 0 ? items : cachedRest;

        // Load unseen status
        const status = await database.getUnseenStoryStatus(selectedSlugs, locale);

        // Sort categories: unseen (has new facts) first
        resolvedItems.sort((a, b) => {
          const aUnseen = status[a.slug] ? 0 : 1;
          const bUnseen = status[b.slug] ? 0 : 1;
          return aUnseen - bUnseen;
        });

        // Event themes sit right next to Mix, ahead of the category sort.
        const newItems: CategoryItem[] = [mixItem, ...themeItems, ...resolvedItems];

        setUnseenStatus(status);
        setCategories(newItems);
        // Only persist a FRESHLY resolved row (selected ∩ metadata). The
        // cached-fallback path must not re-persist itself: that would keep
        // renewing a stale row's lease after the selection has changed.
        if (items.length > 0) {
          setCachedRow(locale, { items: newItems, unseenStatus: status });
        }

        // Warm the feeds most likely to be tapped (Mix + first couple of
        // buttons, themes included) once the row is on screen, so the first
        // story card is instant. Press-in prefetch (below) covers the rest.
        newItems.slice(0, 3).forEach((it) => prefetchStory(locale, storySlugFor(it), selectedSlugs));
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
        const status = await database.getUnseenStoryStatus(selectedSlugs, locale);

        // Read the row AFTER the awaits so a load that landed mid-flight isn't
        // clobbered with a pre-await snapshot. loadCategories owns building the
        // row; this only refreshes unseen highlighting. Theme buttons don't
        // participate in unseen sorting — they stay pinned right after Mix.
        const prev = categoriesRef.current;
        const themeItems = prev.filter((c) => c.isTheme);
        const rest = prev.filter((c) => !c.isMix && !c.isTheme);

        // Re-sort ONLY a row that matches the current selections. A mismatch
        // means the row is stale (cache from a previous selection, cold/
        // in-flight load) — rebuild it instead of re-sorting (and worse,
        // persisting) the wrong buttons. This also self-heals on every focus.
        const onScreen = new Set(rest.map((c) => c.slug));
        const matchesSelection =
          rest.length === selectedSlugs.length && selectedSlugs.every((slug) => onScreen.has(slug));
        if (!matchesSelection) {
          loadCategories();
          return;
        }

        const mix = prev.find((c) => c.isMix) ?? { slug: 'mix', name: t('mix'), isMix: true };
        rest.sort((a, b) => {
          const aUnseen = status[a.slug] ? 0 : 1;
          const bUnseen = status[b.slug] ? 0 : 1;
          return aUnseen - bUnseen;
        });
        const newItems = [mix, ...themeItems, ...rest];

        setUnseenStatus(status);
        setCategories(newItems);
        setCachedRow(locale, { items: newItems, unseenStatus: status });
      } catch {
        // Ignore errors
      }
    };

    const handlePress = useCallback(
      (item: CategoryItem) => {
        // storyBasePath picks the morph-presented route when the pressed
        // button registered a fresh circle measurement on press-in (the
        // normal case), falling back to the plain fullScreenModal otherwise.
        // Themes ride the same story routes under a namespaced slug — the
        // story screen pages them from /api/story-themes instead of the feed.
        const storySlug = storySlugFor(item);
        router.push(`${storyBasePath(storySlug)}/${storySlug}`);
      },
      [router]
    );

    // Warm a category's story feed before the tap so the first card shows
    // instantly. Fired on press-in (below) and for the first few buttons on load.
    const handlePrefetch = useCallback(
      (item: CategoryItem) => {
        prefetchStory(locale, storySlugFor(item), selectedSlugsRef.current);
      },
      [locale]
    );

    const renderItem = useCallback(
      ({ item }: { item: CategoryItem }) => {
        // Mix button has unseen if ANY category has unseen. Theme buttons are
        // event promos — they always wear the gradient ring.
        const hasUnseen = item.isTheme
          ? true
          : item.isMix
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
            hairline={borderWidths.hairline}
            labelMarginTop={spacing.xs}
            labelGutter={spacing.sm}
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

    // Theme slugs are admin-defined and may collide with a category slug —
    // namespace the key so FlashList never sees a duplicate.
    const keyExtractor = useCallback((item: CategoryItem) => storySlugFor(item), []);

    // Height for horizontal FlashList container: glow headroom + circle +
    // label margin + label line. Reserved on every render (including skeleton)
    // so the row never collapses while data loads — that collapse was the
    // source of the home-feed jump. The headroom keeps the theme buttons'
    // aura inside the list's scroll bounds (a ScrollView clips at its edges,
    // which cut the glow off at the top).
    const rowHeight = THEME_GLOW_BLEED + circleSize + spacing.xs + typography.fontSize.tiny * 2;
    const outerSize = circleSize + (borderWidths.medium + borderWidths.hairline) * 2;

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
              paddingTop: THEME_GLOW_BLEED,
            }}
          />
        ) : (
          <CategoryRowSkeleton
            count={6}
            outerSize={outerSize}
            labelMarginTop={spacing.xs}
            labelHeight={typography.fontSize.tiny * 2}
            labelRadius={radius.sm}
            paddingHorizontal={spacing.lg}
            paddingTop={THEME_GLOW_BLEED}
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
    labelRadius,
    paddingHorizontal,
    paddingTop,
    gap,
    placeholderColor,
  }: {
    count: number;
    outerSize: number;
    labelMarginTop: number;
    labelHeight: number;
    labelRadius: number;
    paddingHorizontal: number;
    paddingTop: number;
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
          paddingTop,
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
                  borderRadius: labelRadius,
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
    hairline,
    labelMarginTop,
    labelGutter,
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
    hairline: number;
    labelMarginTop: number;
    labelGutter: number;
    labelFontSize: number;
  }) => {
    const ringColor = item.isMix ? primaryColor : item.color_hex || primaryColor;
    const iconColor = item.isMix ? primaryColor : item.color_hex || primaryColor;
    const ringWidth = borderWidth + hairline; // Slightly thicker than regular border
    const outerSize = circleSize + ringWidth * 2;
    const innerSize = circleSize - hairline * 2; // Gap between gradient/border and inner circle
    // Category-tinted circle fill (iOS tinted-symbol look) instead of the flat
    // surface color — stronger while unseen, faint once seen. Blended opaque
    // (not alpha) so the gradient ring can't bleed through the unseen fill.
    const unseenFill = blendHexColors(ringColor, surfaceColor, 0.16);
    const seenFill = blendHexColors(ringColor, surfaceColor, 0.07);
    // Spring scale animation
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
      opacity: scale.value < 1 ? 0.85 : 1,
    }));

    // isMorphSourceActive hides the circle while its morph presentation is on
    // screen (the replica covers the exact rect, so no hole shows in the row).
    // Keyed by the story slug (themes namespaced) — the same string the press
    // pushes as the route param, so registration and route peek always agree.
    const storySlug = storySlugFor(item);
    const { registerMorphSource, isMorphSourceActive } = useStoryMorphSource(storySlug);
    const pressableRef = useRef<View>(null);

    const handlePressIn = useCallback(() => {
      scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
      // Warm this category's feed the instant the finger lands, before the
      // navigation completes — a usable head start even on a cache miss.
      onPrefetch();
      // Register the circle as the morph source on press-IN: measureInWindow
      // is async, so starting here guarantees the rect is registered by the
      // time onPress pushes the route via storyBasePath(). The Pressable is
      // measured (the spring scale lives on a child, so its rect is stable)
      // and the centered circle's rect is derived from it. A press-in that
      // turns into a scroll leaves a harmless entry (slug + TTL guarded).
      pressableRef.current?.measureInWindow((x, y, width, height) => {
        if (!(width > 0 && height > 0)) return;
        registerMorphSource({
          categorySlug: storySlug,
          x: x + (width - outerSize) / 2,
          y,
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          hasUnseen,
          isMix: !!item.isMix,
          icon: item.icon,
          imageUrl: item.isTheme ? item.image_url : undefined,
          ringColor,
          iconColor,
          unseenFill,
          seenFill,
          borderColor,
          outerSize,
          innerSize,
          iconSize,
        });
      });
    }, [
      onPrefetch,
      registerMorphSource,
      storySlug,
      item.isMix,
      item.isTheme,
      item.icon,
      item.image_url,
      hasUnseen,
      ringColor,
      iconColor,
      unseenFill,
      seenFill,
      borderColor,
      outerSize,
      innerSize,
      iconSize,
    ]);
    const handlePressOut = useCallback(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
    }, []);

    return (
      <Pressable
        ref={pressableRef}
        testID={`story-button-${storySlug}`}
        accessibilityRole="button"
        aria-label={item.name}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.buttonContainer, { width: outerSize + labelGutter }]}
      >
        <Animated.View style={animatedStyle}>
          <View style={isMorphSourceActive ? styles.morphSourceHidden : undefined}>
            <StoryButtonCircle
              hasUnseen={hasUnseen}
              isMix={!!item.isMix}
              icon={item.icon}
              imageUrl={item.isTheme ? item.image_url : undefined}
              ringColor={ringColor}
              iconColor={iconColor}
              unseenFill={unseenFill}
              seenFill={seenFill}
              borderColor={borderColor}
              outerSize={outerSize}
              innerSize={innerSize}
              iconSize={iconSize}
            />
          </View>
        </Animated.View>
        <Text.Tiny
          numberOfLines={1}
          color={textColor}
          adjustsFontSizeToFit
          fontFamily={hasUnseen ? FONT_FAMILIES.semibold : FONT_FAMILIES.medium}
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
  morphSourceHidden: {
    opacity: 0,
  },
});
