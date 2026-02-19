/**
 * Badge Service Tests
 *
 * Tests badge configuration integrity, progress queries, awarding logic,
 * streak calculations, and toast queue management.
 */

// ─── Mock expo-sqlite (must be before any imports that touch database) ───
jest.mock('expo-sqlite', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
  };
  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
    __mockDb: mockDb,
  };
});

const sqlite = jest.requireMock('expo-sqlite');
const mockDb = sqlite.__mockDb;

// ─── Import after mocks ───
import {
  checkAndAwardBadges,
  getEarnedBadges,
  getBadgeProgress,
  getAllBadgesWithStatus,
  getReadingStreak,
  getQuizStreak,
  getBestReadingStreak,
  consumePendingBadgeToasts,
  pushModalScreen,
  popModalScreen,
  isModalScreenActive,
} from '../../services/badges';

import {
  BADGE_DEFINITIONS,
  TOTAL_POSSIBLE_BADGES,
  getBadgeDefinition,
  STAR_COLORS,
} from '../../config/badges';

import type { BadgeCategory } from '../../config/badges';

// ─── Global beforeEach: reset mocks and re-establish defaults ───
beforeEach(() => {
  mockDb.getAllAsync.mockReset().mockResolvedValue([]);
  mockDb.getFirstAsync.mockReset().mockResolvedValue(null);
  mockDb.runAsync.mockReset().mockResolvedValue({ changes: 1 });
  mockDb.execAsync.mockReset().mockResolvedValue(undefined);
});

// ─── Helpers ───

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function consecutiveDatesFromToday(count: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(toDateStr(daysAgo(i)));
  }
  return dates;
}

/**
 * Set up mocks so checkAndAwardBadges / getAllBadgesWithStatus sees specific
 * progress for one badge while all others return 0.
 * Matches the batch query structure of getAllBadgeProgressValues():
 *   1. getAllAsync → getEarnedBadges
 *   2. getFirstAsync → fact_interactions batch (curious_reader, deep_diver, bookworm)
 *   3. getFirstAsync → counts batch (quiz_starter, perfectionist, quick_thinker,
 *      category_ace, sharp_mind, endurance, master_scholar, fact_collector, knowledge_sharer)
 *   4. getAllAsync → getReadingStreak (for daily_reader)
 *   5. getAllAsync → getBestDailyTriviaStreak (for streak_champion)
 */
function setupSingleBadgeProgress(
  badgeId: string,
  value: number,
  earnedBadges: Array<{ badge_id: string; star: string; earned_at: string }> = []
): void {
  // 1. getEarnedBadges call
  mockDb.getAllAsync.mockResolvedValueOnce(earnedBadges);

  // 2. fact_interactions batch query
  mockDb.getFirstAsync.mockResolvedValueOnce({
    curious_reader: badgeId === 'curious_reader' ? value : 0,
    deep_diver: badgeId === 'deep_diver' ? value : 0,
    bookworm_seconds: badgeId === 'bookworm' ? value : 0,
  });

  // 3. counts batch query
  mockDb.getFirstAsync.mockResolvedValueOnce({
    quiz_starter: badgeId === 'quiz_starter' ? value : 0,
    perfectionist: badgeId === 'perfectionist' ? value : 0,
    quick_thinker: badgeId === 'quick_thinker' ? value : 0,
    category_ace: badgeId === 'category_ace' ? value : 0,
    sharp_mind: badgeId === 'sharp_mind' ? value : 0,
    endurance: badgeId === 'endurance' ? value : 0,
    master_scholar: badgeId === 'master_scholar' ? value : 0,
    fact_collector: badgeId === 'fact_collector' ? value : 0,
    knowledge_sharer: badgeId === 'knowledge_sharer' ? value : 0,
  });

  // 4. getReadingStreak (for daily_reader progress)
  if (badgeId === 'daily_reader') {
    const dates = consecutiveDatesFromToday(value).map((d) => ({ view_date: d }));
    mockDb.getAllAsync.mockResolvedValueOnce(dates);
  } else {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
  }

  // 5. getBestDailyTriviaStreak (for streak_champion progress)
  if (badgeId === 'streak_champion') {
    const dates = consecutiveDatesFromToday(value)
      .reverse()
      .map((d) => ({ date: d }));
    mockDb.getAllAsync.mockResolvedValueOnce(dates);
  } else {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
  }
}

