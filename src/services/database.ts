import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'factsaday.db';

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Initialize and open the database
 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) {
    return db;
  }

  db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await initializeSchema();
  await runMigrations();
  return db;
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

  // Create content_types table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS content_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT
    );
  `);

  // Create facts table with updated schema
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY,
      title TEXT,
      content TEXT NOT NULL,
      summary TEXT,
      difficulty TEXT,
      content_type TEXT,
      category TEXT,
      tags TEXT,
      source_url TEXT,
      reading_time INTEGER,
      word_count INTEGER,
      image_url TEXT,
      language TEXT NOT NULL,
      created_at TEXT NOT NULL
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
}

/**
 * Run database migrations
 */
async function runMigrations(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Get current database version
  const versionResult = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = versionResult?.user_version || 0;

  // Migration 1: Add notification scheduling columns
  if (currentVersion < 1) {
    await db.execAsync(`
      ALTER TABLE facts ADD COLUMN scheduled_date TEXT;
      ALTER TABLE facts ADD COLUMN notification_id TEXT;
    `);

    // Create index on scheduled_date for faster queries
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_facts_scheduled_date ON facts(scheduled_date);
    `);

    // Update version
    await db.execAsync('PRAGMA user_version = 1');
    console.log('Database migrated to version 1: Added notification scheduling columns');
  }
}

/**
 * Clear all data from database tables
 */
export async function clearDatabase(): Promise<void> {
  const database = await openDatabase();
  await database.execAsync(`
    DELETE FROM facts;
    DELETE FROM categories;
    DELETE FROM content_types;
  `);
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
    'SELECT * FROM categories ORDER BY name ASC'
  );
  return result;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<Category>(
    'SELECT * FROM categories WHERE slug = ?',
    [slug]
  );
  return result;
}

// ====== CONTENT TYPES ======

export interface ContentType {
  id: number;
  name: string;
  slug: string;
  description?: string;
}

export async function insertContentTypes(contentTypes: ContentType[]): Promise<void> {
  const database = await openDatabase();

  for (const contentType of contentTypes) {
    await database.runAsync(
      `INSERT OR REPLACE INTO content_types (id, name, slug, description)
       VALUES (?, ?, ?, ?)`,
      [
        contentType.id,
        contentType.name,
        contentType.slug,
        contentType.description || null,
      ]
    );
  }
}

export async function getAllContentTypes(): Promise<ContentType[]> {
  const database = await openDatabase();
  const result = await database.getAllAsync<ContentType>(
    'SELECT * FROM content_types ORDER BY name ASC'
  );
  return result;
}

// ====== FACTS ======

export interface Fact {
  id: number;
  title?: string;
  content: string;
  summary?: string;
  difficulty?: string;
  content_type?: string;
  category?: string;
  tags?: string; // JSON string
  source_url?: string;
  reading_time?: number;
  word_count?: number;
  image_url?: string;
  language: string;
  created_at: string;
  scheduled_date?: string; // ISO date string when fact is scheduled for notification
  notification_id?: string; // Notification ID from expo-notifications
}

export async function insertFacts(facts: Fact[]): Promise<void> {
  const database = await openDatabase();

  // Use transaction for better performance with batch inserts
  await database.withTransactionAsync(async () => {
    for (const fact of facts) {
      await database.runAsync(
        `INSERT OR REPLACE INTO facts (
          id, title, content, summary, difficulty, content_type, category,
          tags, source_url, reading_time, word_count, image_url, language, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fact.id,
          fact.title || null,
          fact.content,
          fact.summary || null,
          fact.difficulty || null,
          fact.content_type || null,
          fact.category || null,
          fact.tags || null,
          fact.source_url || null,
          fact.reading_time || null,
          fact.word_count || null,
          fact.image_url || null,
          fact.language,
          fact.created_at,
        ]
      );
    }
  });
}

export async function getAllFacts(language?: string): Promise<Fact[]> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getAllAsync<Fact>(
      'SELECT * FROM facts WHERE language = ? ORDER BY created_at DESC',
      [language]
    );
    return result;
  }

  const result = await database.getAllAsync<Fact>(
    'SELECT * FROM facts ORDER BY created_at DESC'
  );
  return result;
}

export async function getFactById(id: number): Promise<Fact | null> {
  const database = await openDatabase();
  const result = await database.getFirstAsync<Fact>(
    'SELECT * FROM facts WHERE id = ?',
    [id]
  );
  return result;
}

export async function getFactsByCategory(category: string, language?: string): Promise<Fact[]> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getAllAsync<Fact>(
      'SELECT * FROM facts WHERE category = ? AND language = ? ORDER BY created_at DESC',
      [category, language]
    );
    return result;
  }

  const result = await database.getAllAsync<Fact>(
    'SELECT * FROM facts WHERE category = ? ORDER BY created_at DESC',
    [category]
  );
  return result;
}

export async function getRandomFact(language?: string): Promise<Fact | null> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getFirstAsync<Fact>(
      'SELECT * FROM facts WHERE language = ? ORDER BY RANDOM() LIMIT 1',
      [language]
    );
    return result;
  }

  const result = await database.getFirstAsync<Fact>(
    'SELECT * FROM facts ORDER BY RANDOM() LIMIT 1'
  );
  return result;
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
 * @param limit Maximum number of facts to return
 * @param language Optional language filter
 */
export async function getRandomUnscheduledFacts(
  limit: number,
  language?: string
): Promise<Fact[]> {
  const database = await openDatabase();

  if (language) {
    const result = await database.getAllAsync<Fact>(
      'SELECT * FROM facts WHERE language = ? AND scheduled_date IS NULL ORDER BY RANDOM() LIMIT ?',
      [language, limit]
    );
    return result;
  }

  const result = await database.getAllAsync<Fact>(
    'SELECT * FROM facts WHERE scheduled_date IS NULL ORDER BY RANDOM() LIMIT ?',
    [limit]
  );
  return result;
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
    'UPDATE facts SET scheduled_date = ?, notification_id = ? WHERE id = ?',
    [scheduledDate, notificationId, factId]
  );
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
 * Clear all scheduled facts (reset all scheduling)
 */
export async function clearAllScheduledFacts(): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    'UPDATE facts SET scheduled_date = NULL, notification_id = NULL'
  );
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
