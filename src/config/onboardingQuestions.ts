import { MINIMUM_CATEGORIES } from './app';

import type { TranslationKeys } from '../i18n';
import type { Category } from '../services/database';

export interface QuizOption {
  /** Stable identifier used for analytics */
  key: string;
  /** i18n key for the option label */
  labelKey: TranslationKeys;
  emoji: string;
  /** Category slug -> score contribution when this option is chosen */
  weights: Record<string, number>;
}

export interface QuizQuestion {
  /** Stable identifier used for analytics */
  key: string;
  /** i18n key for the question text */
  labelKey: TranslationKeys;
  options: QuizOption[];
}

/**
 * The onboarding preference quiz: 3 single-select questions whose answers are
 * scored into category preferences (replaces the old pick-your-categories
 * grid; the full editor remains available in Settings > Categories).
 *
 * Weights reference backend category slugs. Premium slugs may appear here:
 * deriveCategories drops them for non-premium users. Across all options the
 * free categories are fully covered, so every answer combination yields a
 * varied feed.
 */
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    key: 'scroll_stopper',
    labelKey: 'quizQuestionScroll',
    options: [
      {
        key: 'universe',
        labelKey: 'quizScrollUniverse',
        emoji: '🔭',
        weights: { space: 2, science: 2, mathematics: 1 },
      },
      {
        key: 'past',
        labelKey: 'quizScrollPast',
        emoji: '🏺',
        weights: { history: 2, culture: 2, mythology: 1 },
      },
      {
        key: 'mind',
        labelKey: 'quizScrollMind',
        emoji: '🧠',
        weights: { psychology: 2, philosophy: 2, relationships: 1 },
      },
      {
        key: 'nature',
        labelKey: 'quizScrollNature',
        emoji: '🌿',
        weights: { nature: 2, environment: 2, animals: 1 },
      },
    ],
  },
  {
    key: 'documentary',
    labelKey: 'quizQuestionDocumentary',
    options: [
      {
        key: 'technology',
        labelKey: 'quizDocTech',
        emoji: '🤖',
        weights: { technology: 2, science: 1, inventions: 1, business: 1 },
      },
      {
        key: 'civilizations',
        labelKey: 'quizDocCivilizations',
        emoji: '🗿',
        weights: { history: 2, geography: 1, culture: 1, mythology: 1 },
      },
      {
        key: 'body',
        labelKey: 'quizDocBody',
        emoji: '🧬',
        weights: { health: 2, science: 1, anatomy: 1, psychology: 1 },
      },
      {
        key: 'art',
        labelKey: 'quizDocArt',
        emoji: '🎨',
        weights: { arts: 2, culture: 1, cinema: 1, language: 1 },
      },
    ],
  },
  {
    key: 'free_afternoon',
    labelKey: 'quizQuestionFreeTime',
    options: [
      {
        key: 'cook',
        labelKey: 'quizFreeCook',
        emoji: '🍳',
        weights: { food: 2, health: 1, culture: 1 },
      },
      {
        key: 'game',
        labelKey: 'quizFreeGame',
        emoji: '🏆',
        weights: { sports: 2, health: 1 },
      },
      {
        key: 'trip',
        labelKey: 'quizFreeTrip',
        emoji: '🗺️',
        weights: { geography: 2, language: 1, culture: 1, nature: 1 },
      },
      {
        key: 'invest',
        labelKey: 'quizFreeInvest',
        emoji: '📈',
        weights: { business: 2, finance: 1, mathematics: 1, technology: 1 },
      },
    ],
  },
];

/** Cap on derived preferences so the feed stays focused. */
const MAX_DERIVED_CATEGORIES = 6;

/** Broad, free categories used to top up if derivation comes in short. */
const FALLBACK_CATEGORIES = ['science', 'history', 'nature', 'technology', 'culture'];

/**
 * Score the chosen options into a ranked list of category slugs.
 *
 * Only slugs that exist in `available` survive, premium ones only for premium
 * users. Sorting is stable, so ties keep question order. The result always
 * has at least MINIMUM_CATEGORIES entries (topped up from FALLBACK_CATEGORIES)
 * as long as the backend offers that many free categories.
 */
export function deriveCategories(
  answerIndexes: (number | null)[],
  available: Pick<Category, 'slug' | 'is_premium'>[],
  isPremium: boolean
): string[] {
  const premiumBySlug = new Map(available.map((c) => [c.slug, !!c.is_premium]));
  const selectable = (slug: string) =>
    premiumBySlug.has(slug) && (isPremium || !premiumBySlug.get(slug));

  const scores = new Map<string, number>();
  QUIZ_QUESTIONS.forEach((question, questionIndex) => {
    const answerIndex = answerIndexes[questionIndex];
    const option = answerIndex != null ? question.options[answerIndex] : undefined;
    if (!option) return;
    for (const [slug, weight] of Object.entries(option.weights)) {
      scores.set(slug, (scores.get(slug) ?? 0) + weight);
    }
  });

  const derived = [...scores.entries()]
    .filter(([slug]) => selectable(slug))
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => slug)
    .slice(0, MAX_DERIVED_CATEGORIES);

  for (const slug of FALLBACK_CATEGORIES) {
    if (derived.length >= MINIMUM_CATEGORIES) break;
    if (!derived.includes(slug) && selectable(slug)) {
      derived.push(slug);
    }
  }

  return derived;
}
