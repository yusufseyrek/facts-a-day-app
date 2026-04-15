/**
 * Reading Stats Service
 *
 * Aggregation queries over `fact_interactions` (+ joins to `facts`, `categories`)
 * for the Reading Stats screen. All queries are read-only.
 *
 * detail_time_spent is stored in seconds (see addFactDetailTimeSpent in database.ts).
 */

import { getBestReadingStreak, getReadingStreak } from './badges';
import { openDatabase } from './database';

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

/** Overview numbers for the stats hero. */
export async function getReadingOverview(): Promise<ReadingOverview> {
  const db = await openDatabase();

  const agg = await db.getFirstAsync<{
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

  const [currentStreak, longestStreak] = await Promise.all([
    getReadingStreak(),
    getBestReadingStreak(),
  ]);

  return {
    storiesViewed: agg?.stories_viewed ?? 0,
    factsDeepRead: agg?.facts_deep_read ?? 0,
    totalSeconds: agg?.total_seconds ?? 0,
    currentStreak,
    longestStreak,
  };
}

/**
 * Per-day unique-fact counts for the last N days, padded to include days with zero activity.
 * Days are local dates (YYYY-MM-DD). Returned oldest → newest.
 */
export async function getDailyReadingActivity(days: number): Promise<DailyActivity[]> {
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

/** Derived habit insights from detail_opened_at timestamps. */
export async function getReadingHabits(): Promise<ReadingHabits> {
  const db = await openDatabase();

  const weekdayRow = await db.getFirstAsync<{ weekday: number; c: number }>(
    `SELECT CAST(strftime('%w', detail_opened_at, 'localtime') AS INTEGER) AS weekday,
            COUNT(*) AS c
     FROM fact_interactions
     WHERE detail_opened_at IS NOT NULL
     GROUP BY weekday
     ORDER BY c DESC
     LIMIT 1`
  );

  const hourRow = await db.getFirstAsync<{ hour: number; c: number }>(
    `SELECT CAST(strftime('%H', detail_opened_at, 'localtime') AS INTEGER) AS hour,
            COUNT(*) AS c
     FROM fact_interactions
     WHERE detail_opened_at IS NOT NULL
     GROUP BY hour
     ORDER BY c DESC
     LIMIT 1`
  );

  const avgRow = await db.getFirstAsync<{ total: number; n: number }>(
    `SELECT COALESCE(SUM(detail_time_spent), 0) AS total,
            COUNT(CASE WHEN detail_time_spent > 0 THEN 1 END) AS n
     FROM fact_interactions`
  );

  const avg = avgRow && avgRow.n > 0 ? Math.round(avgRow.total / avgRow.n) : 0;

  return {
    topWeekday: weekdayRow?.weekday ?? null,
    topHour: hourRow?.hour ?? null,
    avgSecondsPerFact: avg,
    hasData: !!weekdayRow || !!hourRow,
  };
}

/**
 * Top categories by deep-read count. Uses joined `categories` row for name/color
 * so display matches the rest of the app.
 */
export async function getTopCategoriesRead(limit: number): Promise<CategoryStat[]> {
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

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