// ═══════════════════════════════════════════
// GROUP 1: Badge Configuration Integrity
// ═══════════════════════════════════════════

describe('Badge Configuration Integrity', () => {
  it('defines exactly 14 badges', () => {
    expect(BADGE_DEFINITIONS).toHaveLength(14);
  });

  it('every badge has exactly 3 stars (star1, star2, star3)', () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge.stars).toHaveLength(3);
      expect(badge.stars[0].star).toBe('star1');
      expect(badge.stars[1].star).toBe('star2');
      expect(badge.stars[2].star).toBe('star3');
    }
  });

  it('star thresholds are in strictly ascending order', () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge.stars[0].threshold).toBeLessThan(badge.stars[1].threshold);
      expect(badge.stars[1].threshold).toBeLessThan(badge.stars[2].threshold);
    }
  });

  it('all badges have a valid category', () => {
    const validCategories: BadgeCategory[] = ['reading', 'quiz'];
    for (const badge of BADGE_DEFINITIONS) {
      expect(validCategories).toContain(badge.category);
    }
  });

  it('has 6 reading badges and 8 quiz badges', () => {
    const reading = BADGE_DEFINITIONS.filter((b) => b.category === 'reading');
    const quiz = BADGE_DEFINITIONS.filter((b) => b.category === 'quiz');
    expect(reading).toHaveLength(6);
    expect(quiz).toHaveLength(8);
  });

  it('TOTAL_POSSIBLE_BADGES equals 42 (14 badges x 3 stars)', () => {
    expect(TOTAL_POSSIBLE_BADGES).toBe(42);
  });

  it('every badge has a unique id', () => {
    const ids = BADGE_DEFINITIONS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every badge has a non-empty icon string', () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge.icon).toBeTruthy();
      expect(typeof badge.icon).toBe('string');
    }
  });

  describe('getBadgeDefinition', () => {
    it('returns the correct badge for a valid id', () => {
      const badge = getBadgeDefinition('curious_reader');
      expect(badge).toBeDefined();
      expect(badge!.id).toBe('curious_reader');
      expect(badge!.category).toBe('reading');
    });

    it('returns undefined for an unknown id', () => {
      expect(getBadgeDefinition('nonexistent_badge')).toBeUndefined();
    });
  });

  describe('STAR_COLORS', () => {
    it('has filled and empty color values', () => {
      expect(STAR_COLORS.filled).toBe('#FFB800');
      expect(STAR_COLORS.empty.light).toBeDefined();
      expect(STAR_COLORS.empty.dark).toBeDefined();
    });
  });
});

// ═══════════════════════════════════════════
// GROUP 2: Badge Progress Queries
// ═══════════════════════════════════════════

