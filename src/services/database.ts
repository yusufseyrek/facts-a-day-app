import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'factsaday.db';

let db: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Initialize and open the database
 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  // If database is already initialized, return it
  if (db) {
    return db;
  }

  // If initialization is in progress, wait for it to complete
  if (dbInitPromise) {
    return dbInitPromise;
  }

  // Start initialization
  dbInitPromise = (async () => {
    try {
      console.log('🔄 Initializing database...');

      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

      // Log the database path for testing
      const dbPath = `${FileSystem.Paths.document.uri}SQLite/${DATABASE_NAME}`;
      console.log('📁 Database path:', dbPath);

      // Enable foreign key constraints for CASCADE deletes to work
      await database.execAsync('PRAGMA foreign_keys = ON;');

      // Set the db variable before running schema
      db = database;

      await initializeSchema();

      console.log('✅ Database initialized successfully');
      return database;
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      // Reset state on error so it can be retried
      db = null;
      dbInitPromise = null;
      throw error;
    }
  })();

  return dbInitPromise;
}

/**
 * Create database schema
 */
async function initializeSchema(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Create categories table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      icon TEXT,
      color_hex TEXT
    );
  `);

  // Create facts table with updated schema
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY,
      slug TEXT,
      title TEXT,
      content TEXT NOT NULL,
      summary TEXT,
      category TEXT,
      source_url TEXT,
      image_url TEXT,
      language TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_updated TEXT,
      scheduled_date TEXT,
      notification_id TEXT,
      shown_in_feed INTEGER DEFAULT 0
    );
  `);

  // Create index on language for faster queries
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_facts_language ON facts(language);
  `);

  // Create index on category for faster queries
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
  `);

  // Create index on scheduled_date for faster queries
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_facts_scheduled_date ON facts(scheduled_date);
  `);

  // Create index on last_updated for faster queries
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_facts_last_updated ON facts(last_updated);
  `);

  // Create favorites table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS favorites (
      fact_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      FOREIGN KEY (fact_id) REFERENCES facts (id) ON DELETE CASCADE
    );
  `);

  // Create index on favorites created_at for ordering
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at);
  `);

  // ====== TRIVIA TABLES ======

  // Create questions table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY,
      fact_id INTEGER NOT NULL,
      question_type TEXT NOT NULL,
      question_text TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      wrong_answers TEXT,
      explanation TEXT,
      difficulty INTEGER DEFAULT 2,
      FOREIGN KEY (fact_id) REFERENCES facts(id) ON DELETE CASCADE
    );
  `);

  // Create index on questions fact_id for faster joins
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_questions_fact_id ON questions(fact_id);
  `);

  // Create question_attempts table for tracking mastery
  // NOTE: No CASCADE delete - we want to preserve attempts even when questions are deleted
  // Statistics queries join with questions table to only count attempts for existing questions
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS question_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      answered_at TEXT NOT NULL,
      trivia_mode TEXT NOT NULL,
      trivia_session_id INTEGER
    );
  `);

  // Create indexes on question_attempts
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_attempts_question_id ON question_attempts(question_id);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_attempts_answered_at ON question_attempts(answered_at);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_attempts_session_id ON question_attempts(trivia_session_id);
  `);

  // Create daily_trivia_progress table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS daily_trivia_progress (
      date TEXT PRIMARY KEY,
      total_questions INTEGER NOT NULL,
      correct_answers INTEGER NOT NULL,
      completed_at TEXT
    );
  `);

  // Create trivia_sessions table for tracking individual test sessions
  // Stores question IDs and answer indexes instead of full JSON for:
  // - Language-independent storage (content fetched fresh on display)
  // - Reduced database size (~200 bytes vs ~8KB per session)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trivia_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trivia_mode TEXT NOT NULL,
      category_slug TEXT,
      total_questions INTEGER NOT NULL,
      correct_answers INTEGER NOT NULL,
      completed_at TEXT NOT NULL,
      elapsed_time INTEGER,
      best_streak INTEGER,
      question_ids TEXT,      -- JSON array of question IDs: [123, 456, ...]
      selected_answers TEXT   -- JSON object: {"questionId": answerIndex, ...}
                              -- answerIndex: 0=correct, 1-3=wrong_answers[0-2]
                              -- For true/false: 0=True, 1=False
    );
  `);

  // Create index on trivia_sessions completed_at for faster queries
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_trivia_sessions_completed_at ON trivia_sessions(completed_at);
  `);

  // ====== FACT INTERACTIONS ======

  // Track story views and detail engagement
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS fact_interactions (
      fact_id INTEGER PRIMARY KEY,
      story_viewed_at TEXT,
      detail_opened_at TEXT,
      detail_read_at TEXT,
      detail_time_spent INTEGER DEFAULT 0,
      FOREIGN KEY (fact_id) REFERENCES facts(id) ON DELETE CASCADE
    );
  `);

  // ====== SHARE EVENTS ======

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS share_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fact_id INTEGER NOT NULL,
      shared_at TEXT NOT NULL
    );
  `);

  // ====== BADGES ======

  // Drop and recreate to fix schema mismatches during development
  // Safe: this table is new and has no production data yet
  await db.execAsync(`DROP TABLE IF EXISTS user_badges`);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_badges (
      badge_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      earned_at TEXT NOT NULL,
      PRIMARY KEY (badge_id, tier)
    );
  `);

  // ====== MIGRATIONS ======

  // Add slug column for existing databases (migration)
  await db.execAsync('ALTER TABLE facts ADD COLUMN slug TEXT').catch(() => {
    // Column already exists, ignore error
  });
}

/**
 * Clear all data from database tables
 */
export async function clearDatabase(): Promise<void> {
  const database = await openDatabase();
  await database.execAsync(`
    DELETE FROM facts;
    DELETE FROM categories;
    DELETE FROM favorites;
    DELETE FROM questions;
    DELETE FROM question_attempts;
    DELETE FROM daily_trivia_progress;
    DELETE FROM trivia_sessions;
    DELETE FROM fact_interactions;
    DELETE FROM share_events;
    DELETE FROM user_badges;
  `);
}

/**
 * Clear facts except those already delivered (scheduled_date <= now)
 * Used when changing preferences to remove future facts while keeping delivered ones
 */
export async function clearFutureAndUnscheduledFacts(): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `
    DELETE FROM facts
    WHERE scheduled_date IS NULL OR scheduled_date > ?
  `,
    [now]
  );

  console.log('Cleared future and unscheduled facts');
}

/**
 * Get facts that have been delivered (scheduled_date <= now)
 * Used to preserve delivered facts during preference changes
 */
export async function getDeliveredFacts(language?: string): Promise<Fact[]> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  if (language) {
    return await database.getAllAsync<Fact>(
      `SELECT * FROM facts
       WHERE scheduled_date IS NOT NULL
       AND scheduled_date <= ?
       AND language = ?
       ORDER BY scheduled_date DESC`,
      [now, language]
    );
  }

  return await database.getAllAsync<Fact>(
    `SELECT * FROM facts
     WHERE scheduled_date IS NOT NULL
     AND scheduled_date <= ?
     ORDER BY scheduled_date DESC`,
    [now]
  );
}

// ====== CATEGORIES ======

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color_hex?: string;
}

