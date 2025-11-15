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

      // Log the database path
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
      reading_time INTEGER,
      word_count INTEGER,
      image_url TEXT,
      language TEXT NOT NULL,
      created_at TEXT NOT NULL,
      scheduled_date TEXT,
      notification_id TEXT,
      last_updated TEXT
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
  reading_time?: number;
  word_count?: number;
  image_url?: string;
  language: string;
  created_at: string;
  last_updated?: string;
  scheduled_date?: string; // ISO date string when fact is scheduled for notification
  notification_id?: string; // Notification ID from expo-notifications
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
      reading_time: row.reading_time,
      word_count: row.word_count,
      image_url: row.image_url,
      language: row.language,
      created_at: row.created_at,
      updated_at: row.updated_at,
      scheduled_date: row.scheduled_date,
      notification_id: row.notification_id,
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
      await database.runAsync(
        `INSERT OR REPLACE INTO facts (
          id, title, content, summary, category,
          source_url, reading_time, word_count, image_url, language, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fact.id,
          fact.title || null,
          fact.content,
          fact.summary || null,
          fact.category || null,
          fact.source_url || null,
          fact.reading_time || null,
          fact.word_count || null,
          fact.image_url || null,
          fact.language,
          fact.created_at,
          fact.updated_at || fact.created_at,
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
      WHERE f.language = ? AND f.scheduled_date IS NULL
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
    WHERE f.scheduled_date IS NULL
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
 * Clear all scheduled facts (reset all scheduling)
 */
export async function clearAllScheduledFacts(): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    "UPDATE facts SET scheduled_date = NULL, notification_id = NULL"
  );
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
 * Get facts that were already delivered via notifications
 * Returns facts from the past 30 days where scheduled_date <= now, ordered by date descending
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
      WHERE f.scheduled_date IS NOT NULL
      AND f.scheduled_date >= ?
      AND f.scheduled_date <= ?
      AND f.language = ?
      ORDER BY f.scheduled_date DESC`,
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
    WHERE f.scheduled_date IS NOT NULL
    AND f.scheduled_date >= ?
    AND f.scheduled_date <= ?
    ORDER BY f.scheduled_date DESC`,
    [cutoffDate, now]
  );
  return mapFactsWithRelations(result);
}