describe('Badge Progress Queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consumePendingBadgeToasts();
  });

  it('curious_reader: awards star1 when view count >= 25', async () => {
    setupSingleBadgeProgress('curious_reader', 25);
    const earned = await checkAndAwardBadges();
    const match = earned.find((e) => e.badgeId === 'curious_reader');
    expect(match).toBeDefined();
    expect(match!.star).toBe('star1');
  });

  it('deep_diver: awards star1 when detail-read count >= 10', async () => {
    setupSingleBadgeProgress('deep_diver', 10);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'deep_diver')).toBeDefined();
  });

  it('bookworm: converts seconds to minutes (1800s = 30min = star1)', async () => {
    setupSingleBadgeProgress('bookworm', 1800);
    const earned = await checkAndAwardBadges();
    const match = earned.find((e) => e.badgeId === 'bookworm');
    expect(match).toBeDefined();
    expect(match!.star).toBe('star1');
  });

  it('bookworm: does NOT award at 1799 seconds (29.98 min < 30 threshold)', async () => {
    setupSingleBadgeProgress('bookworm', 1799);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'bookworm')).toBeUndefined();
  });

  it('fact_collector: awards star1 when favorites count >= 5', async () => {
    setupSingleBadgeProgress('fact_collector', 5);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'fact_collector')).toBeDefined();
  });

  it('knowledge_sharer: awards star1 when share count >= 1', async () => {
    setupSingleBadgeProgress('knowledge_sharer', 1);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'knowledge_sharer')).toBeDefined();
  });

  it('quiz_starter: awards star1 when session count >= 5', async () => {
    setupSingleBadgeProgress('quiz_starter', 5);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'quiz_starter')).toBeDefined();
  });

  it('sharp_mind: awards star1 when correct answers >= 50', async () => {
    setupSingleBadgeProgress('sharp_mind', 50);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'sharp_mind')).toBeDefined();
  });

  it('perfectionist: awards star1 when perfect quiz count >= 3', async () => {
    setupSingleBadgeProgress('perfectionist', 3);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'perfectionist')).toBeDefined();
  });

  it('quick_thinker: awards star1 when fast+accurate quiz count >= 3', async () => {
    setupSingleBadgeProgress('quick_thinker', 3);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'quick_thinker')).toBeDefined();
  });

  it('master_scholar: awards star1 when mastered question count >= 10', async () => {
    setupSingleBadgeProgress('master_scholar', 10);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'master_scholar')).toBeDefined();
  });

  it('category_ace: awards star1 when qualifying categories >= 2', async () => {
    setupSingleBadgeProgress('category_ace', 2);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'category_ace')).toBeDefined();
  });

  it('endurance: awards star1 when total questions answered >= 100', async () => {
    setupSingleBadgeProgress('endurance', 100);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'endurance')).toBeDefined();
  });

  it('daily_reader: awards star1 when reading streak >= 7', async () => {
    setupSingleBadgeProgress('daily_reader', 7);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'daily_reader')).toBeDefined();
  });

  it('streak_champion: awards star1 when best quiz streak >= 7', async () => {
    setupSingleBadgeProgress('streak_champion', 7);
    const earned = await checkAndAwardBadges();
    expect(earned.find((e) => e.badgeId === 'streak_champion')).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// GROUP 3: checkAndAwardBadges Core Logic
// ═══════════════════════════════════════════

describe('checkAndAwardBadges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consumePendingBadgeToasts();
  });

  it('awards no badges when all progress is 0', async () => {
    setupSingleBadgeProgress('curious_reader', 0);

    const earned = await checkAndAwardBadges();
    expect(earned).toEqual([]);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('awards multiple stars when progress far exceeds thresholds', async () => {
    // curious_reader: star1=25, star2=250, star3=1000
    setupSingleBadgeProgress('curious_reader', 1000);
    const earned = await checkAndAwardBadges();
    const curReaderBadges = earned.filter((e) => e.badgeId === 'curious_reader');
    expect(curReaderBadges).toHaveLength(3);
    expect(curReaderBadges.map((b) => b.star)).toEqual(['star1', 'star2', 'star3']);
  });

  it('does not re-award already-earned badges', async () => {
    setupSingleBadgeProgress('curious_reader', 1000, [
      { badge_id: 'curious_reader', star: 'star1', earned_at: '2025-01-01T00:00:00Z' },
      { badge_id: 'curious_reader', star: 'star2', earned_at: '2025-01-02T00:00:00Z' },
    ]);
    const earned = await checkAndAwardBadges();
    const curReaderBadges = earned.filter((e) => e.badgeId === 'curious_reader');
    expect(curReaderBadges).toHaveLength(1);
    expect(curReaderBadges[0].star).toBe('star3');
  });

  it('inserts into user_badges with correct parameters', async () => {
    setupSingleBadgeProgress('knowledge_sharer', 1);
    await checkAndAwardBadges();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO user_badges'),
      expect.arrayContaining(['knowledge_sharer', 'star1'])
    );
  });

  it('queues newly earned badges to pending toasts', async () => {
    setupSingleBadgeProgress('knowledge_sharer', 1);
    await checkAndAwardBadges();
    const toasts = consumePendingBadgeToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].badgeId).toBe('knowledge_sharer');
    expect(toasts[0].star).toBe('star1');
    expect(toasts[0].definition.id).toBe('knowledge_sharer');
  });

  it('each returned badge includes the full definition object', async () => {
    setupSingleBadgeProgress('knowledge_sharer', 1);
    const earned = await checkAndAwardBadges();
    expect(earned[0].definition).toEqual(
      expect.objectContaining({
        id: 'knowledge_sharer',
        icon: 'share-2',
        category: 'reading',
      })
    );
  });
});

