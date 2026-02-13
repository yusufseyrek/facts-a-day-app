import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Shuffle } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { useTranslation } from '../i18n';
import * as database from '../services/database';
import { getSelectedCategories } from '../services/onboarding';
import { onPreferenceFeedRefresh } from '../services/preferences';
import { hexColors, useTheme } from '../theme';
import { getLucideIcon } from '../utils/iconMapper';
import { useResponsive } from '../utils/useResponsive';

import { Text } from './Typography';

import type { Category } from '../services/database';

interface CategoryItem {
  slug: string;
  name: string;
  icon?: string;
  color_hex?: string;
  isMix?: boolean;
}

export function CategoryStoryButtons() {
  const { t, locale } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { spacing, iconSizes, borderWidths, typography } = useResponsive();
  const colors = hexColors[theme];

  // Responsive circle and icon sizes: 64/28 on phone, 96/42 on tablet
  const circleSize = iconSizes.heroLg;
  const iconSize = iconSizes.lg;

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [unseenStatus, setUnseenStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadCategories();
    return onPreferenceFeedRefresh(() => {
      loadCategories();
    });
  }, []);

  // Refresh unseen status when screen is focused (returning from story)
  useFocusEffect(
    useCallback(() => {
      loadUnseenStatus();
    }, [locale])
  );

  const loadCategories = async () => {
    try {
      const selectedSlugs = await getSelectedCategories();
      const allCategories = await database.getAllCategories();

      // Build a map for quick lookup
      const categoryMap = new Map<string, Category>();
      allCategories.forEach((cat) => categoryMap.set(cat.slug, cat));

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

      // Load unseen status
      const status = await database.getUnseenStoryStatus(selectedSlugs, locale);
      setUnseenStatus(status);

      // Sort categories: unseen (has new facts) first
      items.sort((a, b) => {
        const aUnseen = status[a.slug] ? 0 : 1;
        const bUnseen = status[b.slug] ? 0 : 1;
        return aUnseen - bUnseen;
      });

      // Prepend Mix button
      setCategories([{ slug: 'mix', name: t('mix'), isMix: true }, ...items]);
    } catch {
      // Ignore errors
    }
  };

  const loadUnseenStatus = async () => {
    try {
      const selectedSlugs = await getSelectedCategories();
      const status = await database.getUnseenStoryStatus(selectedSlugs, locale);
      setUnseenStatus(status);

      // Re-sort categories by unseen status
      setCategories((prev) => {
        const mix = prev.find((c) => c.isMix);
        const rest = prev.filter((c) => !c.isMix);
        rest.sort((a, b) => {
          const aUnseen = status[a.slug] ? 0 : 1;
          const bUnseen = status[b.slug] ? 0 : 1;
          return aUnseen - bUnseen;
        });
        return mix ? [mix, ...rest] : rest;
      });
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

  const renderItem = useCallback(
    ({ item }: { item: CategoryItem }) => {
      // Mix button has unseen if ANY category has unseen
      const hasUnseen = item.isMix
        ? Object.values(unseenStatus).some(Boolean)
        : unseenStatus[item.slug] ?? true;

      return (
        <CategoryButton
          item={item}
          hasUnseen={hasUnseen}
          primaryColor={colors.primary}
          textColor={colors.text}
          surfaceColor={colors.surface}
          borderColor={colors.border}
          onPress={() => handlePress(item)}
          circleSize={circleSize}
          iconSize={iconSize}
          borderWidth={borderWidths.medium}
          labelMarginTop={spacing.xs}
          labelFontSize={typography.fontSize.tiny}
        />
      );
    },
    [colors, handlePress, circleSize, iconSize, borderWidths, spacing, typography, unseenStatus]
  );

  const keyExtractor = useCallback((item: CategoryItem) => item.slug, []);

  // Height for horizontal FlashList container: circle + label margin + label line
  const listHeight = circleSize + spacing.xs + typography.fontSize.tiny * 2;

  const itemSeparator = useCallback(
    () => <View style={{ width: spacing.md }} />,
    [spacing.md]
  );

  if (categories.length === 0) return null;

  return (
    <View style={{ height: listHeight, width: '100%' }}>
      <FlashList
        data={categories}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        ItemSeparatorComponent={itemSeparator}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
        }}
      />
    </View>
  );
}

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
    circleSize,
    iconSize,
    borderWidth,
    labelMarginTop,
    labelFontSize,
  }: {
    item: CategoryItem;
    hasUnseen: boolean;
    primaryColor: string;
    textColor: string;
    surfaceColor: string;
    borderColor: string;
    onPress: () => void;
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
    const innerSize = circleSize - 2; // Gap between gradient and inner circle

    return (
      <Pressable
        testID={`story-button-${item.slug}`}
        onPress={onPress}
        style={({ pressed }) => [styles.buttonContainer, { opacity: pressed ? 0.7 : 1, width: outerSize + labelMarginTop }]}
      >
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
              {item.isMix ? (
                <Shuffle size={iconSize} color={iconColor} />
              ) : (
                getLucideIcon(item.icon, iconSize, iconColor)
              )}
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
            {item.isMix ? (
              <Shuffle size={iconSize} color={iconColor} />
            ) : (
              getLucideIcon(item.icon, iconSize, iconColor)
            )}
          </View>
        )}
        <Text.Caption numberOfLines={1} color={textColor} style={{ marginTop: labelMarginTop, textAlign: 'center', fontSize: labelFontSize }}>
          {item.name}
        </Text.Caption>
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
