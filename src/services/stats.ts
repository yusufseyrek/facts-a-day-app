/**
 * Reading Stats Service
 *
 * Aggregation queries over `fact_interactions` (+ joins to `facts`, `categories`)
 * for the Reading Stats screen. All queries are read-only.
 *
 * detail_time_spent is stored in seconds (see addFactDetailTimeSpent in database.ts).
 */

import { getEarnedBadges, getReadingStreaks } from './badges';
import { openDatabase } from './database';

import type { EarnedBadge } from './badges';

// ============================================
// TYPES
// ============================================

export interface ReadingOverview {
  storiesViewed: number;
  factsDeepRead: number;
  totalSeconds: number;
  currentStreak: number;
  longestStreak: number;
}

export interface DailyActivity {
  date: string; // YYYY-MM-DD (local)
  count: number;
}

export interface ReadingHabits {
  topWeekday: number | null; // 0=Sun..6=Sat
  topHour: number | null; // 0-23
  avgSecondsPerFact: number;
  hasData: boolean;
}

export interface CategoryStat {
  slug: string;
  name: string;
  colorHex: string | null;
  count: number;
}

export interface AllReadingStats {
  overview: ReadingOverview;
  dailyActivity: DailyActivity[];
  habits: ReadingHabits;
  topCategories: CategoryStat[];
  earnedBadges: EarnedBadge[];
}

// ============================================
// INDIVIDUAL QUERIES
// ============================================

async function getOverviewAggregates() {
  const db = await openDatabase();
  return db.getFirstAsync<{
    stories_viewed: number;
    facts_deep_read: number;
    total_seconds: number;
  }>(
    `SELECT
       COUNT(CASE WHEN story_viewed_at IS NOT NULL THEN 1 END) AS stories_viewed,
       COUNT(CASE WHEN detail_read_at IS NOT NULL THEN 1 END) AS facts_deep_read,
       COALESCE(SUM(detail_time_spent), 0) AS total_seconds
     FROM fact_interactions`
  );
}

async function getDailyReadingActivity(days: number): Promise<DailyActivity[]> {
  const db = await openDatabase();

  const rows = await db.getAllAsync<{ d: string; c: number }>(
    `SELECT date(COALESCE(detail_opened_at, story_viewed_at), 'localtime') AS d,
            COUNT(DISTINCT fact_id) AS c
     FROM fact_interactions
     WHERE COALESCE(detail_opened_at, story_viewed_at) IS NOT NULL
       AND date(COALESCE(detail_opened_at, story_viewed_at), 'localtime')
           >= date('now', 'localtime', ?)
     GROUP BY d`,
    [`-${days - 1} day`]
  );

  const byDate = new Map(rows.map((r) => [r.d, r.c]));
  const out: DailyActivity[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = toLocalDateString(d);
    out.push({ date: key, count: byDate.get(key) ?? 0 });
  }

  return out;
}

/**
 * Habit insights in a single query. Uses scalar subqueries for top weekday /
 * hour so the planner only scans `fact_interactions` once.
 */
async function getReadingHabits(): Promise<ReadingHabits> {
  const db = await openDatabase();

  const row = await db.getFirstAsync<{
    top_weekday: number | null;
    top_hour: number | null;
    total_time: number;
    time_count: number;
  }>(
    `SELECT
       (SELECT CAST(strftime('%w', detail_opened_at, 'localtime') AS INTEGER)
        FROM fact_interactions WHERE detail_opened_at IS NOT NULL
        GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1) AS top_weekday,
       (SELECT CAST(strftime('%H', detail_opened_at, 'localtime') AS INTEGER)
        FROM fact_interactions WHERE detail_opened_at IS NOT NULL
        GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1) AS top_hour,
       COALESCE(SUM(detail_time_spent), 0) AS total_time,
       COUNT(CASE WHEN detail_time_spent > 0 THEN 1 END) AS time_count
     FROM fact_interactions`
  );

  const avg = row && row.time_count > 0 ? Math.round(row.total_time / row.time_count) : 0;

  return {
    topWeekday: row?.top_weekday ?? null,
    topHour: row?.top_hour ?? null,
    avgSecondsPerFact: avg,
    hasData: row?.top_weekday != null || row?.top_hour != null,
  };
}

async function getTopCategoriesRead(limit: number): Promise<CategoryStat[]> {
  const db = await openDatabase();

  const rows = await db.getAllAsync<{
    slug: string | null;
    name: string | null;
    color_hex: string | null;
    n: number;
  }>(
    `SELECT c.slug AS slug, c.name AS name, c.color_hex AS color_hex, COUNT(*) AS n
     FROM fact_interactions fi
     JOIN facts f ON f.id = fi.fact_id
     LEFT JOIN categories c ON c.slug = f.category
     WHERE fi.detail_read_at IS NOT NULL OR fi.story_viewed_at IS NOT NULL
     GROUP BY c.slug
     ORDER BY n DESC
     LIMIT ?`,
    [limit]
  );

  return rows
    .filter((r) => r.slug && r.name)
    .map((r) => ({
      slug: r.slug!,
      name: r.name!,
      colorHex: r.color_hex,
      count: r.n,
    }));
}

// ============================================
// BATCHED ENTRY POINT
// ============================================

/**
 * Fetch every stat the Reading Stats screen needs in a single call.
 * All 6 independent queries run in parallel via Promise.all, so the total
 * wall time is bounded by the slowest query — not the sum.
 */
export async function getAllReadingStats(): Promise<AllReadingStats> {
  const [agg, streaks, dailyActivity, habits, topCategories, earnedBadges] = await Promise.all([
    getOverviewAggregates(),
    getReadingStreaks(),
    getDailyReadingActivity(90),
    getReadingHabits(),
    getTopCategoriesRead(5),
    getEarnedBadges(),
  ]);

  return {
    overview: {
      storiesViewed: agg?.stories_viewed ?? 0,
      factsDeepRead: agg?.facts_deep_read ?? 0,
      totalSeconds: agg?.total_seconds ?? 0,
      currentStreak: streaks.current,
      longestStreak: streaks.best,
    },
    dailyActivity,
    habits,
    topCategories,
    earnedBadges,
  };
}

// ============================================
// HELPERS
// ============================================

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