// ═══════════════════════════════════════════
// GROUP 4: getEarnedBadges
// ═══════════════════════════════════════════

describe('getEarnedBadges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no badges earned', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    const badges = await getEarnedBadges();
    expect(badges).toEqual([]);
  });

  it('returns earned badges from DB', async () => {
    const rows = [
      { badge_id: 'quiz_starter', star: 'star2', earned_at: '2025-06-02T00:00:00Z' },
      { badge_id: 'curious_reader', star: 'star1', earned_at: '2025-06-01T00:00:00Z' },
    ];
    mockDb.getAllAsync.mockResolvedValueOnce(rows);
    const badges = await getEarnedBadges();
    expect(badges).toHaveLength(2);
    expect(badges[0].badge_id).toBe('quiz_starter');
    expect(badges[1].badge_id).toBe('curious_reader');
  });

  it('calls getAllAsync with the correct SQL', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getEarnedBadges();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('SELECT badge_id, star, earned_at FROM user_badges')
    );
  });
});

// ═══════════════════════════════════════════
// GROUP 5: getBadgeProgress
// ═══════════════════════════════════════════

describe('getBadgeProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns current progress and next threshold for unearned badge', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ count: 10 });
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    const progress = await getBadgeProgress('curious_reader');
    expect(progress.current).toBe(10);
    expect(progress.nextThreshold).toBe(25); // star1 threshold
  });

  it('returns next unearned star when star1 is earned', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ count: 100 });
    mockDb.getAllAsync.mockResolvedValueOnce([
      { badge_id: 'curious_reader', star: 'star1', earned_at: '2025-01-01T00:00:00Z' },
    ]);
    const progress = await getBadgeProgress('curious_reader');
    expect(progress.current).toBe(100);
    expect(progress.nextThreshold).toBe(250); // star2 threshold
  });

  it('returns last star threshold when all stars earned', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ count: 3000 });
    mockDb.getAllAsync.mockResolvedValueOnce([
      { badge_id: 'curious_reader', star: 'star1', earned_at: '2025-01-01T00:00:00Z' },
      { badge_id: 'curious_reader', star: 'star2', earned_at: '2025-02-01T00:00:00Z' },
      { badge_id: 'curious_reader', star: 'star3', earned_at: '2025-03-01T00:00:00Z' },
    ]);
    const progress = await getBadgeProgress('curious_reader');
    expect(progress.current).toBe(3000);
    expect(progress.nextThreshold).toBe(1000); // star3 threshold
  });

  it('returns null nextThreshold for unknown badge id', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    const progress = await getBadgeProgress('nonexistent_badge');
    expect(progress.current).toBe(0);
    expect(progress.nextThreshold).toBeNull();
  });
});

// ═══════════════════════════════════════════
// GROUP 6: getAllBadgesWithStatus
// ═══════════════════════════════════════════