export async function insertCategories(categories: Category[]): Promise<void> {
  const database = await openDatabase();

  for (const category of categories) {
    await database.runAsync(
      `INSERT OR REPLACE INTO categories (id, name, slug, description, icon, color_hex)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        category.id,
        category.name,
        category.slug,
        category.description || null,
        category.icon || null,
        category.color_hex || null,
      ]
    );
  }
}

export async function getAllCategories(): Promise<Category[]> {
  const database = await openDatabase();
  const result = await database.getAllAsync<Category>('SELECT * FROM categories ORDER BY name ASC');
  return result;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<Category>('SELECT * FROM categories WHERE slug = ?', [
    slug,
  ]);
  return result;
}

// ====== FACTS ======

export interface Fact {
  id: number;
  slug?: string;
  title?: string;
  content: string;
  summary?: string;
  category?: string;
  source_url?: string;
  image_url?: string;
  language: string;
  created_at: string;
  last_updated?: string;
  scheduled_date?: string; // ISO date string when fact is scheduled for notification
  notification_id?: string; // Notification ID from expo-notifications
  shown_in_feed?: number; // 0 or 1, indicates if fact should be shown in feed immediately
}

/**
 * Extended Fact interface with joined category data
 */
export interface FactWithRelations extends Fact {
  categoryData?: Category | null;
}

/**
 * Helper function to map query results with joined data to FactWithRelations
 */
function mapFactsWithRelations(rows: any[]): FactWithRelations[] {
  return rows.map((row) => {
    const fact: FactWithRelations = {
      id: row.id,
      slug: row.slug,
      title: row.title,
      content: row.content,
      summary: row.summary,
      category: row.category,
      source_url: row.source_url,
      image_url: row.image_url,
      language: row.language,
      created_at: row.created_at,
      last_updated: row.last_updated,
      scheduled_date: row.scheduled_date,
      notification_id: row.notification_id,
      shown_in_feed: row.shown_in_feed,
    };

    // Map category data if present
    if (row.category_id) {
      fact.categoryData = {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        description: row.category_description,
        icon: row.category_icon,
        color_hex: row.category_color_hex,
      };
    }

    return fact;
  });
}

/**
 * Helper function to map a single query result with joined data to FactWithRelations
 */
function mapSingleFactWithRelations(row: any): FactWithRelations {
  return mapFactsWithRelations([row])[0];
}

export async function insertFacts(facts: Fact[]): Promise<void> {
  const database = await openDatabase();

  // Use transaction for better performance with batch inserts
  await database.withTransactionAsync(async () => {
    for (const fact of facts) {
      // Use INSERT ... ON CONFLICT to explicitly preserve local columns
      // (scheduled_date, notification_id, shown_in_feed) when updating existing facts from API
      await database.runAsync(
        `INSERT INTO facts (
          id, slug, title, content, summary, category,
          source_url, image_url, language, created_at, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          title = excluded.title,
          content = excluded.content,
          summary = excluded.summary,
          category = excluded.category,
          source_url = excluded.source_url,
          image_url = excluded.image_url,
          language = excluded.language,
          last_updated = excluded.last_updated,
          scheduled_date = facts.scheduled_date,
          notification_id = facts.notification_id,
          shown_in_feed = facts.shown_in_feed`,
        [
          fact.id,
          fact.slug || null,
          fact.title || null,
          fact.content,
          fact.summary || null,
          fact.category || null,
          fact.source_url || null,
          fact.image_url || null,
          fact.language,
          fact.created_at,
          fact.last_updated || fact.created_at,
        ]
      );
    }
  });
}

export async function getAllFacts(language?: string): Promise<FactWithRelations[]> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getAllAsync<any>(
      `SELECT
        f.*,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        c.description as category_description,
        c.icon as category_icon,
        c.color_hex as category_color_hex
      FROM facts f
      LEFT JOIN categories c ON f.category = c.slug
      WHERE f.language = ?
      ORDER BY RANDOM()`,
      [language]
    );
    return mapFactsWithRelations(result);
  }

  const result = await database.getAllAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    ORDER BY RANDOM()`
  );
  return mapFactsWithRelations(result);
}

export async function getFactById(id: number): Promise<FactWithRelations | null> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    WHERE f.id = ?`,
    [id]
  );
  return result ? mapSingleFactWithRelations(result) : null;
}

export async function getFactsByCategory(
  category: string,
  language?: string
): Promise<FactWithRelations[]> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getAllAsync<any>(
      `SELECT
        f.*,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        c.description as category_description,
        c.icon as category_icon,
        c.color_hex as category_color_hex
      FROM facts f
      LEFT JOIN categories c ON f.category = c.slug
      WHERE f.category = ? AND f.language = ?
      ORDER BY RANDOM()`,
      [category, language]
    );
    return mapFactsWithRelations(result);
  }

  const result = await database.getAllAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    WHERE f.category = ?
    ORDER BY RANDOM()`,
    [category]
  );
  return mapFactsWithRelations(result);
}

export async function getRandomFact(language?: string): Promise<FactWithRelations | null> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getFirstAsync<any>(
      `SELECT
        f.*,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        c.description as category_description,
        c.icon as category_icon,
        c.color_hex as category_color_hex
      FROM facts f
      LEFT JOIN categories c ON f.category = c.slug
      WHERE f.language = ?
      ORDER BY RANDOM()
      LIMIT 1`,
      [language]
    );
    return result ? mapSingleFactWithRelations(result) : null;
  }

  const result = await database.getFirstAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    ORDER BY RANDOM()
    LIMIT 1`
  );
  return result ? mapSingleFactWithRelations(result) : null;
}

export async function getRandomFactNotInFeed(language: string): Promise<FactWithRelations | null> {
  const database = await openDatabase();

  const result = await database.getFirstAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    WHERE f.language = ? AND f.shown_in_feed = 0
    ORDER BY RANDOM()
    LIMIT 1`,
    [language]
  );

  // Fall back to any random fact if all facts not in feed are exhausted
  if (!result) {
    return getRandomFact(language);
  }

  return mapSingleFactWithRelations(result);
}

export async function getFactsCount(language?: string): Promise<number> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM facts WHERE language = ?',
      [language]
    );
    return result?.count || 0;
  }

  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM facts'
  );
  return result?.count || 0;
}

// ====== NOTIFICATION SCHEDULING ======

/**
 * Get random unscheduled facts for notification scheduling
 * Excludes facts that are already scheduled or marked as shown in feed
 * @param limit Maximum number of facts to return
 * @param language Optional language filter
 */
