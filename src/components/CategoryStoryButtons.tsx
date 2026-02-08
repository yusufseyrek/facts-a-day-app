import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FlashList } from '@shopify/flash-list';

import { Shuffle } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';

import { useTranslation } from '../i18n';
import * as database from '../services/database';
import { getSelectedCategories } from '../services/onboarding';
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
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { spacing, iconSizes, borderWidths, typography } = useResponsive();
  const colors = hexColors[theme];

  // Responsive circle and icon sizes: 64/28 on phone, 96/42 on tablet
  const circleSize = iconSizes.heroLg;
  const iconSize = iconSizes.lg;

  const [categories, setCategories] = useState<CategoryItem[]>([]);

  useEffect(() => {
    loadCategories();
  }, []);

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

      // Prepend Mix button
      setCategories([{ slug: 'mix', name: t('mix'), isMix: true }, ...items]);
    } catch {
      // Ignore errors
    }
  };

  const handlePress = useCallback(
    (item: CategoryItem) => {
      if (item.isMix) {
        router.push('/(tabs)/discover');
      } else {
        router.push(`/(tabs)/discover?category=${item.slug}`);
      }
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: CategoryItem }) => (
      <CategoryButton
        item={item}
        primaryColor={colors.primary}
        textColor={colors.text}
        surfaceColor={colors.surface}
        onPress={() => handlePress(item)}
        circleSize={circleSize}
        iconSize={iconSize}
        borderWidth={borderWidths.medium}
        labelMarginTop={spacing.xs}
        labelFontSize={typography.fontSize.tiny}
      />
    ),
    [colors, handlePress, circleSize, iconSize, borderWidths, spacing, typography]
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

// Separate memoized button component for performance
const CategoryButton = React.memo(
  ({
    item,
    primaryColor,
    textColor,
    surfaceColor,
    onPress,
    circleSize,
    iconSize,
    borderWidth,
    labelMarginTop,
    labelFontSize,
  }: {
    item: CategoryItem;
    primaryColor: string;
    textColor: string;
    surfaceColor: string;
    onPress: () => void;
    circleSize: number;
    iconSize: number;
    borderWidth: number;
    labelMarginTop: number;
    labelFontSize: number;
  }) => {
    const ringColor = item.isMix ? primaryColor : item.color_hex || primaryColor;
    const iconColor = item.isMix ? primaryColor : item.color_hex || primaryColor;

    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.buttonContainer, { opacity: pressed ? 0.7 : 1, width: circleSize + labelMarginTop * 2 }]}
      >
        <View
          style={[
            styles.circle,
            {
              width: circleSize,
              height: circleSize,
              borderRadius: circleSize / 2,
              borderWidth,
              borderColor: ringColor,
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
