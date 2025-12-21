import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system";

const DATABASE_NAME = "factsaday.db";

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
      console.log("🔄 Initializing database...");

      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

      // Log the database path for testing
      const dbPath = `${FileSystem.Paths.document.uri}SQLite/${DATABASE_NAME}`;
      console.log("📁 Database path:", dbPath);

      // Set the db variable before running schema
      db = database;

      await initializeSchema();

      console.log("✅ Database initialized successfully");
      return database;
    } catch (error) {
      console.error("❌ Database initialization failed:", error);
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
    throw new Error("Database not initialized");
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

  // ====== QUIZ TABLES ======

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
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS question_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      answered_at TEXT NOT NULL,
      quiz_mode TEXT NOT NULL,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
  `);

  // Create indexes on question_attempts
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_attempts_question_id ON question_attempts(question_id);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_attempts_answered_at ON question_attempts(answered_at);
  `);

  // Create daily_quiz_progress table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS daily_quiz_progress (
      date TEXT PRIMARY KEY,
      total_questions INTEGER NOT NULL,
      correct_answers INTEGER NOT NULL,
      completed_at TEXT
    );
  `);
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
    DELETE FROM daily_quiz_progress;
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

  console.log("Cleared future and unscheduled facts");
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
  const result = await database.getAllAsync<Category>(
    "SELECT * FROM categories ORDER BY name ASC"
  );
  return result;
}

export async function getCategoryBySlug(
  slug: string
): Promise<Category | null> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<Category>(
    "SELECT * FROM categories WHERE slug = ?",
    [slug]
  );
  return result;
}

// ====== FACTS ======

export interface Fact {
  id: number;
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
          id, title, content, summary, category,
          source_url, image_url, language, created_at, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
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

export async function getAllFacts(
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
      WHERE f.language = ?
      ORDER BY f.created_at DESC`,
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
    ORDER BY f.created_at DESC`
  );
  return mapFactsWithRelations(result);
}

export async function getFactById(
  id: number
): Promise<FactWithRelations | null> {
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
      ORDER BY f.created_at DESC`,
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
    ORDER BY f.created_at DESC`,
    [category]
  );
  return mapFactsWithRelations(result);
}

export async function getRandomFact(
  language?: string
): Promise<FactWithRelations | null> {
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

export async function getFactsCount(language?: string): Promise<number> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM facts WHERE language = ?",
      [language]
    );
    return result?.count || 0;
  }

  const result = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM facts"
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
 */
export async function markFactAsScheduled(
  factId: number,
  scheduledDate: string,
  notificationId: string
): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    "UPDATE facts SET scheduled_date = ?, notification_id = ? WHERE id = ?",
    [scheduledDate, notificationId, factId]
  );
}

/**
 * Clear scheduling information for a fact
 */
export async function clearFactScheduling(factId: number): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    "UPDATE facts SET scheduled_date = NULL, notification_id = NULL WHERE id = ?",
    [factId]
  );
}

/**
 * Mark a fact as shown in feed (for immediate display without scheduling)
 */
export async function markFactAsShown(factId: number): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    "UPDATE facts SET shown_in_feed = 1 WHERE id = ?",
    [factId]
  );
}

/**
 * Mark a fact as shown in feed with a specific scheduled_date
 * Used for immediate display (e.g., after onboarding) to properly group by date in feed
 */
export async function markFactAsShownWithDate(factId: number, scheduledDate: string): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    "UPDATE facts SET shown_in_feed = 1, scheduled_date = ? WHERE id = ?",
    [scheduledDate, factId]
  );
}

/**
 * Mark all delivered facts as shown in feed
 * This ensures facts that were delivered while the app was closed get marked as shown
 * @param language Optional language filter
 * @returns Number of facts marked as shown
 */
export async function markDeliveredFactsAsShown(
  language?: string
): Promise<number> {
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
    "UPDATE facts SET scheduled_date = NULL, notification_id = NULL WHERE scheduled_date > ?",
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
    "UPDATE facts SET scheduled_date = NULL, notification_id = NULL WHERE (shown_in_feed IS NULL OR shown_in_feed = 0)"
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
      "UPDATE facts SET scheduled_date = NULL, notification_id = NULL WHERE scheduled_date > ? AND notification_id IS NOT NULL",
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
export async function getScheduledFactsCount(
  language?: string
): Promise<number> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM facts WHERE scheduled_date IS NOT NULL AND language = ?",
      [language]
    );
    return result?.count || 0;
  }

  const result = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM facts WHERE scheduled_date IS NOT NULL"
  );
  return result?.count || 0;
}

/**
 * Get count of future scheduled facts that are pending (not yet shown in feed)
 * These are facts with scheduled_date > now AND shown_in_feed = 0 or NULL
 */
export async function getFutureScheduledFactsCount(
  language?: string
): Promise<number> {
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
export async function getLatestScheduledDate(
  language?: string
): Promise<string | null> {
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
    return result.map(r => r.scheduled_date);
  }

  const result = await database.getAllAsync<{ scheduled_date: string }>(
    `SELECT scheduled_date FROM facts 
     WHERE scheduled_date LIKE ? 
     AND (shown_in_feed IS NULL OR shown_in_feed = 0)
     ORDER BY scheduled_date ASC`,
    [datePrefix + '%']
  );
  return result.map(r => r.scheduled_date);
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

  const params = language 
    ? [now, language, expectedPerDay] 
    : [now, expectedPerDay];

  const result = await database.getAllAsync<{ local_date: string; count: number }>(query, params);

  if (result.length > 0) {
    console.log(`🔔 Found ${result.length} days with excess notifications:`, 
      result.map(r => `${r.local_date}: ${r.count}/${expectedPerDay}`).join(', '));
    return true;
  }

  return false;
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
    return result.map(r => r.scheduled_date);
  }

  const result = await database.getAllAsync<{ scheduled_date: string }>(
    `SELECT scheduled_date FROM facts 
     WHERE scheduled_date >= ? 
     AND scheduled_date < ?
     AND (shown_in_feed IS NULL OR shown_in_feed = 0)
     ORDER BY scheduled_date ASC`,
    [startIso, endIso]
  );
  return result.map(r => r.scheduled_date);
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
    "SELECT fact_id FROM favorites WHERE fact_id = ?",
    [factId]
  );

  if (existing) {
    // Remove from favorites
    await database.runAsync("DELETE FROM favorites WHERE fact_id = ?", [
      factId,
    ]);
    return false;
  } else {
    // Add to favorites
    const now = new Date().toISOString();
    await database.runAsync(
      "INSERT INTO favorites (fact_id, created_at) VALUES (?, ?)",
      [factId, now]
    );
    return true;
  }
}

/**
 * Check if a fact is favorited
 */
export async function isFactFavorited(factId: number): Promise<boolean> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<{ fact_id: number }>(
    "SELECT fact_id FROM favorites WHERE fact_id = ?",
    [factId]
  );
  return !!result;
}

/**
 * Get all favorited facts
 */
export async function getFavorites(
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
    "SELECT COUNT(*) as count FROM favorites"
  );
  return result?.count || 0;
}

// ====== DATE-BASED QUERIES ======

/**
 * Get facts that were already delivered via notifications or marked as shown
 * Returns facts from the past 30 days where (scheduled_date <= now OR shown_in_feed = 1), ordered by date descending
 */
export async function getFactsGroupedByDate(
  language?: string
): Promise<FactWithRelations[]> {
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
export async function searchFacts(
  query: string,
  language?: string
): Promise<FactWithRelations[]> {
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

// ====== QUIZ QUESTIONS ======

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
  quiz_mode: 'daily' | 'category';
}

export interface DailyQuizProgress {
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
 * Get questions for daily quiz - questions from facts shown today
 * @param dateString Date in YYYY-MM-DD format
 * @param language Language filter
 */
export async function getQuestionsForDailyQuiz(
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
      f.language as fact_language,
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
 * Get questions for category quiz
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

  let query = `
    SELECT 
      q.*,
      f.id as fact_id,
      f.title as fact_title,
      f.content as fact_content,
      f.summary as fact_summary,
      f.category as fact_category,
      f.source_url as fact_source_url,
      f.language as fact_language,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      c.icon as category_icon,
      c.color_hex as category_color_hex
    FROM questions q
    INNER JOIN facts f ON q.fact_id = f.id
    LEFT JOIN categories c ON f.category = c.slug
    WHERE f.shown_in_feed = 1
    AND f.category = ?
    AND f.language = ?`;

  if (excludeMastered) {
    // Exclude questions that have at least one correct attempt
    query += `
    AND q.id NOT IN (
      SELECT DISTINCT question_id FROM question_attempts WHERE is_correct = 1
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
        language: row.fact_language,
        created_at: '',
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
  quizMode: 'daily' | 'category'
): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `INSERT INTO question_attempts (question_id, is_correct, answered_at, quiz_mode)
     VALUES (?, ?, ?, ?)`,
    [questionId, isCorrect ? 1 : 0, now, quizMode]
  );
}