describe('getAllBadgesWithStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all 14 badges', async () => {
    setupSingleBadgeProgress('curious_reader', 0);
    const results = await getAllBadgesWithStatus();
    expect(results).toHaveLength(14);
  });

  it('each result has required shape', async () => {
    setupSingleBadgeProgress('curious_reader', 0);
    const results = await getAllBadgesWithStatus();
    for (const result of results) {
      expect(result).toHaveProperty('definition');
      expect(result).toHaveProperty('earnedStars');
      expect(result).toHaveProperty('currentProgress');
      expect(result).toHaveProperty('nextStar');
      expect(result).toHaveProperty('nextThreshold');
    }
  });

  it('correctly merges earned stars with definitions', async () => {
    setupSingleBadgeProgress('curious_reader', 600, [
      { badge_id: 'curious_reader', star: 'star1', earned_at: '2025-01-01T00:00:00Z' },
      { badge_id: 'curious_reader', star: 'star2', earned_at: '2025-02-01T00:00:00Z' },
    ]);
    const results = await getAllBadgesWithStatus();
    const curReader = results.find((r) => r.definition.id === 'curious_reader')!;
    expect(curReader.earnedStars).toHaveLength(2);
    expect(curReader.earnedStars[0].star).toBe('star1');
    expect(curReader.earnedStars[1].star).toBe('star2');
  });

  it('identifies the next unearned star', async () => {
    setupSingleBadgeProgress('curious_reader', 100, [
      { badge_id: 'curious_reader', star: 'star1', earned_at: '2025-01-01T00:00:00Z' },
    ]);
    const results = await getAllBadgesWithStatus();
    const curReader = results.find((r) => r.definition.id === 'curious_reader')!;
    expect(curReader.nextStar).toBe('star2');
    expect(curReader.nextThreshold).toBe(250);
  });

  it('sets nextStar/nextThreshold to null when all stars earned', async () => {
    setupSingleBadgeProgress('curious_reader', 3000, [
      { badge_id: 'curious_reader', star: 'star1', earned_at: '2025-01-01T00:00:00Z' },
      { badge_id: 'curious_reader', star: 'star2', earned_at: '2025-02-01T00:00:00Z' },
      { badge_id: 'curious_reader', star: 'star3', earned_at: '2025-03-01T00:00:00Z' },
    ]);
    const results = await getAllBadgesWithStatus();
    const curReader = results.find((r) => r.definition.id === 'curious_reader')!;
    expect(curReader.nextStar).toBeNull();
    expect(curReader.nextThreshold).toBeNull();
  });

  it('badges with no earned stars show star1 as next star', async () => {
    setupSingleBadgeProgress('curious_reader', 0);
    const results = await getAllBadgesWithStatus();
    for (const result of results) {
      expect(result.nextStar).toBe('star1');
      expect(result.nextThreshold).toBe(result.definition.stars[0].threshold);
    }
  });
});

// ═══════════════════════════════════════════
// GROUP 7: Streak Calculations
// ═══════════════════════════════════════════

describe('Streak Calculations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getReadingStreak', () => {
    it('returns 0 with no data', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);
      expect(await getReadingStreak()).toBe(0);
    });

    it('returns 1 when only today has a view', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { view_date: toDateStr(new Date()) },
      ]);
      expect(await getReadingStreak()).toBe(1);
    });

    it('returns streak count for consecutive days starting from today', async () => {
      const dates = consecutiveDatesFromToday(5).map((d) => ({ view_date: d }));
      mockDb.getAllAsync.mockResolvedValueOnce(dates);
      expect(await getReadingStreak()).toBe(5);
    });

    it('returns streak count for consecutive days starting from yesterday', async () => {
      const dates = [
        { view_date: toDateStr(daysAgo(1)) },
        { view_date: toDateStr(daysAgo(2)) },
        { view_date: toDateStr(daysAgo(3)) },
      ];
      mockDb.getAllAsync.mockResolvedValueOnce(dates);
      expect(await getReadingStreak()).toBe(3);
    });

    it('returns 0 when latest date is not today or yesterday', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { view_date: toDateStr(daysAgo(3)) },
        { view_date: toDateStr(daysAgo(4)) },
      ]);
      expect(await getReadingStreak()).toBe(0);
    });

    it('breaks streak on a gap', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { view_date: toDateStr(new Date()) },
        { view_date: toDateStr(daysAgo(1)) },
        // gap: daysAgo(2) missing
        { view_date: toDateStr(daysAgo(3)) },
      ]);
      expect(await getReadingStreak()).toBe(2);
    });
  });

  describe('getQuizStreak', () => {
    it('returns 0 with no data', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);
      expect(await getQuizStreak()).toBe(0);
    });

    it('returns streak count for consecutive days', async () => {
      const dates = consecutiveDatesFromToday(4).map((d) => ({ quiz_date: d }));
      mockDb.getAllAsync.mockResolvedValueOnce(dates);
      expect(await getQuizStreak()).toBe(4);
    });

    it('returns 0 when latest date is not today or yesterday', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { quiz_date: toDateStr(daysAgo(5)) },
      ]);
      expect(await getQuizStreak()).toBe(0);
    });

    it('breaks streak on a gap', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { quiz_date: toDateStr(new Date()) },
        { quiz_date: toDateStr(daysAgo(1)) },
        { quiz_date: toDateStr(daysAgo(4)) },
      ]);
      expect(await getQuizStreak()).toBe(2);
    });
  });

  describe('getBestReadingStreak', () => {
    it('returns 0 with no data', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);
      expect(await getBestReadingStreak()).toBe(0);
    });

    it('returns 1 for a single date', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { view_date: '2025-01-15' },
      ]);
      expect(await getBestReadingStreak()).toBe(1);
    });

    it('finds the best streak even if not the most recent', async () => {
      // ASC order
      mockDb.getAllAsync.mockResolvedValueOnce([
        { view_date: '2025-01-01' },
        { view_date: '2025-01-02' },
        { view_date: '2025-01-03' },
        { view_date: '2025-01-04' },
        { view_date: '2025-01-05' },
        // gap
        { view_date: '2025-06-10' },
        { view_date: '2025-06-11' },
      ]);
      expect(await getBestReadingStreak()).toBe(5);
    });

    it('handles multiple streaks and picks the longest', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { view_date: '2025-01-01' },
        { view_date: '2025-01-02' },
        // gap
        { view_date: '2025-02-01' },
        { view_date: '2025-02-02' },
        { view_date: '2025-02-03' },
        { view_date: '2025-02-04' },
        // gap
        { view_date: '2025-03-01' },
      ]);
      expect(await getBestReadingStreak()).toBe(4);
    });

    it('returns full length when all dates are consecutive', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { view_date: '2025-01-01' },
        { view_date: '2025-01-02' },
        { view_date: '2025-01-03' },
        { view_date: '2025-01-04' },
      ]);
      expect(await getBestReadingStreak()).toBe(4);
    });
  });
});

