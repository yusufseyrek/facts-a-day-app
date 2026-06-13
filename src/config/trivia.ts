/**
 * Trivia Configuration
 *
 * Central configuration for trivia game settings including question counts
 * and timing settings.
 */

/**
 * Number of questions per trivia game mode
 */
export const TRIVIA_QUESTIONS = {
  /** Number of questions for daily trivia */
  DAILY: 10,
  /** Number of questions for mixed trivia */
  MIXED: 10,
  /** Number of questions for category-specific trivia */
  CATEGORY: 10,
} as const;

/**
 * Time per question in seconds (used for estimating quiz duration)
 */
export const TIME_PER_QUESTION = {
  /** Time for multiple choice questions */
  MULTIPLE_CHOICE: 60,
  /** Time for true/false questions */
  TRUE_FALSE: 30,
  /** Average time used for estimation */
  AVERAGE: 45,
} as const;

/**
 * Mirror of the backend leaderboard plausibility floor
 * (MIN_ELAPSED_PER_QUESTION_MS in backend routes/triviaResults.ts: 1500ms). A
 * round averaging under this per question is rejected by the server and never
 * ranked. Kept here so the results screen can warn the player up front instead
 * of relying on the (fire-and-forget) submission outcome.
 */
export const MIN_SECONDS_PER_QUESTION = 1.5;