export async function getRandomUnscheduledFacts(
  limit: number,
  language?: string
): Promise<FactWithRelations[]> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getAllAsync<any>(
      `SELECT
        f.*,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        c.description as category_description,
        c.icon as category_icon,
        c.color_hex as category_color_hex
      FROM facts f
      LEFT JOIN categories c ON f.category = c.slug
      WHERE f.language = ? AND f.scheduled_date IS NULL AND (f.shown_in_feed IS NULL OR f.shown_in_feed = 0)
      ORDER BY RANDOM()
      LIMIT ?`,
      [language, limit]
    );
    return mapFactsWithRelations(result);
  }

  const result = await database.getAllAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    WHERE f.scheduled_date IS NULL AND (f.shown_in_feed IS NULL OR f.shown_in_feed = 0)
    ORDER BY RANDOM()
    LIMIT ?`,
    [limit]
  );
  return mapFactsWithRelations(result);
}

/**
 * Mark a fact as scheduled with notification details
 * @param factId The ID of the fact
 * @param scheduledDate The scheduled date in ISO format
 * @param notificationId The OS notification identifier (null if pending OS scheduling)
 */
export async function markFactAsScheduled(
  factId: number,
  scheduledDate: string,
  notificationId: string | null
): Promise<void> {
  const database = await openDatabase();
  await database.runAsync('UPDATE facts SET scheduled_date = ?, notification_id = ? WHERE id = ?', [
    scheduledDate,
    notificationId,
    factId,
  ]);
}

/**
 * Clear scheduling information for a fact
 */
export async function clearFactScheduling(factId: number): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    'UPDATE facts SET scheduled_date = NULL, notification_id = NULL WHERE id = ?',
    [factId]
  );
}

/**
 * Mark a fact as shown in feed (for immediate display without scheduling)
 */
export async function markFactAsShown(factId: number): Promise<void> {
  const database = await openDatabase();
  await database.runAsync('UPDATE facts SET shown_in_feed = 1 WHERE id = ?', [factId]);
}

/**
 * Mark a fact as shown in feed with a specific scheduled_date
 * Used for immediate display (e.g., after onboarding) to properly group by date in feed
 */
export async function markFactAsShownWithDate(
  factId: number,
  scheduledDate: string
): Promise<void> {
  const database = await openDatabase();
  await database.runAsync('UPDATE facts SET shown_in_feed = 1, scheduled_date = ? WHERE id = ?', [
    scheduledDate,
    factId,
  ]);
}

/**
 * Mark all delivered facts as shown in feed
 * This ensures facts that were delivered while the app was closed get marked as shown
 * @param language Optional language filter
 * @returns Number of facts marked as shown
 */
export async function markDeliveredFactsAsShown(language?: string): Promise<number> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  if (language) {
    const result = await database.runAsync(
      `UPDATE facts SET shown_in_feed = 1
       WHERE scheduled_date IS NOT NULL
       AND scheduled_date <= ?
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND language = ?`,
      [now, language]
    );
    return result.changes;
  }

  const result = await database.runAsync(
    `UPDATE facts SET shown_in_feed = 1
     WHERE scheduled_date IS NOT NULL
     AND scheduled_date <= ?
     AND (shown_in_feed IS NULL OR shown_in_feed = 0)`,
    [now]
  );
  return result.changes;
}

/**
 * Clear all scheduled facts (reset all scheduling)
 * Only clears FUTURE scheduled facts (scheduled_date > now)
 * Preserves already-delivered facts so they appear in the correct date group in the feed
 */
export async function clearAllScheduledFacts(): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    'UPDATE facts SET scheduled_date = NULL, notification_id = NULL WHERE scheduled_date > ?',
    [now]
  );
}

/**
 * Clear ALL scheduled facts completely (including past ones)
 * Used when notification permissions are revoked to sync DB with OS state
 * Facts with shown_in_feed = 1 will keep their scheduled_date for feed grouping
 */
export async function clearAllScheduledFactsCompletely(): Promise<void> {
  const database = await openDatabase();

  // Clear scheduling data for all facts that are NOT shown in feed
  // (shown_in_feed facts should keep their scheduled_date for proper feed grouping)
  await database.runAsync(
    'UPDATE facts SET scheduled_date = NULL, notification_id = NULL WHERE (shown_in_feed IS NULL OR shown_in_feed = 0)'
  );
}

/**
 * Clear scheduled_date and notification_id for facts whose notifications are no longer in the OS
 * Used to sync DB state with OS state after permissions are revoked/re-enabled
 * @param validNotificationIds Array of notification IDs that are still scheduled in the OS
 */
export async function clearStaleScheduledFacts(validNotificationIds: string[]): Promise<number> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  // If no valid notification IDs, clear all future scheduled facts
  if (validNotificationIds.length === 0) {
    const result = await database.runAsync(
      'UPDATE facts SET scheduled_date = NULL, notification_id = NULL WHERE scheduled_date > ? AND notification_id IS NOT NULL',
      [now]
    );
    return result.changes;
  }

  // Clear facts whose notification_id is not in the valid list and scheduled_date is in the future
  const placeholders = validNotificationIds.map(() => '?').join(',');
  const result = await database.runAsync(
    `UPDATE facts SET scheduled_date = NULL, notification_id = NULL 
     WHERE scheduled_date > ? 
     AND notification_id IS NOT NULL 
     AND notification_id NOT IN (${placeholders})`,
    [now, ...validNotificationIds]
  );
  return result.changes;
}

/**
 * Get count of scheduled facts
 */
export async function getScheduledFactsCount(language?: string): Promise<number> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM facts WHERE scheduled_date IS NOT NULL AND language = ?',
      [language]
    );
    return result?.count || 0;
  }

  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM facts WHERE scheduled_date IS NOT NULL'
  );
  return result?.count || 0;
}

/**
 * Get count of future scheduled facts that are pending (not yet shown in feed)
 * These are facts with scheduled_date > now AND shown_in_feed = 0 or NULL
 */
export async function getFutureScheduledFactsCount(language?: string): Promise<number> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  if (language) {
    const result = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM facts 
       WHERE scheduled_date > ? 
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND language = ?`,
      [now, language]
    );
    return result?.count || 0;
  }

  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM facts 
     WHERE scheduled_date > ? 
     AND (shown_in_feed IS NULL OR shown_in_feed = 0)`,
    [now]
  );
  return result?.count || 0;
}

/**
 * Get the latest scheduled date from all scheduled facts
 * Used to determine where to append new scheduled notifications
 * Returns the MAX scheduled_date as an ISO string, or null if no scheduled facts exist
 */
export async function getLatestScheduledDate(language?: string): Promise<string | null> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  if (language) {
    const result = await database.getFirstAsync<{ max_date: string | null }>(
      `SELECT MAX(scheduled_date) as max_date FROM facts 
       WHERE scheduled_date > ? 
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND language = ?`,
      [now, language]
    );
    return result?.max_date || null;
  }

  const result = await database.getFirstAsync<{ max_date: string | null }>(
    `SELECT MAX(scheduled_date) as max_date FROM facts 
     WHERE scheduled_date > ? 
     AND (shown_in_feed IS NULL OR shown_in_feed = 0)`,
    [now]
  );
  return result?.max_date || null;
}

/**
 * Get all scheduled dates for a specific day (used for multi-time scheduling)
 * Returns an array of scheduled_date ISO strings for the given date
 * @param dateString The date to check in YYYY-MM-DD format
 * @param language Optional language filter
 */
export async function getScheduledTimesForDate(
  dateString: string,
  language?: string
): Promise<string[]> {
  const database = await openDatabase();

  // Match scheduled_date that starts with the given date string (YYYY-MM-DD)
  const datePrefix = dateString + 'T';

  if (language) {
    const result = await database.getAllAsync<{ scheduled_date: string }>(
      `SELECT scheduled_date FROM facts 
       WHERE scheduled_date LIKE ? 
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND language = ?
       ORDER BY scheduled_date ASC`,
      [datePrefix + '%', language]
    );
    return result.map((r) => r.scheduled_date);
  }

  const result = await database.getAllAsync<{ scheduled_date: string }>(
    `SELECT scheduled_date FROM facts 
     WHERE scheduled_date LIKE ? 
     AND (shown_in_feed IS NULL OR shown_in_feed = 0)
     ORDER BY scheduled_date ASC`,
    [datePrefix + '%']
  );
  return result.map((r) => r.scheduled_date);
}

/**
 * Check if there are any days with more notifications scheduled than expected
 * This detects the bug where multiple notifications were scheduled per day
 * @param expectedPerDay Number of notifications expected per day (based on user's configured times)
 * @param language Optional language filter
 * @returns True if there are days with too many notifications (needs repair)
 */
export async function hasExcessNotificationsPerDay(
  expectedPerDay: number,
  language?: string
): Promise<boolean> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  // Group future scheduled facts by LOCAL date and count
  // We use date(scheduled_date, 'localtime') to group by local date
  const query = language
    ? `SELECT date(scheduled_date, 'localtime') as local_date, COUNT(*) as count 
       FROM facts 
       WHERE scheduled_date > ? 
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND notification_id IS NOT NULL
       AND language = ?
       GROUP BY local_date
       HAVING count > ?`
    : `SELECT date(scheduled_date, 'localtime') as local_date, COUNT(*) as count 
       FROM facts 
       WHERE scheduled_date > ? 
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND notification_id IS NOT NULL
       GROUP BY local_date
       HAVING count > ?`;

  const params = language ? [now, language, expectedPerDay] : [now, expectedPerDay];

  const result = await database.getAllAsync<{ local_date: string; count: number }>(query, params);

  if (result.length > 0) {
    console.log(
      `🔔 Found ${result.length} days with excess notifications:`,
      result.map((r) => `${r.local_date}: ${r.count}/${expectedPerDay}`).join(', ')
    );
    return true;
  }

  return false;
}

/**
 * Check if there are any days with incorrect notification counts (either too many OR too few)
 * This detects scheduling issues where days don't have the expected number of notifications.
 * The last scheduled day is allowed to have fewer notifications (due to hitting the 64 limit).
 *
 * @param expectedPerDay Number of notifications expected per day (based on user's configured times)
 * @param language Optional language filter
 * @returns Object with needsRepair flag and details about the issues found
 */
export async function hasIncorrectNotificationsPerDay(
  expectedPerDay: number,
  language?: string
): Promise<{ needsRepair: boolean; excessDays: number; deficitDays: number }> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  // Get all days with their notification counts, ordered by date
  const query = language
    ? `SELECT date(scheduled_date, 'localtime') as local_date, COUNT(*) as count 
       FROM facts 
       WHERE scheduled_date > ? 
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND notification_id IS NOT NULL
       AND language = ?
       GROUP BY local_date
       ORDER BY local_date ASC`
    : `SELECT date(scheduled_date, 'localtime') as local_date, COUNT(*) as count 
       FROM facts 
       WHERE scheduled_date > ? 
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND notification_id IS NOT NULL
       GROUP BY local_date
       ORDER BY local_date ASC`;

  const params = language ? [now, language] : [now];
  const result = await database.getAllAsync<{ local_date: string; count: number }>(query, params);

  if (result.length === 0) {
    return { needsRepair: false, excessDays: 0, deficitDays: 0 };
  }

  let excessDays = 0;
  let deficitDays = 0;
  const issues: string[] = [];

  // Check all days except the last one (last day can have fewer due to hitting 64 limit)
  for (let i = 0; i < result.length; i++) {
    const day = result[i];
    const isLastDay = i === result.length - 1;

    if (day.count > expectedPerDay) {
      // Too many notifications - always a problem (even on last day)
      excessDays++;
      issues.push(`${day.local_date}: ${day.count}/${expectedPerDay} (excess)`);
    } else if (day.count < expectedPerDay && !isLastDay) {
      // Too few notifications - problem only if NOT the last day
      deficitDays++;
      issues.push(`${day.local_date}: ${day.count}/${expectedPerDay} (deficit)`);
    }
  }

  const needsRepair = excessDays > 0 || deficitDays > 0;

  if (needsRepair) {
    console.log(
      `🔔 Found ${excessDays} days with excess and ${deficitDays} days with deficit notifications:`
    );
    // Log first 10 issues
    for (const issue of issues.slice(0, 10)) {
      console.log(`   ${issue}`);
    }
    if (issues.length > 10) {
      console.log(`   ... and ${issues.length - 10} more`);
    }
  }

  return { needsRepair, excessDays, deficitDays };
}

/**
 * Get all scheduled dates within a time range (used for multi-time scheduling with timezone support)
 * Returns an array of scheduled_date ISO strings within the given range
 * @param startIso The start of the range in ISO format (inclusive)
 * @param endIso The end of the range in ISO format (exclusive)
 * @param language Optional language filter
 */
export async function getScheduledTimesInRange(
  startIso: string,
  endIso: string,
  language?: string
): Promise<string[]> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getAllAsync<{ scheduled_date: string }>(
      `SELECT scheduled_date FROM facts 
       WHERE scheduled_date >= ? 
       AND scheduled_date < ?
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND language = ?
       ORDER BY scheduled_date ASC`,
      [startIso, endIso, language]
    );
    return result.map((r) => r.scheduled_date);
  }

  const result = await database.getAllAsync<{ scheduled_date: string }>(
    `SELECT scheduled_date FROM facts 
     WHERE scheduled_date >= ? 
     AND scheduled_date < ?
     AND (shown_in_feed IS NULL OR shown_in_feed = 0)
     ORDER BY scheduled_date ASC`,
    [startIso, endIso]
  );
  return result.map((r) => r.scheduled_date);
}

/**
 * Get all future scheduled facts with their notification_id and scheduled_date
 * Used to sync OS notification queue with DB records
 * Includes facts with null notification_id (pending OS scheduling)
 * @param language Optional language filter
 */
export async function getFutureScheduledFactsWithNotificationIds(
  language?: string
): Promise<Array<{ id: number; notification_id: string; scheduled_date: string }>> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  if (language) {
    return await database.getAllAsync<{
      id: number;
      notification_id: string;
      scheduled_date: string;
    }>(
      `SELECT id, notification_id, scheduled_date FROM facts 
       WHERE scheduled_date > ? 
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND language = ?
       ORDER BY scheduled_date ASC`,
      [now, language]
    );
  }

  return await database.getAllAsync<{
    id: number;
    notification_id: string;
    scheduled_date: string;
  }>(
    `SELECT id, notification_id, scheduled_date FROM facts 
     WHERE scheduled_date > ? 
     AND (shown_in_feed IS NULL OR shown_in_feed = 0)
     ORDER BY scheduled_date ASC`,
    [now]
  );
}

/**
 * Update the notification_id for a scheduled fact
 * Called after successfully scheduling a notification in the OS
 * @param factId The ID of the fact
 * @param notificationId The OS notification identifier
 */
export async function updateNotificationId(factId: number, notificationId: string): Promise<void> {
  const database = await openDatabase();
  await database.runAsync('UPDATE facts SET notification_id = ? WHERE id = ?', [
    notificationId,
    factId,
  ]);
}

// ====== FAVORITES ======

/**
 * Toggle favorite status for a fact
 * Returns true if fact is now favorited, false if unfavorited
 */
export async function toggleFavorite(factId: number): Promise<boolean> {
  const database = await openDatabase();

  // Check if already favorited
  const existing = await database.getFirstAsync<{ fact_id: number }>(
    'SELECT fact_id FROM favorites WHERE fact_id = ?',
    [factId]
  );

  if (existing) {
    // Remove from favorites
    await database.runAsync('DELETE FROM favorites WHERE fact_id = ?', [factId]);
    return false;
  } else {
    // Add to favorites
    const now = new Date().toISOString();
    await database.runAsync('INSERT INTO favorites (fact_id, created_at) VALUES (?, ?)', [
      factId,
      now,
    ]);
    return true;
  }
}

/**
 * Check if a fact is favorited
 */
export async function isFactFavorited(factId: number): Promise<boolean> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<{ fact_id: number }>(
    'SELECT fact_id FROM favorites WHERE fact_id = ?',
    [factId]
  );
  return !!result;
}

/**
 * Get all favorited facts
 */
export async function getFavorites(language?: string): Promise<FactWithRelations[]> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getAllAsync<any>(
      `SELECT
        f.*,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        c.description as category_description,
        c.icon as category_icon,
        c.color_hex as category_color_hex
      FROM facts f
      INNER JOIN favorites fav ON f.id = fav.fact_id
      LEFT JOIN categories c ON f.category = c.slug
      WHERE f.language = ?
      ORDER BY fav.created_at DESC`,
      [language]
    );
    return mapFactsWithRelations(result);
  }

  const result = await database.getAllAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    INNER JOIN favorites fav ON f.id = fav.fact_id
    LEFT JOIN categories c ON f.category = c.slug
    ORDER BY fav.created_at DESC`
  );
  return mapFactsWithRelations(result);
}