/**
 * Check if a question has been mastered (answered correctly at least once)
 */
export async function isQuestionMastered(questionId: number): Promise<boolean> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM question_attempts 
     WHERE question_id = ? AND is_correct = 1`,
    [questionId]
  );
  return (result?.count || 0) > 0;
}

/**
 * Get count of mastered questions for a category
 */
export async function getMasteredCountForCategory(
  categorySlug: string,
  language: string
): Promise<number> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(DISTINCT q.id) as count 
     FROM questions q
     INNER JOIN facts f ON q.fact_id = f.id
     INNER JOIN question_attempts qa ON q.id = qa.question_id
     WHERE f.category = ? 
     AND f.language = ?
     AND f.shown_in_feed = 1
     AND qa.is_correct = 1`,
    [categorySlug, language]
  );
  return result?.count || 0;
}

/**
 * Get total questions count for a category (only from shown facts)
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
     AND f.language = ?
     AND f.shown_in_feed = 1`,
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
 * Get all categories with quiz progress
 */
export async function getCategoriesWithQuizProgress(
  language: string
): Promise<Array<Category & { mastered: number; total: number }>> {
  const database = await openDatabase();
  
  // Get categories that have shown facts with questions
  const result = await database.getAllAsync<any>(
    `SELECT 
      c.*,
      COUNT(DISTINCT q.id) as total,
      COUNT(DISTINCT CASE WHEN qa.is_correct = 1 THEN q.id END) as mastered
    FROM categories c
    INNER JOIN facts f ON f.category = c.slug
    INNER JOIN questions q ON q.fact_id = f.id
    LEFT JOIN question_attempts qa ON q.id = qa.question_id
    WHERE f.language = ?
    AND f.shown_in_feed = 1
    GROUP BY c.id
    HAVING total > 0
    ORDER BY c.name ASC`,
    [language]
  );

  return result.map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    color_hex: row.color_hex,
    mastered: row.mastered || 0,
    total: row.total || 0,
  }));
}

