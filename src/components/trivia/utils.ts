import { hexColors } from '../../theme';
import type { TranslationKeys } from '../../i18n/translations';

export interface TriviaModeBadge {
  label: string;
  icon: string;
  color: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFunction = (key: TranslationKeys | any, options?: Record<string, string | number>) => string;

export interface TriviaModeBadgeOptions {
  mode: 'daily' | 'mixed' | 'category' | string;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
  isDark: boolean;
  t: TranslationFunction;
}

/**
 * Get trivia mode badge configuration for displaying in results
 */
export function getTriviaModeBadge(options: TriviaModeBadgeOptions): TriviaModeBadge {
  const { mode, categoryName, categoryIcon, categoryColor, isDark, t } = options;
  const primaryColor = isDark ? hexColors.dark.primary : hexColors.light.primary;

  // Category mode with category data
  if (mode === 'category' && categoryName) {
    return {
      label: categoryName,
      icon: categoryIcon || 'tag',
      color: categoryColor || primaryColor,
    };
  }

  // Daily mode
  if (mode === 'daily') {
    return {
      label: t('dailyTrivia') || 'Daily Trivia',
      icon: 'calendar',
      color: primaryColor,
    };
  }

  // Mixed mode
  if (mode === 'mixed') {
    return {
      label: t('mixedTrivia') || 'Mixed Trivia',
      icon: 'shuffle',
      color: primaryColor,
    };
  }

  // Default fallback
  return {
    label: t('trivia') || 'Trivia',
    icon: 'gamepad-2',
    color: primaryColor,
  };
}