/**
 * Get distinct categories from favorited facts
 * Returns category objects for categories that have at least one favorited fact
 */
export async function getFavoriteCategories(language?: string): Promise<Category[]> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getAllAsync<Category>(
      `SELECT DISTINCT c.*
       FROM categories c
       INNER JOIN facts f ON f.category = c.slug
       INNER JOIN favorites fav ON fav.fact_id = f.id
       WHERE f.language = ?
       ORDER BY c.name ASC`,
      [language]
    );
    return result;
  }

  const result = await database.getAllAsync<Category>(
    `SELECT DISTINCT c.*
     FROM categories c
     INNER JOIN facts f ON f.category = c.slug
     INNER JOIN favorites fav ON fav.fact_id = f.id
     ORDER BY c.name ASC`
  );
  return result;
}

/**
 * Get count of favorited facts
 */
export async function getFavoritesCount(language?: string): Promise<number> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM favorites fav
       INNER JOIN facts f ON fav.fact_id = f.id
       WHERE f.language = ?`,
      [language]
    );
    return result?.count || 0;
  }

  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM favorites'
  );
  return result?.count || 0;
}

// ====== DATE-BASED QUERIES ======

/**
 * Get facts scheduled for today (visible after midnight regardless of notification time)
 * Uses local date to match today's facts so they appear at 00:01 even if scheduled for 08:00
 * @param language Language filter
 */
export async function getTodaysFacts(language: string): Promise<FactWithRelations[]> {
  const database = await openDatabase();

  const result = await database.getAllAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    WHERE date(f.scheduled_date, 'localtime') = date('now', 'localtime')
      AND f.language = ?
    ORDER BY f.scheduled_date ASC`,
    [language]
  );
  return mapFactsWithRelations(result);
}

/**
 * Mark today's scheduled facts as shown in feed
 * This ensures facts appear in the feed immediately after midnight
 * @param language Language filter
 * @returns Number of facts marked as shown
 */
export async function markTodaysFactsAsShown(language: string): Promise<number> {
  const database = await openDatabase();

  const result = await database.runAsync(
    `UPDATE facts SET shown_in_feed = 1
     WHERE date(scheduled_date, 'localtime') = date('now', 'localtime')
       AND (shown_in_feed IS NULL OR shown_in_feed = 0)
       AND language = ?`,
    [language]
  );
  return result.changes;
}

/**
 * Get facts that were already delivered via notifications or marked as shown
 * Returns facts from the past 30 days where (scheduled_date <= now OR shown_in_feed = 1), ordered by date descending
 */
export async function getFactsGroupedByDate(language?: string): Promise<FactWithRelations[]> {
  const database = await openDatabase();

  // Get date 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString();

  // Get current date/time
  const now = new Date().toISOString();

  if (language) {
    const result = await database.getAllAsync<any>(
      `SELECT
        f.*,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        c.description as category_description,
        c.icon as category_icon,
        c.color_hex as category_color_hex
      FROM facts f
      LEFT JOIN categories c ON f.category = c.slug
      WHERE (
        (f.scheduled_date IS NOT NULL AND f.scheduled_date >= ? AND f.scheduled_date <= ?)
        OR f.shown_in_feed = 1
      )
      AND f.language = ?
      ORDER BY COALESCE(f.scheduled_date, f.created_at) DESC`,
      [cutoffDate, now, language]
    );
    return mapFactsWithRelations(result);
  }

  const result = await database.getAllAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    WHERE (
      (f.scheduled_date IS NOT NULL AND f.scheduled_date >= ? AND f.scheduled_date <= ?)
      OR f.shown_in_feed = 1
    )
    ORDER BY COALESCE(f.scheduled_date, f.created_at) DESC`,
    [cutoffDate, now]
  );
  return mapFactsWithRelations(result);
}

/**
 * Search facts by query string (searches in title, content, and summary)
 * Returns facts that match the search query, ordered by relevance (title matches first, then content/summary)
 */
export async function searchFacts(query: string, language?: string): Promise<FactWithRelations[]> {
  const database = await openDatabase();

  if (!query || query.trim().length === 0) {
    return [];
  }

  // Escape special characters for LIKE query
  const searchTerm = `%${query.trim()}%`;

  if (language) {
    const result = await database.getAllAsync<any>(
      `SELECT
        f.*,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        c.description as category_description,
        c.icon as category_icon,
        c.color_hex as category_color_hex
      FROM facts f
      LEFT JOIN categories c ON f.category = c.slug
      WHERE f.language = ?
      AND (
        f.title LIKE ? OR
        f.content LIKE ? OR
        f.summary LIKE ?
      )
      ORDER BY 
        CASE WHEN f.title LIKE ? THEN 1 ELSE 2 END,
        COALESCE(f.scheduled_date, f.created_at) DESC`,
      [language, searchTerm, searchTerm, searchTerm, searchTerm]
    );
    return mapFactsWithRelations(result);
  }

  const result = await database.getAllAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    WHERE (
      f.title LIKE ? OR
      f.content LIKE ? OR
      f.summary LIKE ?
    )
    ORDER BY 
      CASE WHEN f.title LIKE ? THEN 1 ELSE 2 END,
      COALESCE(f.scheduled_date, f.created_at) DESC`,
    [searchTerm, searchTerm, searchTerm, searchTerm]
  );
  return mapFactsWithRelations(result);
}

