import { hexColors } from '../../theme';

import type { TranslationKeys } from '../../i18n/translations';

export interface TriviaModeBadge {
  label: string;
  icon: string;
  color: string;
}

type TranslationFunction = (
  key: TranslationKeys | any,
  options?: Record<string, string | number>
) => string;

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

  // Format-only lenses over the mixed pool (same hue map as the hub cards).
  if (mode === 'true_false') {
    return {
      label: t('trueFalseTrivia') || 'True or False',
      icon: 'check-circle',
      color: isDark ? hexColors.dark.neonGreen : hexColors.light.neonGreen,
    };
  }

  if (mode === 'multiple_choice') {
    return {
      label: t('multipleChoiceTrivia') || 'Multiple Choice',
      icon: 'grid',
      color: isDark ? hexColors.dark.neonOrange : hexColors.light.neonOrange,
    };
  }

  // Quick mode (legacy: home screen quiz teaser, removed feature).
  // Kept so historical session-history entries with trivia_mode='quick' still render.
  if (mode === 'quick') {
    return {
      label: 'Quick Quiz',
      icon: 'zap',
      color: isDark ? hexColors.dark.accent : hexColors.light.accent,
    };
  }

  // Default fallback
  return {
    label: t('trivia') || 'Trivia',
    icon: 'gamepad-2',
    color: primaryColor,
  };
}
