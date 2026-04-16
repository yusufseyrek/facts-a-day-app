
import { Lock } from '@tamagui/lucide-icons';
import { XStack } from 'tamagui';

import { translateCategory, useTranslation } from '../i18n';
import { getCategoryNeonColor, useTheme } from '../theme';
import { getContrastColor } from '../utils/colors';
import { useResponsive } from '../utils/useResponsive';

import { FONT_FAMILIES, Text } from './Typography';

import type { Category } from '../services/database';

interface CategoryBadgeProps {
  category: string | Category;
  /**
   * Font family to use for the badge text.
   * Use FONT_FAMILIES constants (e.g., FONT_FAMILIES.semibold)
   */
  fontFamily?: string;
  fontSize?: number;
  /** Compact variant with reduced padding, suitable for inline use in cards */
  compact?: boolean;
  /** Show a lock icon next to the category name */
  showLock?: boolean;
}

export function CategoryBadge({ category, fontFamily, fontSize, compact, showLock }: CategoryBadgeProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { spacing, radius } = useResponsive();

  // Determine if category is a Category object or a string
  let displayName: string;
  let categorySlug: string;
  let backgroundColor: string;

  if (typeof category === 'string') {
    displayName = translateCategory(category, t);
    categorySlug = category;
    // Use hardcoded color mapping for string categories
    backgroundColor = getCategoryNeonColor(categorySlug, theme);
  } else {
    displayName = category.name;
    categorySlug = category.slug || category.name.toLowerCase().replace(/\s+/g, '-');
    // Use color_hex from database if available, otherwise fall back to hardcoded mapping
    backgroundColor = category.color_hex || getCategoryNeonColor(categorySlug, theme);
  }

  const contrastColor = getContrastColor(backgroundColor);

  return (
    <XStack
      paddingVertical={compact ? 2 : spacing.xs}
      paddingHorizontal={compact ? spacing.sm : spacing.md}
      borderRadius={radius.full}
      alignSelf="flex-start"
      alignItems="center"
      gap={showLock ? spacing.xs : 0}
      style={{ backgroundColor }}
    >
      {showLock && (
        <Lock
          size={fontSize ? fontSize - 1 : 10}
          color={contrastColor}
        />
      )}
      <Text.Caption
        color={contrastColor}
        fontFamily={fontFamily || FONT_FAMILIES.semibold}
        fontSize={fontSize}
      >
        {displayName}
      </Text.Caption>
    </XStack>
  );
}