// ====== TRIVIA QUESTIONS ======

export interface Question {
  id: number;
  fact_id: number;
  question_type: 'multiple_choice' | 'true_false';
  question_text: string;
  correct_answer: string;
  wrong_answers: string | null; // JSON string array
  explanation: string | null;
  difficulty: number;
}

export interface QuestionWithFact extends Question {
  fact?: FactWithRelations;
}

export interface QuestionAttempt {
  id: number;
  question_id: number;
  is_correct: number; // 0 or 1
  answered_at: string;
  trivia_mode: 'daily' | 'category' | 'mixed';
}

export interface DailyTriviaProgress {
  date: string;
  total_questions: number;
  correct_answers: number;
  completed_at: string | null;
}

/**
 * Insert or update questions (upsert)
 * Questions come from the API along with facts
 */
export async function insertQuestions(questions: Question[]): Promise<void> {
  if (questions.length === 0) return;

  const database = await openDatabase();

  await database.withTransactionAsync(async () => {
    for (const question of questions) {
      await database.runAsync(
        `INSERT OR REPLACE INTO questions (
          id, fact_id, question_type, question_text, correct_answer,
          wrong_answers, explanation, difficulty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          question.id,
          question.fact_id,
          question.question_type,
          question.question_text,
          question.correct_answer,
          question.wrong_answers || null,
          question.explanation || null,
          question.difficulty || 2,
        ]
      );
    }
  });
}

/**
 * Get questions for daily trivia - questions from facts shown today
 * @param dateString Date in YYYY-MM-DD format
 * @param language Language filter
 */
export async function getQuestionsForDailyTrivia(
  dateString: string,
  language: string
): Promise<QuestionWithFact[]> {
  const database = await openDatabase();
  const datePrefix = dateString + 'T';

  const result = await database.getAllAsync<any>(
    `SELECT 
      q.*,
      f.id as fact_id,
      f.title as fact_title,
      f.content as fact_content,
      f.summary as fact_summary,
      f.category as fact_category,
      f.source_url as fact_source_url,
      f.image_url as fact_image_url,
      f.language as fact_language,
      f.created_at as fact_created_at,
      f.last_updated as fact_last_updated,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM questions q
    INNER JOIN facts f ON q.fact_id = f.id
    LEFT JOIN categories c ON f.category = c.slug
    WHERE f.shown_in_feed = 1
    AND f.scheduled_date LIKE ?
    AND f.language = ?
    ORDER BY RANDOM()`,
    [datePrefix + '%', language]
  );

  return mapQuestionsWithFact(result);
}

/**
 * Get random unanswered questions for mixed trivia
 * Returns N random questions that the user hasn't answered yet
 * @param limit Number of questions to return
 * @param language Language filter
 */
export async function getRandomUnansweredQuestions(
  limit: number,
  language: string
): Promise<QuestionWithFact[]> {
  const database = await openDatabase();

  const result = await database.getAllAsync<any>(
    `SELECT 
      q.*,
      f.id as fact_id,
      f.title as fact_title,
      f.content as fact_content,
      f.summary as fact_summary,
      f.category as fact_category,
      f.source_url as fact_source_url,
      f.image_url as fact_image_url,
      f.language as fact_language,
      f.created_at as fact_created_at,
      f.last_updated as fact_last_updated,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM questions q
    INNER JOIN facts f ON q.fact_id = f.id
    LEFT JOIN categories c ON f.category = c.slug
    WHERE f.language = ?
    AND q.id NOT IN (
      SELECT DISTINCT question_id FROM question_attempts
    )
    ORDER BY RANDOM()
    LIMIT ?`,
    [language, limit]
  );

  return mapQuestionsWithFact(result);
}

/**
 * Get count of unanswered questions available for mixed trivia
 */
export async function getUnansweredQuestionsCount(language: string): Promise<number> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count 
     FROM questions q
     INNER JOIN facts f ON q.fact_id = f.id
     WHERE f.language = ?
     AND q.id NOT IN (
       SELECT DISTINCT question_id FROM question_attempts
     )`,
    [language]
  );
  return result?.count || 0;
}

/**
 * Get questions for category trivia
 * Returns N random questions from category that haven't been mastered yet
 * @param categorySlug Category to get questions for
 * @param limit Number of questions to return
 * @param language Language filter
 * @param excludeMastered Whether to exclude mastered questions
 */
export async function getQuestionsForCategory(
  categorySlug: string,
  limit: number,
  language: string,
  excludeMastered: boolean = true
): Promise<QuestionWithFact[]> {
  const database = await openDatabase();

  // Get questions from ALL facts in the category (not just shown ones)
  // Questions become available as soon as facts are downloaded
  let query = `
    SELECT 
      q.*,
      f.id as fact_id,
      f.title as fact_title,
      f.content as fact_content,
      f.summary as fact_summary,
      f.category as fact_category,
      f.source_url as fact_source_url,
      f.image_url as fact_image_url,
      f.language as fact_language,
      f.created_at as fact_created_at,
      f.last_updated as fact_last_updated,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM questions q
    INNER JOIN facts f ON q.fact_id = f.id
    LEFT JOIN categories c ON f.category = c.slug
    WHERE f.category = ?
    AND f.language = ?`;

  if (excludeMastered) {
    // Exclude questions that are mastered (3 correct answers in a row)
    // A question is mastered if it has 3+ attempts and the last 3 are all correct
    query += `
    AND q.id NOT IN (
      SELECT q2.id FROM questions q2
      WHERE (
        SELECT COUNT(*) FROM (
          SELECT is_correct FROM question_attempts 
          WHERE question_id = q2.id 
          ORDER BY answered_at DESC 
          LIMIT 3
        ) WHERE is_correct = 1
      ) = 3
      AND (
        SELECT COUNT(*) FROM question_attempts WHERE question_id = q2.id
      ) >= 3
    )`;
  }

  query += `
    ORDER BY RANDOM()
    LIMIT ?`;

  const result = await database.getAllAsync<any>(query, [categorySlug, language, limit]);

  return mapQuestionsWithFact(result);
}

/**
 * Helper function to map query results to QuestionWithFact
 */
function mapQuestionsWithFact(rows: any[]): QuestionWithFact[] {
  return rows.map((row) => {
    const question: QuestionWithFact = {
      id: row.id,
      fact_id: row.fact_id,
      question_type: row.question_type,
      question_text: row.question_text,
      correct_answer: row.correct_answer,
      wrong_answers: row.wrong_answers,
      explanation: row.explanation,
      difficulty: row.difficulty,
    };

    // Map fact data if present
    if (row.fact_title || row.fact_content) {
      question.fact = {
        id: row.fact_id,
        title: row.fact_title,
        content: row.fact_content,
        summary: row.fact_summary,
        category: row.fact_category,
        source_url: row.fact_source_url,
        image_url: row.fact_image_url,
        language: row.fact_language,
        created_at: row.fact_created_at || '',
        last_updated: row.fact_last_updated,
      };

      if (row.category_id) {
        question.fact.categoryData = {
          id: row.category_id,
          name: row.category_name,
          slug: row.category_slug,
          icon: row.category_icon,
          color_hex: row.category_color_hex,
        };
      }
    }

    return question;
  });
}

/**
 * Record a question attempt
 */
export async function recordQuestionAttempt(
  questionId: number,
  isCorrect: boolean,
  triviaMode: 'daily' | 'category' | 'mixed',
  triviaSessionId?: number
): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `INSERT INTO question_attempts (question_id, is_correct, answered_at, trivia_mode, trivia_session_id)
     VALUES (?, ?, ?, ?, ?)`,
    [questionId, isCorrect ? 1 : 0, now, triviaMode, triviaSessionId || null]
  );
}

/**
 * Check if a question has been mastered (answered correctly 3 times in a row)
 * Only returns true if the question still exists in the database
 * Mastery requires the last 3 consecutive attempts to all be correct
 */
export async function isQuestionMastered(questionId: number): Promise<boolean> {
  const database = await openDatabase();
  // Get the last 3 attempts for this question, ordered by most recent first
  // Join with questions table to ensure the question still exists
  const attempts = await database.getAllAsync<{ is_correct: number }>(
    `SELECT qa.is_correct 
     FROM question_attempts qa
     INNER JOIN questions q ON qa.question_id = q.id
     WHERE qa.question_id = ?
     ORDER BY qa.answered_at DESC
     LIMIT 3`,
    [questionId]
  );

  // Mastered if there are at least 3 attempts and all are correct
  if (attempts.length < 3) return false;
  return attempts.every((a) => a.is_correct === 1);
}

/**
 * Get count of mastered questions for a category (answered correctly 3 times in a row)
 * A question is mastered if its last 3 consecutive attempts are all correct
 * Counts ALL questions in the category (not just from shown facts)
 */
export async function getMasteredCountForCategory(
  categorySlug: string,
  language: string
): Promise<number> {
  const database = await openDatabase();
  // Count questions where the last 3 attempts are all correct
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM (
       SELECT q.id
       FROM questions q
       INNER JOIN facts f ON q.fact_id = f.id
       WHERE f.category = ? 
       AND f.language = ?
       AND (
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
     )`,
    [categorySlug, language]
  );
  return result?.count || 0;
}

/**
 * Get total questions count for a category (from ALL facts, not just shown ones)
 */
export async function getTotalQuestionsForCategory(
  categorySlug: string,
  language: string
): Promise<number> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count 
     FROM questions q
     INNER JOIN facts f ON q.fact_id = f.id
     WHERE f.category = ? 
     AND f.language = ?`,
    [categorySlug, language]
  );
  return result?.count || 0;
}

/**
 * Get category progress (mastered vs total)
 */
export async function getCategoryProgress(
  categorySlug: string,
  language: string
): Promise<{ mastered: number; total: number }> {
  const mastered = await getMasteredCountForCategory(categorySlug, language);
  const total = await getTotalQuestionsForCategory(categorySlug, language);
  return { mastered, total };
}

/**
 * Get all categories with trivia progress
 * @param language - The language to filter facts by
 * @param selectedCategories - Optional array of category slugs to filter by (user's selected categories)
 * Returns ALL selected categories with their total questions and mastered count
 * Questions are available from ALL facts (not just shown ones)
 */
export async function getCategoriesWithTriviaProgress(
  language: string,
  selectedCategories?: string[]
): Promise<
  Array<Category & { mastered: number; total: number; answered: number; correct: number }>
> {
  const database = await openDatabase();

  // If no selected categories provided, return empty array
  if (!selectedCategories || selectedCategories.length === 0) {
    return [];
  }

  const placeholders = selectedCategories.map(() => '?').join(', ');

  // Build query that returns ALL selected categories
  // Counts ALL questions from ALL facts in each category (not just shown facts)
  // Mastered = questions answered correctly 3 times in a row (last 3 attempts all correct)
  // Answered = count of unique questions that have been attempted in this category
  // Correct = count of correct answers in this category
  const query = `
    SELECT 
      c.*,
      COALESCE((
        SELECT COUNT(DISTINCT q.id)
        FROM questions q
        INNER JOIN facts f ON q.fact_id = f.id
        WHERE f.category = c.slug 
        AND f.language = ?
      ), 0) as total,
      COALESCE((
        SELECT COUNT(*) FROM (
          SELECT q2.id
          FROM questions q2
          INNER JOIN facts f2 ON q2.fact_id = f2.id
          WHERE f2.category = c.slug 
          AND f2.language = ?
          AND (
            SELECT COUNT(*) FROM (
              SELECT is_correct FROM question_attempts 
              WHERE question_id = q2.id 
              ORDER BY answered_at DESC 
              LIMIT 3
            ) WHERE is_correct = 1
          ) = 3
          AND (
            SELECT COUNT(*) FROM question_attempts WHERE question_id = q2.id
          ) >= 3
        )
      ), 0) as mastered,
      COALESCE((
        SELECT COUNT(*)
        FROM question_attempts qa
        INNER JOIN questions q ON qa.question_id = q.id
        INNER JOIN facts f ON q.fact_id = f.id
        WHERE f.category = c.slug 
        AND f.language = ?
      ), 0) as answered,
      COALESCE((
        SELECT COUNT(*)
        FROM question_attempts qa
        INNER JOIN questions q ON qa.question_id = q.id
        INNER JOIN facts f ON q.fact_id = f.id
        WHERE f.category = c.slug 
        AND f.language = ?
        AND qa.is_correct = 1
      ), 0) as correct
    FROM categories c
    WHERE c.slug IN (${placeholders})
    ORDER BY c.name ASC`;

  const params: any[] = [language, language, language, language, ...selectedCategories];

  const result = await database.getAllAsync<any>(query, params);

  return result.map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    color_hex: row.color_hex,
    mastered: row.mastered || 0,
    total: row.total || 0,
    answered: row.answered || 0,
    correct: row.correct || 0,
  }));
}

