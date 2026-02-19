// ============================================
// BADGE THRESHOLDS - Edit these to tune difficulty
// ============================================
const THRESHOLDS = {
  // Reading badges
  curious_reader: { bronze: 1, silver: 50, gold: 200 }, // TODO: restore bronze to 10 after testing
  deep_diver: { bronze: 1, silver: 25, gold: 100 }, // TODO: restore bronze to 5 after testing
  bookworm: { bronze: 30, silver: 120, gold: 600 }, // minutes
  daily_reader: { bronze: 3, silver: 7, gold: 30 }, // consecutive days
  fact_collector: { bronze: 5, silver: 25, gold: 100 }, // facts favorited
  knowledge_sharer: { bronze: 1, silver: 10, gold: 50 }, // facts shared
  // Quiz badges
  quiz_starter: { bronze: 5, silver: 25, gold: 100 },
  sharp_mind: { bronze: 50, silver: 200, gold: 1000 },
  perfectionist: { bronze: 3, silver: 10, gold: 50 },
  quick_thinker: { bronze: 3, silver: 10, gold: 25 }, // quizzes <= 60s
  master_scholar: { bronze: 10, silver: 50, gold: 200 },
  streak_champion: { bronze: 7, silver: 30, gold: 100 }, // days
  category_ace: { bronze: 3, silver: 8, gold: 15 }, // categories with ≥80% accuracy
  endurance: { bronze: 100, silver: 500, gold: 2000 }, // total questions answered
} as const;

// ============================================
// TYPES
// ============================================
export type BadgeCategory = 'reading' | 'quiz';
export type BadgeTier = 'bronze' | 'silver' | 'gold';

export interface BadgeTierDefinition {
  tier: BadgeTier;
  threshold: number;
}

export interface BadgeDefinition {
  id: string;
  icon: string;
  category: BadgeCategory;
  tiers: BadgeTierDefinition[];
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

export const TIER_TO_STAR_INDEX: Record<BadgeTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
};

// ============================================
// BADGE DEFINITIONS
// ============================================
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Reading badges
  {
    id: 'curious_reader',
    icon: 'book-open',
    category: 'reading',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.curious_reader.bronze },
      { tier: 'silver', threshold: THRESHOLDS.curious_reader.silver },
      { tier: 'gold', threshold: THRESHOLDS.curious_reader.gold },
    ],
  },
  {
    id: 'deep_diver',
    icon: 'scan-eye',
    category: 'reading',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.deep_diver.bronze },
      { tier: 'silver', threshold: THRESHOLDS.deep_diver.silver },
      { tier: 'gold', threshold: THRESHOLDS.deep_diver.gold },
    ],
  },
  {
    id: 'bookworm',
    icon: 'clock',
    category: 'reading',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.bookworm.bronze },
      { tier: 'silver', threshold: THRESHOLDS.bookworm.silver },
      { tier: 'gold', threshold: THRESHOLDS.bookworm.gold },
    ],
  },
  {
    id: 'daily_reader',
    icon: 'calendar-check',
    category: 'reading',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.daily_reader.bronze },
      { tier: 'silver', threshold: THRESHOLDS.daily_reader.silver },
      { tier: 'gold', threshold: THRESHOLDS.daily_reader.gold },
    ],
  },
  {
    id: 'fact_collector',
    icon: 'bookmark',
    category: 'reading',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.fact_collector.bronze },
      { tier: 'silver', threshold: THRESHOLDS.fact_collector.silver },
      { tier: 'gold', threshold: THRESHOLDS.fact_collector.gold },
    ],
  },
  {
    id: 'knowledge_sharer',
    icon: 'share-2',
    category: 'reading',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.knowledge_sharer.bronze },
      { tier: 'silver', threshold: THRESHOLDS.knowledge_sharer.silver },
      { tier: 'gold', threshold: THRESHOLDS.knowledge_sharer.gold },
    ],
  },

  // Quiz badges
  {
    id: 'quiz_starter',
    icon: 'gamepad-2',
    category: 'quiz',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.quiz_starter.bronze },
      { tier: 'silver', threshold: THRESHOLDS.quiz_starter.silver },
      { tier: 'gold', threshold: THRESHOLDS.quiz_starter.gold },
    ],
  },
  {
    id: 'sharp_mind',
    icon: 'check-circle',
    category: 'quiz',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.sharp_mind.bronze },
      { tier: 'silver', threshold: THRESHOLDS.sharp_mind.silver },
      { tier: 'gold', threshold: THRESHOLDS.sharp_mind.gold },
    ],
  },
  {
    id: 'perfectionist',
    icon: 'award',
    category: 'quiz',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.perfectionist.bronze },
      { tier: 'silver', threshold: THRESHOLDS.perfectionist.silver },
      { tier: 'gold', threshold: THRESHOLDS.perfectionist.gold },
    ],
  },
  {
    id: 'quick_thinker',
    icon: 'zap',
    category: 'quiz',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.quick_thinker.bronze },
      { tier: 'silver', threshold: THRESHOLDS.quick_thinker.silver },
      { tier: 'gold', threshold: THRESHOLDS.quick_thinker.gold },
    ],
  },
  {
    id: 'master_scholar',
    icon: 'graduation-cap',
    category: 'quiz',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.master_scholar.bronze },
      { tier: 'silver', threshold: THRESHOLDS.master_scholar.silver },
      { tier: 'gold', threshold: THRESHOLDS.master_scholar.gold },
    ],
  },
  {
    id: 'streak_champion',
    icon: 'flame',
    category: 'quiz',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.streak_champion.bronze },
      { tier: 'silver', threshold: THRESHOLDS.streak_champion.silver },
      { tier: 'gold', threshold: THRESHOLDS.streak_champion.gold },
    ],
  },
  {
    id: 'category_ace',
    icon: 'trophy',
    category: 'quiz',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.category_ace.bronze },
      { tier: 'silver', threshold: THRESHOLDS.category_ace.silver },
      { tier: 'gold', threshold: THRESHOLDS.category_ace.gold },
    ],
  },
  {
    id: 'endurance',
    icon: 'dumbbell',
    category: 'quiz',
    tiers: [
      { tier: 'bronze', threshold: THRESHOLDS.endurance.bronze },
      { tier: 'silver', threshold: THRESHOLDS.endurance.silver },
      { tier: 'gold', threshold: THRESHOLDS.endurance.gold },
    ],
  },
];

// Helper to get a badge definition by ID
export function getBadgeDefinition(badgeId: string): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find((b) => b.id === badgeId);
}

// Total possible earned badges (sum of all tiers)
export const TOTAL_POSSIBLE_BADGES = BADGE_DEFINITIONS.reduce(
  (sum, badge) => sum + badge.tiers.length,
  0
);
