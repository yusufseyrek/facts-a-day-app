import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'factsaday.db';

/**
 * Normalize a timestamp to canonical ISO-8601 UTC (e.g. "2026-06-06T00:00:28Z").
 *
 * The backend serves two formats: `updated_at` as ISO-Z, but `created_at` as
 * SQLite space-form ("2026-06-06 00:00:28", no 'T', no zone). We store
 * `last_updated` and use MAX(last_updated) as the delta-sync cursor, so a
 * space-form value would sort BELOW same-instant ISO-Z values (space 0x20 <
 * 'T' 0x54) and pin the cursor in the past — making delta sync re-fetch and
 * "update" facts that never changed. Normalizing on write keeps the cursor
 * monotonic and comparable. Treats space-form as UTC (the backend stores UTC).
 */
export function toIsoUtc(ts: string | undefined | null): string | undefined {
  if (!ts) return undefined;
  // Already ISO with a zone designator — leave as-is.
  if (ts.includes('T') && (ts.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(ts))) {
    return ts;
  }
  // SQLite space-form "YYYY-MM-DD HH:MM:SS[.fff]" → ISO-Z (UTC).
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/);
  if (m) return `${m[1]}T${m[2]}Z`;
  // Unknown shape — return unchanged rather than risk corrupting it.
  return ts;
}

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
      if (__DEV__) console.log('🔄 Initializing database...');

      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

      // Log the database path for testing
      const dbPath = `${FileSystem.Paths.document.uri}SQLite/${DATABASE_NAME}`;
      if (__DEV__) console.log('📁 Database path:', dbPath);

      // WAL mode allows concurrent reads during writes and persists to the
      // database file. busy_timeout makes SQLite retry for up to 5s instead
      // of immediately failing with SQLITE_BUSY on lock contention.
      // foreign_keys enables CASCADE deletes.
      await database.execAsync(
        'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;'
      );

      // Set the db variable before running schema
      db = database;

      await initializeSchema();

      if (__DEV__) console.log('✅ Database initialized successfully');
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

  // The local DB is now a THIN cache for USER DATA only — facts/categories/
  // questions are served on demand from the API. Tables below are keyed by
  // fact_id / question_id integers and carry no fact content.

  // ── favorites ──
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS favorites (
      fact_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL
    );
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at);
  `);

  // ── trivia attempt/session history (question content comes from the API) ──
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
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_attempts_question_id ON question_attempts(question_id);`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_attempts_answered_at ON question_attempts(answered_at);`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_attempts_session_id ON question_attempts(trivia_session_id);`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_attempts_qid_correct_at ON question_attempts(question_id, is_correct, answered_at);`
  );

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS daily_trivia_progress (
      date TEXT PRIMARY KEY,
      total_questions INTEGER NOT NULL,
      correct_answers INTEGER NOT NULL,
      completed_at TEXT
    );
  `);

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
      question_ids TEXT,
      selected_answers TEXT
    );
  `);
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_trivia_sessions_completed_at ON trivia_sessions(completed_at);`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_trivia_sessions_category ON trivia_sessions(category_slug);`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_trivia_sessions_elapsed ON trivia_sessions(elapsed_time);`
  );

  // Sync ledger for the server leaderboard: a row means the session was
  // submitted (or is permanently unsubmittable). A separate table instead of
  // a column so existing installs need no ALTER migration.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trivia_result_sync (
      session_id INTEGER PRIMARY KEY,
      synced_at TEXT NOT NULL
    );
  `);

  // ── fact interactions (story views + detail engagement, for streaks/badges) ──
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS fact_interactions (
      fact_id INTEGER PRIMARY KEY,
      story_viewed_at TEXT,
      detail_opened_at TEXT,
      detail_read_at TEXT,
      detail_time_spent INTEGER DEFAULT 0
    );
  `);
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_fi_story_viewed_at ON fact_interactions(story_viewed_at);`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_fi_detail_read_at ON fact_interactions(detail_read_at);`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_fi_detail_opened_at ON fact_interactions(detail_opened_at);`
  );

  // ── share events ──
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS share_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fact_id INTEGER NOT NULL,
      shared_at TEXT NOT NULL
    );
  `);

  // ── badges ──
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_badges (
      badge_id TEXT NOT NULL,
      star TEXT NOT NULL,
      earned_at TEXT NOT NULL,
      PRIMARY KEY (badge_id, star)
    );
  `);

  // One-time upgrade: drop the old facts mirror + its FKs on user tables.
  await migrateToThinCache();
}

/**
 * Migrate an existing install from the full facts mirror to the thin cache.
 *
 * Idempotent and safe to run on every launch:
 *  - favorites / fact_interactions were created with `FOREIGN KEY → facts(id)`.
 *    Once the facts table is dropped, inserts into them fail under
 *    `foreign_keys = ON`. So if a legacy FK is present, rebuild the table
 *    without it, preserving the rows.
 *  - Then drop the mirror tables (facts/categories/questions/daily_feed_cache).
 * Wrapped in a transaction with FKs off so the rebuild + drops can't cascade.
 */
async function migrateToThinCache(): Promise<void> {
  if (!db) return;

  // Does `favorites` still carry the legacy FK to facts? (Fresh installs won't.)
  let hasLegacyFk = false;
  try {
    const fkList = await db.getAllAsync<{ table: string }>(`PRAGMA foreign_key_list(favorites)`);
    hasLegacyFk = fkList.some((row) => row.table === 'facts');
  } catch {
    hasLegacyFk = false;
  }

  try {
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    await db.withTransactionAsync(async () => {
      if (!db) return;

      if (hasLegacyFk) {
        // Rebuild favorites without the FK.
        await db.execAsync(`
          CREATE TABLE favorites_new (
            fact_id INTEGER PRIMARY KEY,
            created_at TEXT NOT NULL
          );
          INSERT OR IGNORE INTO favorites_new (fact_id, created_at)
            SELECT fact_id, created_at FROM favorites;
          DROP TABLE favorites;
          ALTER TABLE favorites_new RENAME TO favorites;
          CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at);
        `);

        // Rebuild fact_interactions without the FK.
        await db.execAsync(`
          CREATE TABLE fact_interactions_new (
            fact_id INTEGER PRIMARY KEY,
            story_viewed_at TEXT,
            detail_opened_at TEXT,
            detail_read_at TEXT,
            detail_time_spent INTEGER DEFAULT 0
          );
          INSERT OR IGNORE INTO fact_interactions_new
            (fact_id, story_viewed_at, detail_opened_at, detail_read_at, detail_time_spent)
            SELECT fact_id, story_viewed_at, detail_opened_at, detail_read_at, detail_time_spent
            FROM fact_interactions;
          DROP TABLE fact_interactions;
          ALTER TABLE fact_interactions_new RENAME TO fact_interactions;
          CREATE INDEX IF NOT EXISTS idx_fi_story_viewed_at ON fact_interactions(story_viewed_at);
          CREATE INDEX IF NOT EXISTS idx_fi_detail_read_at ON fact_interactions(detail_read_at);
          CREATE INDEX IF NOT EXISTS idx_fi_detail_opened_at ON fact_interactions(detail_opened_at);
        `);
      }

      // Drop the facts mirror (content now comes from the API).
      await db.execAsync(`
        DROP TABLE IF EXISTS facts;
        DROP TABLE IF EXISTS categories;
        DROP TABLE IF EXISTS questions;
        DROP TABLE IF EXISTS daily_feed_cache;
      `);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;').catch(() => {});
  }
}

/**
 * Clear all data from database tables
 */
export async function clearDatabase(): Promise<void> {
  const database = await openDatabase();
  // Thin cache: only user-data tables remain.
  await database.execAsync(`
    DELETE FROM favorites;
    DELETE FROM question_attempts;
    DELETE FROM daily_trivia_progress;
    DELETE FROM trivia_sessions;
    DELETE FROM fact_interactions;
    DELETE FROM share_events;
    DELETE FROM user_badges;
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
  is_premium?: number | boolean;
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
  audio_url?: string;
  is_historical?: number; // 0 or 1
  event_month?: number; // 1-12
  event_day?: number; // 1-31
  event_year?: number;
  metadata?: string; // JSON: { original_event, country }
  language: string;
  created_at: string;
  last_updated?: string;
}