// ====== DAILY TRIVIA PROGRESS ======

/**
 * Get daily trivia progress for a specific date
 */
export async function getDailyTriviaProgress(
  dateString: string
): Promise<DailyTriviaProgress | null> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<DailyTriviaProgress>(
    `SELECT * FROM daily_trivia_progress WHERE date = ?`,
    [dateString]
  );
  return result || null;
}

/**
 * Save daily trivia progress
 */
export async function saveDailyTriviaProgress(
  dateString: string,
  totalQuestions: number,
  correctAnswers: number
): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `INSERT OR REPLACE INTO daily_trivia_progress (date, total_questions, correct_answers, completed_at)
     VALUES (?, ?, ?, ?)`,
    [dateString, totalQuestions, correctAnswers, now]
  );
}

/**
 * Get local date in YYYY-MM-DD format
 * Used for daily trivia to properly match the user's local day
 * Note: toISOString() returns UTC date which causes issues in timezones ahead of UTC
 */
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the current daily streak (consecutive days with completed daily trivia)
 */
export async function getDailyStreak(): Promise<number> {
  const database = await openDatabase();

  // Get all completed dates, ordered descending
  const result = await database.getAllAsync<{ date: string }>(
    `SELECT date FROM daily_trivia_progress 
     WHERE completed_at IS NOT NULL
     ORDER BY date DESC`
  );

  if (result.length === 0) return 0;

  // Check if today or yesterday is in the list to start counting
  const today = new Date();
  const todayStr = getLocalDateString(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  const dates = result.map((r) => r.date);

  // Streak must start from today or yesterday
  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
    return 0;
  }

  let streak = 1;
  let currentDate = new Date(dates[0] + 'T12:00:00'); // Use noon to avoid DST issues

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
 * Get count of questions available for daily trivia on a specific date
 */
export async function getDailyTriviaQuestionsCount(
  dateString: string,
  language: string
): Promise<number> {
  const database = await openDatabase();
  const datePrefix = dateString + 'T';

  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count 
     FROM questions q
     INNER JOIN facts f ON q.fact_id = f.id
     WHERE f.shown_in_feed = 1
     AND f.scheduled_date LIKE ?
     AND f.language = ?`,
    [datePrefix + '%', language]
  );

  return result?.count || 0;
}

/**
 * Get overall trivia statistics
 * Only counts attempts for questions that still exist in the database
 * (joins with questions table to filter out orphaned attempts)
 */
export async function getOverallTriviaStats(): Promise<{
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  currentStreak: number;
}> {
  const database = await openDatabase();

  // Join with questions table to only count attempts for questions that still exist
  const stats = await database.getFirstAsync<{
    total_answered: number;
    total_correct: number;
  }>(
    `SELECT 
      COUNT(*) as total_answered,
      SUM(CASE WHEN qa.is_correct = 1 THEN 1 ELSE 0 END) as total_correct
     FROM question_attempts qa
     INNER JOIN questions q ON qa.question_id = q.id`
  );

  const currentStreak = await getDailyStreak();

  const totalAnswered = stats?.total_answered || 0;
  const totalCorrect = stats?.total_correct || 0;
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  return {
    totalAnswered,
    totalCorrect,
    accuracy,
    currentStreak,
  };
}

/**
 * Get total count of mastered questions (answered correctly 3 times in a row)
 * Only counts questions that still exist in the database
 * A question is mastered if its last 3 consecutive attempts are all correct
 */
export async function getTotalMasteredCount(): Promise<number> {
  const database = await openDatabase();
  // Count questions where the last 3 attempts are all correct
  const result = await database.getFirstAsync<{ count: number }>(
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
  return result?.count || 0;
}

/**
 * Get facts for a list of question IDs (used for showing related facts after wrong answers)
 */
export async function getFactsForQuestions(questionIds: number[]): Promise<FactWithRelations[]> {
  if (questionIds.length === 0) return [];

  const database = await openDatabase();
  const placeholders = questionIds.map(() => '?').join(',');

  const result = await database.getAllAsync<any>(
    `SELECT DISTINCT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM facts f
    INNER JOIN questions q ON q.fact_id = f.id
    LEFT JOIN categories c ON f.category = c.slug
    WHERE q.id IN (${placeholders})`,
    questionIds
  );

  return mapFactsWithRelations(result);
}

// ====== TRIVIA SESSIONS ======

export interface TriviaSession {
  id: number;
  trivia_mode: 'daily' | 'category' | 'mixed';
  category_slug: string | null;
  total_questions: number;
  correct_answers: number;
  completed_at: string;
  elapsed_time: number | null;
  best_streak: number | null;
  question_ids: string | null; // JSON array of question IDs
  selected_answers: string | null; // JSON object: {questionId: answerIndex}
}

/**
 * Answer data stored for each question in a session
 */
export interface StoredAnswer {
  index: number; // 0 = correct, 1-3 = wrong_answers[0-2], for true/false: 0=True, 1=False
  correct: boolean; // Whether this answer was correct
}

export interface TriviaSessionWithCategory extends TriviaSession {
  category?: Category;
  // Reconstructed data for result screen display
  questions?: QuestionWithFact[];
  // Stored answer data for each question
  answers?: Record<number, StoredAnswer>;
  // Track which questions are no longer available (deleted)
  unavailableQuestionIds?: number[];
}

/**
 * Save a trivia session result with question IDs and answer data
 * This is language-independent and much smaller than storing full JSON
 *
 * @param questionIds Array of question IDs used in this session
 * @param selectedAnswers Record mapping questionId to StoredAnswer:
 *   - index: 0 = correct answer (or True for T/F), 1-3 = wrong_answers[0-2] (or False for T/F)
 *   - correct: boolean indicating if this answer was correct
 */
export async function saveTriviaSession(
  triviaMode: 'daily' | 'category' | 'mixed',
  totalQuestions: number,
  correctAnswers: number,
  categorySlug?: string,
  elapsedTime?: number,
  bestStreak?: number,
  questionIds?: number[],
  selectedAnswers?: Record<number, StoredAnswer>
): Promise<number> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  // Serialize question IDs and answer data for storage
  const questionIdsJson = questionIds ? JSON.stringify(questionIds) : null;
  const selectedAnswersJson = selectedAnswers ? JSON.stringify(selectedAnswers) : null;

  const result = await database.runAsync(
    `INSERT INTO trivia_sessions (trivia_mode, category_slug, total_questions, correct_answers, completed_at, elapsed_time, best_streak, question_ids, selected_answers)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      triviaMode,
      categorySlug || null,
      totalQuestions,
      correctAnswers,
      now,
      elapsedTime || null,
      bestStreak || null,
      questionIdsJson,
      selectedAnswersJson,
    ]
  );

  return result.lastInsertRowId;
}