// ====== DAILY QUIZ PROGRESS ======

/**
 * Get daily quiz progress for a specific date
 */
export async function getDailyQuizProgress(
  dateString: string
): Promise<DailyQuizProgress | null> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<DailyQuizProgress>(
    `SELECT * FROM daily_quiz_progress WHERE date = ?`,
    [dateString]
  );
  return result || null;
}

/**
 * Save daily quiz progress
 */
export async function saveDailyQuizProgress(
  dateString: string,
  totalQuestions: number,
  correctAnswers: number
): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `INSERT OR REPLACE INTO daily_quiz_progress (date, total_questions, correct_answers, completed_at)
     VALUES (?, ?, ?, ?)`,
    [dateString, totalQuestions, correctAnswers, now]
  );
}

/**
 * Get the current daily streak (consecutive days with completed daily quiz)
 */
export async function getDailyStreak(): Promise<number> {
  const database = await openDatabase();
  
  // Get all completed dates, ordered descending
  const result = await database.getAllAsync<{ date: string }>(
    `SELECT date FROM daily_quiz_progress 
     WHERE completed_at IS NOT NULL
     ORDER BY date DESC`
  );

  if (result.length === 0) return 0;

  // Check if today or yesterday is in the list to start counting
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const dates = result.map(r => r.date);
  
  // Streak must start from today or yesterday
  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
    return 0;
  }

  let streak = 1;
  let currentDate = new Date(dates[0]);

  for (let i = 1; i < dates.length; i++) {
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

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
 * Get count of questions available for daily quiz on a specific date
 */
export async function getDailyQuizQuestionsCount(
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
 * Get overall quiz statistics
 */
export async function getOverallQuizStats(): Promise<{
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  currentStreak: number;
}> {
  const database = await openDatabase();

  const stats = await database.getFirstAsync<{
    total_answered: number;
    total_correct: number;
  }>(
    `SELECT 
      COUNT(*) as total_answered,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as total_correct
     FROM question_attempts`
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
 * Get facts for a list of question IDs (used for showing related facts after wrong answers)
 */
export async function getFactsForQuestions(
  questionIds: number[]
): Promise<FactWithRelations[]> {
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