/**
 * Extended Fact interface with joined category data
 */
export interface FactWithRelations extends Fact {
  categoryData?: Category | null;
}

/** Minimal structural type of an API fact (avoids importing api.ts into the DB layer). */
export interface ApiFactShape {
  id: number;
  slug?: string;
  title?: string;
  content: string;
  summary?: string;
  category?: string;
  category_name?: string;
  category_icon?: string;
  category_color_hex?: string;
  source_url?: string;
  image_url?: string;
  audio_url?: string | null;
  is_historical: boolean;
  metadata: {
    month?: number;
    day?: number;
    event_year?: number;
    original_event?: string;
    country?: string;
  } | null;
  language: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Map an API FactResponse to the FactWithRelations shape the UI consumes.
 *
 * The app now fetches facts on demand from the API instead of a local mirror,
 * but the existing carousels/cards/detail all read FactWithRelations. This is
 * the single adapter between the two shapes: API booleans/objects → the local
 * 0/1 + JSON-string conventions, and the inline category_* fields → categoryData
 * (no DB lookup needed — the feed/by-ids endpoints return category attribution).
 */
export function mapApiFactToRelations(api: ApiFactShape): FactWithRelations {
  const fact: FactWithRelations = {
    id: api.id,
    slug: api.slug,
    title: api.title,
    content: api.content,
    summary: api.summary,
    category: api.category,
    source_url: api.source_url,
    image_url: api.image_url,
    audio_url: api.audio_url ?? undefined,
    is_historical: api.is_historical ? 1 : 0,
    event_month: api.metadata?.month,
    event_day: api.metadata?.day,
    event_year: api.metadata?.event_year,
    metadata: api.metadata
      ? JSON.stringify({
          original_event: api.metadata.original_event,
          country: api.metadata.country,
        })
      : undefined,
    language: api.language,
    created_at: api.created_at,
    last_updated: api.updated_at,
  };

  if (api.category) {
    fact.categoryData = {
      // The API doesn't return a numeric category id; the UI keys off slug.
      id: 0,
      name: api.category_name ?? api.category,
      slug: api.category,
      description: '',
      icon: api.category_icon ?? null,
      color_hex: api.category_color_hex ?? null,
      is_premium: false,
    } as Category;
  }

  return fact;
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
 * Get favorited fact ids, newest-favorited first. Reads only the favorites
 * table (no JOIN to facts) so it works without the local facts mirror — the
 * screen hydrates content via api.getFactsByIds.
 */
export async function getFavoriteIds(): Promise<number[]> {
  const database = await openDatabase();
  const rows = await database.getAllAsync<{ fact_id: number }>(
    `SELECT fact_id FROM favorites ORDER BY created_at DESC`
  );
  return rows.map((r) => r.fact_id);
}

export async function getFavoritesCount(): Promise<number> {
  const database = await openDatabase();
  // Favorites are stored as language-agnostic fact IDs; the count is global.
  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM favorites'
  );
  return result?.count || 0;
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

export interface DailyTriviaProgress {
  date: string;
  total_questions: number;
  correct_answers: number;
  completed_at: string | null;
}

export async function recordQuestionAttempt(
  questionId: number,
  isCorrect: boolean,
  triviaMode: 'daily' | 'category' | 'mixed' | 'quick',
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
 * Ids of every question the user has already answered (from local attempt
 * history). Passed to the trivia API as exclude_question_ids so the server
 * doesn't re-serve answered questions — replaces the old local "unanswered"
 * JOIN against the (removed) questions table.
 */
export async function getAnsweredQuestionIds(): Promise<number[]> {
  const database = await openDatabase();
  const rows = await database.getAllAsync<{ question_id: number }>(
    `SELECT DISTINCT question_id FROM question_attempts`
  );
  return rows.map((r) => r.question_id);
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
 * Get the current trivia streak (consecutive days with ANY completed trivia session)
 */
export async function getAnyTriviaStreak(): Promise<number> {
  const database = await openDatabase();

  const result = await database.getAllAsync<{ quiz_date: string }>(
    `SELECT DISTINCT date(completed_at, 'localtime') as quiz_date
     FROM trivia_sessions
     WHERE completed_at IS NOT NULL
     ORDER BY quiz_date DESC
     LIMIT 365`
  );

  if (result.length === 0) return 0;

  const today = new Date();
  const todayStr = getLocalDateString(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  const dates = result.map((r) => r.quiz_date);

  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
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

export async function getOverallTriviaStats(): Promise<{
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  currentStreak: number;
}> {
  const database = await openDatabase();

  // Question CONTENT is no longer stored locally (served from the API), so we
  // count the user's attempts directly. Attempts are the permanent local record
  // of what the user answered, independent of whether the question is cached.
  const stats = await database.getFirstAsync<{
    total_answered: number;
    total_correct: number;
  }>(
    `SELECT
      COUNT(*) as total_answered,
      SUM(CASE WHEN qa.is_correct = 1 THEN 1 ELSE 0 END) as total_correct
     FROM question_attempts qa`
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

// ====== TRIVIA SESSIONS ======

export interface TriviaSession {
  id: number;
  trivia_mode: 'daily' | 'category' | 'mixed' | 'quick';
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
  triviaMode: 'daily' | 'category' | 'mixed' | 'quick',
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
 * Completed sessions not yet recorded on the server leaderboard: no ledger
 * row, a leaderboard-eligible mode, and recent enough to still matter.
 */
export async function getUnsyncedTriviaSessions(
  sinceIso: string,
  limit: number = 10
): Promise<TriviaSession[]> {
  const database = await openDatabase();
  return database.getAllAsync<TriviaSession>(
    `SELECT s.* FROM trivia_sessions s
     LEFT JOIN trivia_result_sync y ON y.session_id = s.id
     WHERE y.session_id IS NULL
       AND s.completed_at >= ?
       AND s.trivia_mode IN ('daily', 'mixed', 'category')
     ORDER BY s.completed_at ASC
     LIMIT ?`,
    [sinceIso, limit]
  );
}

/** Mark a session as submitted (or permanently unsubmittable). */
export async function markTriviaSessionSynced(sessionId: number): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO trivia_result_sync (session_id, synced_at) VALUES (?, ?)`,
    [sessionId, new Date().toISOString()]
  );
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

  // Sessions store category_slug directly; the category display object is
  // attached by the trivia service from server metadata (no local categories
  // table in the thin cache).
  const result = await database.getAllAsync<any>(
    `SELECT * FROM trivia_sessions ORDER BY completed_at DESC LIMIT ?`,
    [limit]
  );

  return result.map((row: any) => ({
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
  }));
}

export async function getTriviaSessionById(
  sessionId: number
): Promise<TriviaSessionWithCategory | null> {
  const database = await openDatabase();

  // Lean read: just the stored session. Question content (from the API) and the
  // category display object (from metadata) are hydrated by the trivia service —
  // the local questions/categories tables no longer exist.
  const row = await database.getFirstAsync<any>(`SELECT * FROM trivia_sessions WHERE id = ?`, [
    sessionId,
  ]);

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

  // Parse answer indexes (question content is hydrated in the service layer).
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

  // Get mastered today - questions that reached mastery status today.
  // A question is mastered when its last 3 attempts are all correct; we count
  // it as "today" when its most recent attempt happened today. Question CONTENT
  // is no longer stored locally, so we derive the candidate question IDs from
  // the attempts table (the user's permanent record) instead of `questions`.
  const masteredResult = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM (
       SELECT DISTINCT qa.question_id AS id
       FROM question_attempts qa
       WHERE (
         SELECT COUNT(*) FROM (
           SELECT is_correct FROM question_attempts
           WHERE question_id = qa.question_id
           ORDER BY answered_at DESC
           LIMIT 3
         ) WHERE is_correct = 1
       ) = 3
       AND (
         SELECT COUNT(*) FROM question_attempts WHERE question_id = qa.question_id
       ) >= 3
       AND (
         SELECT answered_at FROM question_attempts
         WHERE question_id = qa.question_id
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
 * Set of fact ids the user has already viewed in a story (local interaction
 * log). Stories are now fed from the API; the client uses this to order unseen
 * facts first, replacing the old local is_viewed JOIN.
 */
export async function getViewedStoryFactIds(): Promise<Set<number>> {
  const database = await openDatabase();
  const rows = await database.getAllAsync<{ fact_id: number }>(
    `SELECT fact_id FROM fact_interactions WHERE story_viewed_at IS NOT NULL`
  );
  return new Set(rows.map((r) => r.fact_id));
}

/**
 * Whether each category has unseen story facts (drives the glowing gradient
 * ring on the story buttons). Deciding this precisely needed a local facts
 * JOIN (compare a category's total facts against the locally-viewed set), but
 * facts are now served from the API and aren't stored locally — we can't know
 * a category's remote total here. So every category reports "has unseen"
 * (true) and the ring always glows, which matches the render-layer fallback
 * (`unseenStatus[slug] ?? true`) and keeps the stories looking active.
 */
export async function getUnseenStoryStatus(
  categorySlugs: string[],
  _language: string
): Promise<Record<string, boolean>> {
  const statusMap: Record<string, boolean> = {};
  for (const slug of categorySlugs) statusMap[slug] = true;
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

// ====== SHARE EVENTS ======

/**
 * Record a successful share event for badge tracking
 */
export async function recordShareEvent(factId: number): Promise<void> {
  const database = await openDatabase();
  const now = new Date().toISOString();
  await database.runAsync(`INSERT INTO share_events (fact_id, shared_at) VALUES (?, ?)`, [
    factId,
    now,
  ]);
}