/**
 * Get recent trivia sessions with category data
 * Note: This returns basic session info only. Use getTriviaSessionById to get
 * full reconstructed question data for displaying results.
 * @param limit Number of sessions to return (default 10)
 */
export async function getRecentTriviaSessions(
  limit: number = 10
): Promise<TriviaSessionWithCategory[]> {
  const database = await openDatabase();

  const result = await database.getAllAsync<any>(
    `SELECT 
      ts.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug_data,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM trivia_sessions ts
    LEFT JOIN categories c ON ts.category_slug = c.slug
    ORDER BY ts.completed_at DESC
    LIMIT ?`,
    [limit]
  );

  return result.map((row: any) => {
    const session: TriviaSessionWithCategory = {
      id: row.id,
      trivia_mode: row.trivia_mode,
      category_slug: row.category_slug,
      total_questions: row.total_questions,
      correct_answers: row.correct_answers,
      completed_at: row.completed_at,
      elapsed_time: row.elapsed_time,
      best_streak: row.best_streak,
      question_ids: row.question_ids,
      selected_answers: row.selected_answers,
    };

    if (row.category_id) {
      session.category = {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug_data,
        description: row.category_description,
        icon: row.category_icon,
        color_hex: row.category_color_hex,
      };
    }

    return session;
  });
}

/**
 * Get questions by their IDs with full fact data
 * Used to reconstruct session data for display
 * Returns questions in the order of the provided IDs
 */
export async function getQuestionsByIds(questionIds: number[]): Promise<QuestionWithFact[]> {
  if (questionIds.length === 0) return [];

  const database = await openDatabase();
  const placeholders = questionIds.map(() => '?').join(',');

  const result = await database.getAllAsync<any>(
    `SELECT 
      q.*,
      f.id as fact_id,
      f.title as fact_title,
      f.content as fact_content,
      f.summary as fact_summary,
      f.category as fact_category,
      f.source_url as fact_source_url,
      f.image_url as fact_image_url,
      f.language as fact_language,
      f.created_at as fact_created_at,
      f.last_updated as fact_last_updated,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM questions q
    INNER JOIN facts f ON q.fact_id = f.id
    LEFT JOIN categories c ON f.category = c.slug
    WHERE q.id IN (${placeholders})`,
    questionIds
  );

  // Map results and preserve order from questionIds
  const questionsMap = new Map<number, QuestionWithFact>();
  for (const row of result) {
    questionsMap.set(row.id, mapQuestionWithFact(row));
  }

  // Return in original order, filtering out any that weren't found
  return questionIds
    .map((id) => questionsMap.get(id))
    .filter((q): q is QuestionWithFact => q !== undefined);
}

/**
 * Helper to map a single row to QuestionWithFact
 */
function mapQuestionWithFact(row: any): QuestionWithFact {
  const question: QuestionWithFact = {
    id: row.id,
    fact_id: row.fact_id,
    question_type: row.question_type,
    question_text: row.question_text,
    correct_answer: row.correct_answer,
    wrong_answers: row.wrong_answers,
    explanation: row.explanation,
    difficulty: row.difficulty,
  };

  if (row.fact_title || row.fact_content) {
    question.fact = {
      id: row.fact_id,
      title: row.fact_title,
      content: row.fact_content,
      summary: row.fact_summary,
      category: row.fact_category,
      source_url: row.fact_source_url,
      image_url: row.fact_image_url,
      language: row.fact_language,
      created_at: row.fact_created_at || '',
      last_updated: row.fact_last_updated,
    };

    if (row.category_id) {
      question.fact.categoryData = {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        icon: row.category_icon,
        color_hex: row.category_color_hex,
      };
    }
  }

  return question;
}

/**
 * Get a single trivia session by ID with reconstructed question data
 * Fetches questions fresh from the database using stored IDs
 * This ensures content is always in the current app language
 */
export async function getTriviaSessionById(
  sessionId: number
): Promise<TriviaSessionWithCategory | null> {
  const database = await openDatabase();

  const row = await database.getFirstAsync<any>(
    `SELECT 
      ts.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug_data,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM trivia_sessions ts
    LEFT JOIN categories c ON ts.category_slug = c.slug
    WHERE ts.id = ?`,
    [sessionId]
  );

  if (!row) return null;

  const session: TriviaSessionWithCategory = {
    id: row.id,
    trivia_mode: row.trivia_mode,
    category_slug: row.category_slug,
    total_questions: row.total_questions,
    correct_answers: row.correct_answers,
    completed_at: row.completed_at,
    elapsed_time: row.elapsed_time,
    best_streak: row.best_streak,
    question_ids: row.question_ids,
    selected_answers: row.selected_answers,
  };

  if (row.category_id) {
    session.category = {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug_data,
      description: row.category_description,
      icon: row.category_icon,
      color_hex: row.category_color_hex,
    };
  }

  // Reconstruct questions from stored IDs
  if (row.question_ids) {
    try {
      const questionIds: number[] = JSON.parse(row.question_ids);
      const questions = await getQuestionsByIds(questionIds);
      session.questions = questions;

      // Track unavailable questions (deleted from DB)
      const foundIds = new Set(questions.map((q) => q.id));
      session.unavailableQuestionIds = questionIds.filter((id) => !foundIds.has(id));
    } catch (e) {
      console.error('Error reconstructing questions:', e);
    }
  }

  // Parse answer indexes
  if (row.selected_answers) {
    try {
      session.answers = JSON.parse(row.selected_answers);
    } catch (e) {
      console.error('Error parsing selected_answers:', e);
    }
  }

  return session;
}

/**
 * Get count of tests taken this week (Monday to Sunday)
 */
export async function getWeeklyTestsCount(): Promise<number> {
  const database = await openDatabase();

  // Get the start of the current week (Monday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  const weekStart = monday.toISOString();

  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM trivia_sessions
     WHERE completed_at >= ?`,
    [weekStart]
  );

  return result?.count || 0;
}

/**
 * Get count of questions answered this week (Monday to Sunday)
 * Only counts actual answers, not skipped questions
 */
export async function getWeeklyAnsweredCount(): Promise<number> {
  const database = await openDatabase();

  // Get the start of the current week (Monday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  const weekStart = monday.toISOString();

  // Count from question_attempts table to only count actual answers (not skipped)
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM question_attempts
     WHERE answered_at >= ?`,
    [weekStart]
  );

  return result?.count || 0;
}

