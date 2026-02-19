/**
 * Badge Service
 *
 * Handles badge checking, awarding, and progress queries.
 * Reuses existing DB tables (fact_interactions, trivia_sessions, question_attempts, etc.)
 */

import {
  BADGE_DEFINITIONS,
  type BadgeDefinition,
  type BadgeStar,
} from '../config/badges';

import { openDatabase } from './database';

// ============================================
// PENDING BADGE TOAST QUEUE
// ============================================

const _pendingToasts: NewlyEarnedBadge[] = [];
let _modalScreenCount = 0;

/** Consume all pending badge toasts (returns and clears the queue). */
export function consumePendingBadgeToasts(): NewlyEarnedBadge[] {
  return _pendingToasts.splice(0, _pendingToasts.length);
}

/** Track modal screen open/close. Toast only shows when count is 0. */
export function pushModalScreen() {
  _modalScreenCount++;
}

export function popModalScreen() {
  _modalScreenCount = Math.max(0, _modalScreenCount - 1);
}

export function isModalScreenActive(): boolean {
  return _modalScreenCount > 0;
}

// ============================================
// TYPES
// ============================================

export interface EarnedBadge {
  badge_id: string;
  star: BadgeStar;
  earned_at: string;
}

export interface NewlyEarnedBadge {
  badgeId: string;
  star: BadgeStar;
  definition: BadgeDefinition;
}

export interface BadgeProgress {
  current: number;
  nextThreshold: number | null;
}

