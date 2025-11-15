import type { TranslationKeys } from './translations';
import type { Category } from '../services/database';

export type TFunction = (key: TranslationKeys) => string;

/**
 * Translates a category slug to the user's language
 * Categories are stored in the backend with both name and slug.
 * This function attempts to extract and translate the category name.
 *
 * @param category - The category (can be a Category object, string slug, or undefined)
 * @param t - The translation function
 * @returns The translated category string
 */
export function translateCategory(category: string | Category | undefined, t: TFunction): string {
  if (!category) return '';

  // If it's a Category object from the database, return its name directly
  if (typeof category === 'object' && 'name' in category) {
    return category.name;
  }

  // Otherwise, it's a string - try to parse as JSON first (legacy format)
  try {
    const parsed = JSON.parse(category);
    const slug = parsed.slug || parsed.name || category;
    return translateCategorySlug(slug, t);
  } catch {
    // If not JSON, treat as slug
    return translateCategorySlug(category, t);
  }
}

/**
 * Internal function to translate a category slug
 */
function translateCategorySlug(slug: string, t: TFunction): string {
  // Normalize the slug
  const normalized = slug.toLowerCase().replace(/-/g, '_');

  // Map common category slugs to translation keys
  // These should match the categories from the backend
  const categoryMap: Record<string, string> = {
    science: 'science',
    technology: 'technology',
    history: 'history',
    nature: 'nature',
    space: 'space',
    animals: 'animals',
    geography: 'geography',
    health: 'health',
    food: 'food',
    sports: 'sports',
    art: 'art',
    music: 'music',
    literature: 'literature',
    mathematics: 'mathematics',
    physics: 'physics',
    chemistry: 'chemistry',
    biology: 'biology',
    psychology: 'psychology',
    // Add more as needed
  };

  // Check if we have a translation for this category
  const translationKey = categoryMap[normalized];

  if (translationKey) {
    // Try to get the translation
    try {
      const translated = t(translationKey as any);
      // If translation exists and is different from the key, return it
      if (translated && translated !== translationKey) {
        return translated;
      }
    } catch {
      // Translation key doesn't exist
    }
  }

  // If no translation found, return a title-cased version of the slug
  return slugToTitleCase(slug);
}

/**
 * Helper function to convert slug to title case
 */
function slugToTitleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