/**
 * Get stats for today (mastered today, correct today)
 */
export async function getTodayTriviaStats(): Promise<{
  masteredToday: number;
  correctToday: number;
}> {
  const database = await openDatabase();

  // Get start of today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();

  // Get correct answers today
  const correctResult = await database.getFirstAsync<{ count: number }>(
    `SELECT SUM(correct_answers) as count FROM trivia_sessions
     WHERE completed_at >= ?`,
    [todayStart]
  );

  // Get mastered today - questions that reached mastery status today
  // A question is mastered when it gets its 3rd consecutive correct answer
  // We check for questions where the 3rd correct attempt happened today
  const masteredResult = await database.getFirstAsync<{ count: number }>(
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
       AND (
         SELECT answered_at FROM question_attempts 
         WHERE question_id = q.id 
         ORDER BY answered_at DESC 
         LIMIT 1
       ) >= ?
     )`,
    [todayStart]
  );

  return {
    masteredToday: masteredResult?.count || 0,
    correctToday: correctResult?.count || 0,
  };
}

/**
 * Get the best daily streak ever achieved
 */
export async function getBestDailyStreak(): Promise<number> {
  const database = await openDatabase();

  // Get all completed dates, ordered ascending
  const result = await database.getAllAsync<{ date: string }>(
    `SELECT date FROM daily_trivia_progress 
     WHERE completed_at IS NOT NULL
     ORDER BY date ASC`
  );

  if (result.length === 0) return 0;

  let bestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < result.length; i++) {
    const prevDate = new Date(result[i - 1].date + 'T12:00:00');

    // Check if dates are consecutive
    const nextDay = new Date(prevDate);
    nextDay.setDate(prevDate.getDate() + 1);
    const nextDayStr = getLocalDateString(nextDay);

    if (result[i].date === nextDayStr) {
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return bestStreak;
}

/**
 * Get total number of trivia sessions taken
 */
export async function getTotalSessionsCount(): Promise<number> {
  const database = await openDatabase();

  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM trivia_sessions`
  );

  return result?.count || 0;
}

// ====== FACT INTERACTIONS ======

/**
 * Mark a fact as viewed in story view
 * Only sets story_viewed_at if not already set (preserves first view time)
 */
export async function markFactViewedInStory(factId: number): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO fact_interactions (fact_id, story_viewed_at)
     VALUES (?, ?)
     ON CONFLICT(fact_id) DO UPDATE SET
       story_viewed_at = COALESCE(story_viewed_at, excluded.story_viewed_at)`,
    [factId, now]
  );
}

/**
 * Get facts for story view (single category)
 * Returns unseen facts first, then previously viewed facts
 */
export async function getFactsForStory(
  category: string,
  language: string
): Promise<FactWithRelations[]> {
  const database = await openDatabase();
  const result = await database.getAllAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex,
      CASE WHEN fi.story_viewed_at IS NOT NULL THEN 1 ELSE 0 END as is_viewed
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    LEFT JOIN fact_interactions fi ON f.id = fi.fact_id
    WHERE f.category = ? AND f.language = ?
    ORDER BY is_viewed ASC, COALESCE(f.last_updated, f.created_at) DESC`,
    [category, language]
  );
  return mapFactsWithRelations(result);
}

/**
 * Get facts for mixed story view (multiple categories)
 * Returns unseen facts first, then previously viewed facts
 */
export async function getFactsForMixedStory(
  categorySlugs: string[],
  language: string
): Promise<FactWithRelations[]> {
  if (categorySlugs.length === 0) return [];
  const database = await openDatabase();
  const placeholders = categorySlugs.map(() => '?').join(',');
  const result = await database.getAllAsync<any>(
    `SELECT
      f.*,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.description as category_description,
      c.icon as category_icon,
      c.color_hex as category_color_hex,
      CASE WHEN fi.story_viewed_at IS NOT NULL THEN 1 ELSE 0 END as is_viewed
    FROM facts f
    LEFT JOIN categories c ON f.category = c.slug
    LEFT JOIN fact_interactions fi ON f.id = fi.fact_id
    WHERE f.category IN (${placeholders}) AND f.language = ?
    ORDER BY is_viewed ASC, COALESCE(f.last_updated, f.created_at) DESC`,
    [...categorySlugs, language]
  );
  return mapFactsWithRelations(result);
}

/**
 * Get unseen story status for each category
 * Returns a map of category slug → whether it has unseen facts
 */
export async function getUnseenStoryStatus(
  categorySlugs: string[],
  language: string
): Promise<Record<string, boolean>> {
  if (categorySlugs.length === 0) return {};
  const database = await openDatabase();
  const placeholders = categorySlugs.map(() => '?').join(',');
  const result = await database.getAllAsync<{ category: string; unseen_count: number }>(
    `SELECT f.category, COUNT(*) as unseen_count
     FROM facts f
     LEFT JOIN fact_interactions fi ON f.id = fi.fact_id
     WHERE f.category IN (${placeholders})
       AND f.language = ?
       AND fi.story_viewed_at IS NULL
     GROUP BY f.category`,
    [...categorySlugs, language]
  );

  // Build result map - default all to false, then set true for categories with unseen facts
  const statusMap: Record<string, boolean> = {};
  for (const slug of categorySlugs) {
    statusMap[slug] = false;
  }
  for (const row of result) {
    statusMap[row.category] = row.unseen_count > 0;
  }
  return statusMap;
}

/**
 * Mark a fact's detail view as opened
 * Only sets detail_opened_at if not already set
 */
export async function markFactDetailOpened(factId: number): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO fact_interactions (fact_id, detail_opened_at)
     VALUES (?, ?)
     ON CONFLICT(fact_id) DO UPDATE SET
       detail_opened_at = COALESCE(detail_opened_at, excluded.detail_opened_at)`,
    [factId, now]
  );
}

/**
 * Mark a fact's detail as fully read (scrolled to bottom)
 * Only sets detail_read_at if not already set
 */
export async function markFactDetailRead(factId: number): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO fact_interactions (fact_id, detail_read_at)
     VALUES (?, ?)
     ON CONFLICT(fact_id) DO UPDATE SET
       detail_read_at = COALESCE(detail_read_at, excluded.detail_read_at)`,
    [factId, now]
  );
}

/**
 * Add time spent in fact detail view
 * Accumulates seconds across multiple opens
 */
export async function addFactDetailTimeSpent(factId: number, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  const database = await openDatabase();
  await database.runAsync(
    `INSERT INTO fact_interactions (fact_id, detail_time_spent)
     VALUES (?, ?)
     ON CONFLICT(fact_id) DO UPDATE SET
       detail_time_spent = detail_time_spent + excluded.detail_time_spent`,
    [factId, seconds]
  );
}

// ====== DEV TOOLS ======

/**
 * Mark all facts as viewed in story (DEV tool for testing muted ring state)
 * @param language Optional language filter
 */
export async function markAllFactsViewedInStory(language?: string): Promise<number> {
  const database = await openDatabase();
  const now = new Date().toISOString();
  const query = language
    ? `INSERT INTO fact_interactions (fact_id, story_viewed_at)
       SELECT id, ? FROM facts WHERE language = ?
       ON CONFLICT(fact_id) DO UPDATE SET
         story_viewed_at = COALESCE(story_viewed_at, excluded.story_viewed_at)`
    : `INSERT INTO fact_interactions (fact_id, story_viewed_at)
       SELECT id, ? FROM facts
       ON CONFLICT(fact_id) DO UPDATE SET
         story_viewed_at = COALESCE(story_viewed_at, excluded.story_viewed_at)`;
  const result = await database.runAsync(query, language ? [now, language] : [now]);
  return result.changes;
}

// ====== SHARE EVENTS ======

/**
 * Record a successful share event for badge tracking
 */
export async function recordShareEvent(factId: number): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO share_events (fact_id, shared_at) VALUES (?, ?)`,
    [factId, now]
  );
}

/**
 * Update a fact's title (DEV tool for screenshots)
 * @param factId The ID of the fact to update
 * @param newTitle The new title to set
 */
export async function updateFactTitle(factId: number, newTitle: string): Promise<void> {
  const database = await openDatabase();
  await database.runAsync('UPDATE facts SET title = ? WHERE id = ?', [newTitle, factId]);
}

/**
 * Clear all shown_in_feed flags and scheduled dates (DEV tool for screenshots)
 * This effectively clears the feed for fresh screenshot manipulation
 */
export async function clearAllShownInFeed(): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    'UPDATE facts SET shown_in_feed = 0, scheduled_date = NULL, notification_id = NULL'
  );
}