export interface BadgeWithStatus {
  definition: BadgeDefinition;
  earnedStars: { star: BadgeStar; earned_at: string }[];
  currentProgress: number;
  nextStar: BadgeStar | null;
  nextThreshold: number | null;
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Check all badges and award any newly earned stars.
 * Returns the list of newly earned badges (for toast display).
 */
export async function checkAndAwardBadges(): Promise<NewlyEarnedBadge[]> {
  console.log('🏅 [Badge] checkAndAwardBadges called');
  try {
    const db = await openDatabase();
    const earned = await getEarnedBadges();
    const earnedSet = new Set(earned.map((e) => `${e.badge_id}:${e.star}`));
    const newlyEarned: NewlyEarnedBadge[] = [];
    const now = new Date().toISOString();

    for (const badge of BADGE_DEFINITIONS) {
      const progress = await getBadgeProgressValue(badge.id);
      if (progress > 0) {
        console.log(`🏅 [Badge] ${badge.id}: progress=${progress}, thresholds=${badge.stars.map(s => s.threshold).join(',')}`);
      }

      for (const starDef of badge.stars) {
        const key = `${badge.id}:${starDef.star}`;
        if (earnedSet.has(key)) continue;

        if (progress >= starDef.threshold) {
          console.log(`🏅 [Badge] EARNED: ${badge.id} ${starDef.star}!`);
          await db.runAsync(
            `INSERT OR IGNORE INTO user_badges (badge_id, star, earned_at) VALUES (?, ?, ?)`,
            [badge.id, starDef.star, now]
          );
          newlyEarned.push({ badgeId: badge.id, star: starDef.star, definition: badge });
        }
      }
    }

    if (newlyEarned.length > 0) {
      console.log(`🏅 [Badge] Queued ${newlyEarned.length} toasts`);
      _pendingToasts.push(...newlyEarned);
    }

    return newlyEarned;
  } catch (error) {
    console.error('🏅 [Badge] ERROR in checkAndAwardBadges:', error);
    throw error;
  }
}

/** Push a fake badge toast for testing. */
export function triggerTestBadgeToast(): void {
  const def = BADGE_DEFINITIONS[0];
  const stars: BadgeStar[] = ['star1', 'star2', 'star3'];
  const star = stars[Math.floor(Math.random() * stars.length)];
  _pendingToasts.push({ badgeId: def.id, star, definition: def });
  console.log(`🏅 [Badge] Test toast queued: ${def.id} (${star})`);
}

/**
 * Get all earned badge+star rows from the database.
 */
export async function getEarnedBadges(): Promise<EarnedBadge[]> {
  const db = await openDatabase();
  return db.getAllAsync<EarnedBadge>(
    `SELECT badge_id, star, earned_at FROM user_badges ORDER BY earned_at DESC`
  );
}

/**
 * Get the current progress value for a specific badge.
 */
export async function getBadgeProgress(badgeId: string): Promise<BadgeProgress> {
  const current = await getBadgeProgressValue(badgeId);
  const definition = BADGE_DEFINITIONS.find((b) => b.id === badgeId);
  if (!definition) return { current, nextThreshold: null };

  const earned = await getEarnedBadges();
  const earnedStars = new Set(earned.filter((e) => e.badge_id === badgeId).map((e) => e.star));

  // Find the next unearned star threshold
  for (const starDef of definition.stars) {
    if (!earnedStars.has(starDef.star)) {
      return { current, nextThreshold: starDef.threshold };
    }
  }

  // All stars earned
  const lastStar = definition.stars[definition.stars.length - 1];
  return { current, nextThreshold: lastStar?.threshold ?? null };
}

/**
 * Get all badge definitions merged with earned status and progress.
 */
export async function getAllBadgesWithStatus(): Promise<BadgeWithStatus[]> {
  const earned = await getEarnedBadges();
  const earnedMap = new Map<string, { star: BadgeStar; earned_at: string }[]>();

  for (const e of earned) {
    const list = earnedMap.get(e.badge_id) || [];
    list.push({ star: e.star, earned_at: e.earned_at });
    earnedMap.set(e.badge_id, list);
  }

  const results: BadgeWithStatus[] = [];

  for (const definition of BADGE_DEFINITIONS) {
    const earnedStars = earnedMap.get(definition.id) || [];
    const earnedStarSet = new Set(earnedStars.map((e) => e.star));
    const currentProgress = await getBadgeProgressValue(definition.id);

    // Find next unearned star
    let nextStar: BadgeStar | null = null;
    let nextThreshold: number | null = null;
    for (const starDef of definition.stars) {
      if (!earnedStarSet.has(starDef.star)) {
        nextStar = starDef.star;
        nextThreshold = starDef.threshold;
        break;
      }
    }

    results.push({
      definition,
      earnedStars,
      currentProgress,
      nextStar,
      nextThreshold,
    });
  }

  return results;
}

/**
 * Compute reading streak from fact_interactions dates.
 * Counts consecutive days (backwards from today) with at least one story_viewed_at.
 */
export async function getReadingStreak(): Promise<number> {
  const db = await openDatabase();

  const result = await db.getAllAsync<{ view_date: string }>(
    `SELECT DISTINCT date(story_viewed_at, 'localtime') as view_date
     FROM fact_interactions
     WHERE story_viewed_at IS NOT NULL
     ORDER BY view_date DESC`
  );

  if (result.length === 0) return 0;

  const today = getLocalDateString();
  const yesterday = getLocalDateString(
    new Date(new Date().setDate(new Date().getDate() - 1))
  );

  const dates = result.map((r) => r.view_date);

  // Streak must start from today or yesterday
  if (dates[0] !== today && dates[0] !== yesterday) {
    return 0;
  }

  let streak = 1;
  let currentDate = new Date(dates[0] + 'T12:00:00');

  for (let i = 1; i < dates.length; i++) {
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = getLocalDateString(prevDate);

    if (dates[i] === prevDateStr) {
      streak++;
      currentDate = prevDate;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Compute quiz streak from trivia_sessions dates.
 * Counts consecutive days (backwards from today) with at least one completed quiz.
 */
export async function getQuizStreak(): Promise<number> {
  const db = await openDatabase();

  const result = await db.getAllAsync<{ quiz_date: string }>(
    `SELECT DISTINCT date(completed_at, 'localtime') as quiz_date
     FROM trivia_sessions
     WHERE completed_at IS NOT NULL
     ORDER BY quiz_date DESC`
  );

  if (result.length === 0) return 0;

  const today = getLocalDateString();
  const yesterday = getLocalDateString(
    new Date(new Date().setDate(new Date().getDate() - 1))
  );

  const dates = result.map((r) => r.quiz_date);

  // Streak must start from today or yesterday
  if (dates[0] !== today && dates[0] !== yesterday) {
    return 0;
  }

  let streak = 1;
  let currentDate = new Date(dates[0] + 'T12:00:00');

  for (let i = 1; i < dates.length; i++) {
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = getLocalDateString(prevDate);

    if (dates[i] === prevDateStr) {
      streak++;
      currentDate = prevDate;
    } else {
      break;
    }
  }

  return streak;
}

export async function getBestReadingStreak(): Promise<number> {
  const db = await openDatabase();

  const result = await db.getAllAsync<{ view_date: string }>(
    `SELECT DISTINCT date(story_viewed_at, 'localtime') as view_date
     FROM fact_interactions
     WHERE story_viewed_at IS NOT NULL
     ORDER BY view_date ASC`
  );

  if (result.length === 0) return 0;

  let best = 1;
  let current = 1;

  for (let i = 1; i < result.length; i++) {
    const prev = new Date(result[i - 1].view_date + 'T12:00:00');
    const curr = new Date(result[i].view_date + 'T12:00:00');
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

// ============================================
// PROGRESS VALUE RESOLVERS
// ============================================

/**
 * Get the raw progress number for a badge.
 * This is the core logic that maps badge IDs to their data sources.
 */
async function getBadgeProgressValue(badgeId: string): Promise<number> {
  const db = await openDatabase();

  switch (badgeId) {
    case 'curious_reader': {
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM fact_interactions WHERE story_viewed_at IS NOT NULL`
      );
      return r?.count || 0;
    }

    case 'deep_diver': {
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM fact_interactions WHERE detail_read_at IS NOT NULL`
      );
      return r?.count || 0;
    }

    case 'bookworm': {
      const r = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(detail_time_spent), 0) as total FROM fact_interactions`
      );
      // Convert seconds to minutes
      return Math.floor((r?.total || 0) / 60);
    }

    case 'daily_reader': {
      return await getReadingStreak();
    }

    case 'quiz_starter': {
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM trivia_sessions`
      );
      return r?.count || 0;
    }

    case 'sharp_mind': {
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM question_attempts qa
         JOIN questions q ON qa.question_id = q.id
         WHERE qa.is_correct = 1`
      );
      return r?.count || 0;
    }

    case 'perfectionist': {
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM trivia_sessions
         WHERE correct_answers = total_questions AND total_questions > 0`
      );
      return r?.count || 0;
    }

    case 'quick_thinker': {
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM trivia_sessions
         WHERE elapsed_time <= 60 AND total_questions > 0
         AND CAST(correct_answers AS REAL) / total_questions >= 0.6`
      );
      return r?.count || 0;
    }

    case 'master_scholar': {
      // Reuse the mastered count logic from database.ts
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM (
           SELECT q.id
           FROM questions q
           WHERE (
             SELECT COUNT(*) FROM (
               SELECT is_correct FROM question_attempts
               WHERE question_id = q.id
               ORDER BY answered_at DESC
               LIMIT 3
             ) WHERE is_correct = 1
           ) = 3
           AND (
             SELECT COUNT(*) FROM question_attempts WHERE question_id = q.id
           ) >= 3
         )`
      );
      return r?.count || 0;
    }

    case 'streak_champion': {
      // Reuse best daily streak logic
      const result = await db.getAllAsync<{ date: string }>(
        `SELECT date FROM daily_trivia_progress
         WHERE completed_at IS NOT NULL
         ORDER BY date ASC`
      );
      if (result.length === 0) return 0;
      let bestStreak = 1;
      let currentStreak = 1;
      for (let i = 1; i < result.length; i++) {
        const prev = new Date(result[i - 1].date + 'T12:00:00');
        const curr = new Date(result[i].date + 'T12:00:00');
        const diffDays = Math.round(
          (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays === 1) {
          currentStreak++;
          bestStreak = Math.max(bestStreak, currentStreak);
        } else {
          currentStreak = 1;
        }
      }
      return bestStreak;
    }

    case 'fact_collector': {
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM favorites`
      );
      return r?.count || 0;
    }

    case 'knowledge_sharer': {
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM share_events`
      );
      return r?.count || 0;
    }

    case 'category_ace': {
      // Count categories where user has ≥80% accuracy with at least 5 answers
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM (
           SELECT ts.category_slug,
                  SUM(ts.correct_answers) as correct,
                  SUM(ts.total_questions) as total
           FROM trivia_sessions ts
           WHERE ts.category_slug IS NOT NULL AND ts.category_slug != ''
           GROUP BY ts.category_slug
           HAVING total >= 5 AND (CAST(correct AS REAL) / total) >= 0.8
         )`
      );
      return r?.count || 0;
    }

    case 'endurance': {
      const r = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM question_attempts qa
         JOIN questions q ON qa.question_id = q.id`
      );
      return r?.count || 0;
    }

    default:
      return 0;
  }
}

// ============================================
// HELPERS
// ============================================

function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
