// ============================================
// BADGE THRESHOLDS - Edit these to tune difficulty
// ============================================
const THRESHOLDS = {
  // Reading badges
  curious_reader: { star1: 25, star2: 250, star3: 1000 }, // story views
  deep_diver: { star1: 10, star2: 100, star3: 500 }, // facts read
  bookworm: { star1: 30, star2: 300, star3: 1000 }, // minutes
  daily_reader: { star1: 7, star2: 30, star3: 90 }, // consecutive days
  fact_collector: { star1: 5, star2: 25, star3: 100 }, // facts favorited
  knowledge_sharer: { star1: 1, star2: 10, star3: 30 }, // facts shared
  // Quiz badges
  quiz_starter: { star1: 5, star2: 50, star3: 250 }, // quizzes completed
  sharp_mind: { star1: 50, star2: 250, star3: 1000 }, // correct answers
  perfectionist: { star1: 3, star2: 15, star3: 50 }, // perfect quizzes
  quick_thinker: { star1: 3, star2: 25, star3: 75 }, // quizzes <= 60s
  master_scholar: { star1: 10, star2: 50, star3: 200 }, // high accuracy quizzes
  streak_champion: { star1: 7, star2: 30, star3: 90 }, // days
  category_ace: { star1: 2, star2: 7, star3: 10 }, // categories with ≥80% accuracy
  endurance: { star1: 100, star2: 500, star3: 2000 }, // total questions answered
} as const;

// ============================================
// TYPES
// ============================================
export type BadgeCategory = 'reading' | 'quiz';
export type BadgeStar = 'star1' | 'star2' | 'star3';

export interface BadgeStarDefinition {
  star: BadgeStar;
  threshold: number;
}

export interface BadgeDefinition {
  id: string;
  icon: string;
  category: BadgeCategory;
  stars: BadgeStarDefinition[];
}

export const LOCKED_OPACITY = 0.35;

// ============================================
// STAR DISPLAY SYSTEM
// ============================================
export const STAR_COLORS = {
  filled: '#FFB800',
  empty: {
    light: '#D1D5DB',
    dark: '#374151',
  },
} as const;

// ============================================
// BADGE DEFINITIONS
// ============================================
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Reading badges
  {
    id: 'curious_reader',
    icon: 'book-open',
    category: 'reading',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.curious_reader.star1 },
      { star: 'star2', threshold: THRESHOLDS.curious_reader.star2 },
      { star: 'star3', threshold: THRESHOLDS.curious_reader.star3 },
    ],
  },
  {
    id: 'deep_diver',
    icon: 'scan-eye',
    category: 'reading',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.deep_diver.star1 },
      { star: 'star2', threshold: THRESHOLDS.deep_diver.star2 },
      { star: 'star3', threshold: THRESHOLDS.deep_diver.star3 },
    ],
  },
  {
    id: 'bookworm',
    icon: 'clock',
    category: 'reading',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.bookworm.star1 },
      { star: 'star2', threshold: THRESHOLDS.bookworm.star2 },
      { star: 'star3', threshold: THRESHOLDS.bookworm.star3 },
    ],
  },
  {
    id: 'daily_reader',
    icon: 'calendar-check',
    category: 'reading',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.daily_reader.star1 },
      { star: 'star2', threshold: THRESHOLDS.daily_reader.star2 },
      { star: 'star3', threshold: THRESHOLDS.daily_reader.star3 },
    ],
  },
  {
    id: 'fact_collector',
    icon: 'bookmark',
    category: 'reading',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.fact_collector.star1 },
      { star: 'star2', threshold: THRESHOLDS.fact_collector.star2 },
      { star: 'star3', threshold: THRESHOLDS.fact_collector.star3 },
    ],
  },
  {
    id: 'knowledge_sharer',
    icon: 'share-2',
    category: 'reading',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.knowledge_sharer.star1 },
      { star: 'star2', threshold: THRESHOLDS.knowledge_sharer.star2 },
      { star: 'star3', threshold: THRESHOLDS.knowledge_sharer.star3 },
    ],
  },

  // Quiz badges
  {
    id: 'quiz_starter',
    icon: 'gamepad-2',
    category: 'quiz',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.quiz_starter.star1 },
      { star: 'star2', threshold: THRESHOLDS.quiz_starter.star2 },
      { star: 'star3', threshold: THRESHOLDS.quiz_starter.star3 },
    ],
  },
  {
    id: 'sharp_mind',
    icon: 'check-circle',
    category: 'quiz',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.sharp_mind.star1 },
      { star: 'star2', threshold: THRESHOLDS.sharp_mind.star2 },
      { star: 'star3', threshold: THRESHOLDS.sharp_mind.star3 },
    ],
  },
  {
    id: 'perfectionist',
    icon: 'award',
    category: 'quiz',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.perfectionist.star1 },
      { star: 'star2', threshold: THRESHOLDS.perfectionist.star2 },
      { star: 'star3', threshold: THRESHOLDS.perfectionist.star3 },
    ],
  },
  {
    id: 'quick_thinker',
    icon: 'zap',
    category: 'quiz',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.quick_thinker.star1 },
      { star: 'star2', threshold: THRESHOLDS.quick_thinker.star2 },
      { star: 'star3', threshold: THRESHOLDS.quick_thinker.star3 },
    ],
  },
  {
    id: 'master_scholar',
    icon: 'graduation-cap',
    category: 'quiz',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.master_scholar.star1 },
      { star: 'star2', threshold: THRESHOLDS.master_scholar.star2 },
      { star: 'star3', threshold: THRESHOLDS.master_scholar.star3 },
    ],
  },
  {
    id: 'streak_champion',
    icon: 'flame',
    category: 'quiz',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.streak_champion.star1 },
      { star: 'star2', threshold: THRESHOLDS.streak_champion.star2 },
      { star: 'star3', threshold: THRESHOLDS.streak_champion.star3 },
    ],
  },
  {
    id: 'category_ace',
    icon: 'trophy',
    category: 'quiz',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.category_ace.star1 },
      { star: 'star2', threshold: THRESHOLDS.category_ace.star2 },
      { star: 'star3', threshold: THRESHOLDS.category_ace.star3 },
    ],
  },
  {
    id: 'endurance',
    icon: 'dumbbell',
    category: 'quiz',
    stars: [
      { star: 'star1', threshold: THRESHOLDS.endurance.star1 },
      { star: 'star2', threshold: THRESHOLDS.endurance.star2 },
      { star: 'star3', threshold: THRESHOLDS.endurance.star3 },
    ],
  },
];

// Helper to get a badge definition by ID
export function getBadgeDefinition(badgeId: string): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find((b) => b.id === badgeId);
}

// Total possible earned badges (sum of all stars)
export const TOTAL_POSSIBLE_BADGES = BADGE_DEFINITIONS.reduce(
  (sum, badge) => sum + badge.stars.length,
  0
);
