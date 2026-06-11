import { MINIMUM_CATEGORIES } from '../../config/app';
import { deriveCategories, QUIZ_QUESTIONS } from '../../config/onboardingQuestions';

// Mirrors the backend category seed (000_schema.sql + 018_premium_categories.sql)
const FREE_SLUGS = [
  'science',
  'nature',
  'history',
  'culture',
  'technology',
  'psychology',
  'arts',
  'geography',
  'health',
  'business',
  'philosophy',
  'language',
  'sports',
  'food',
  'space',
  'environment',
  'mathematics',
];

const PREMIUM_SLUGS = [
  'finance',
  'anatomy',
  'mysteries',
  'relationships',
  'crime',
  'inventions',
  'animals',
  'mythology',
  'cinema',
  'architecture',
];

const ALL_CATEGORIES = [
  ...FREE_SLUGS.map((slug) => ({ slug, is_premium: 0 })),
  ...PREMIUM_SLUGS.map((slug) => ({ slug, is_premium: 1 })),
];

describe('QUIZ_QUESTIONS', () => {
  it('has 3 questions with 4 options each', () => {
    expect(QUIZ_QUESTIONS).toHaveLength(3);
    for (const question of QUIZ_QUESTIONS) {
      expect(question.options).toHaveLength(4);
    }
  });

  it('only references slugs that exist in the backend seed', () => {
    const known = new Set([...FREE_SLUGS, ...PREMIUM_SLUGS]);
    for (const question of QUIZ_QUESTIONS) {
      for (const option of question.options) {
        for (const slug of Object.keys(option.weights)) {
          expect(known).toContain(slug);
        }
      }
    }
  });

  it('covers every free category across all options, so no interest is unreachable', () => {
    const reachable = new Set(
      QUIZ_QUESTIONS.flatMap((q) => q.options.flatMap((o) => Object.keys(o.weights)))
    );
    for (const slug of FREE_SLUGS) {
      expect(reachable).toContain(slug);
    }
  });
});

describe('deriveCategories', () => {
  it('always yields at least MINIMUM_CATEGORIES for any full answer combination', () => {
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        for (let c = 0; c < 4; c++) {
          const derived = deriveCategories([a, b, c], ALL_CATEGORIES, false);
          expect(derived.length).toBeGreaterThanOrEqual(MINIMUM_CATEGORIES);
          expect(derived.length).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('ranks directly-chosen themes first', () => {
    // universe + tech documentary + invest
    const derived = deriveCategories([0, 0, 3], ALL_CATEGORIES, false);
    // science 2+1, technology 2+1, business 1+2 all score 3
    expect(derived.slice(0, 3).sort()).toEqual(['business', 'science', 'technology']);
  });

  it('excludes premium categories for free users', () => {
    // past + civilizations doubles up on mythology (premium)
    const derived = deriveCategories([1, 1, 2], ALL_CATEGORIES, false);
    for (const slug of derived) {
      expect(PREMIUM_SLUGS).not.toContain(slug);
    }
  });

  it('includes premium categories for premium users when they score', () => {
    const derived = deriveCategories([1, 1, 2], ALL_CATEGORIES, true);
    expect(derived).toContain('mythology');
  });

  it('drops slugs the backend no longer offers', () => {
    const withoutSpace = ALL_CATEGORIES.filter((c) => c.slug !== 'space');
    const derived = deriveCategories([0, 0, 3], withoutSpace, false);
    expect(derived).not.toContain('space');
  });

  it('tops up from fallbacks when answers are missing', () => {
    const derived = deriveCategories([null, null, null], ALL_CATEGORIES, false);
    expect(derived.length).toBeGreaterThanOrEqual(MINIMUM_CATEGORIES);
  });

  it('returns nothing when the backend offers no categories', () => {
    expect(deriveCategories([0, 1, 2], [], false)).toEqual([]);
  });
});