// ═══════════════════════════════════════════
// GROUP 8: Toast Queue Management
// ═══════════════════════════════════════════

describe('Toast Queue Management', () => {
  beforeEach(() => {
    consumePendingBadgeToasts();
    while (isModalScreenActive()) {
      popModalScreen();
    }
  });

  describe('consumePendingBadgeToasts', () => {
    it('returns empty array when no toasts pending', () => {
      const toasts = consumePendingBadgeToasts();
      expect(toasts).toEqual([]);
    });

    it('returns and clears the queue', async () => {
      jest.clearAllMocks();
      setupSingleBadgeProgress('knowledge_sharer', 1);
      await checkAndAwardBadges();

      const first = consumePendingBadgeToasts();
      expect(first).toHaveLength(1);

      const second = consumePendingBadgeToasts();
      expect(second).toEqual([]);
    });

    it('accumulates multiple badges before consumption', async () => {
      jest.clearAllMocks();
      setupSingleBadgeProgress('curious_reader', 1000);
      await checkAndAwardBadges();

      const toasts = consumePendingBadgeToasts();
      expect(toasts).toHaveLength(3);
    });
  });

  describe('Modal screen tracking', () => {
    it('isModalScreenActive returns false initially', () => {
      expect(isModalScreenActive()).toBe(false);
    });

    it('pushModalScreen makes modal active', () => {
      pushModalScreen();
      expect(isModalScreenActive()).toBe(true);
      popModalScreen();
    });

    it('popModalScreen makes modal inactive', () => {
      pushModalScreen();
      popModalScreen();
      expect(isModalScreenActive()).toBe(false);
    });

    it('supports nested modals (push twice, pop once = still active)', () => {
      pushModalScreen();
      pushModalScreen();
      popModalScreen();
      expect(isModalScreenActive()).toBe(true);
      popModalScreen();
    });

    it('popModalScreen does not go below 0', () => {
      popModalScreen();
      popModalScreen();
      popModalScreen();
      expect(isModalScreenActive()).toBe(false);
      pushModalScreen();
      expect(isModalScreenActive()).toBe(true);
      popModalScreen();
    });
  });
});
