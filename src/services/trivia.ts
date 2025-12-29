/**
 * Trivia Service
 * 
 * Handles trivia game logic including:
 * - Daily Trivia: Questions from facts shown today
 * - Category Mastery: Master all questions in a category
 * - Progress tracking and statistics
 * - Gamification elements (streaks, mastery)
 */

import * as database from './database';
import * as onboardingService from './onboarding';
import type { 
  Question, 
  QuestionWithFact, 
  DailyTriviaProgress,
  FactWithRelations,
  Category,
  TriviaSessionWithCategory,
  StoredAnswer,
} from './database';

// Re-export types
export type { TriviaSession, TriviaSessionWithCategory, StoredAnswer } from './database';

// Constants
export const DAILY_TRIVIA_QUESTIONS = 10;
export const MIXED_TRIVIA_QUESTIONS = 10;
export const CATEGORY_TRIVIA_QUESTIONS = 10;

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

// Time per question in seconds (used for estimating quiz duration)
export const TIME_PER_QUESTION = {
  multipleChoice: 60, // 45 seconds for multiple choice questions
  trueFalse: 30,      // 30 seconds for true/false questions
  average: 45,        // Average time used for estimation
} as const;

// Calculate estimated time for a quiz in minutes
export function getEstimatedTimeMinutes(questionCount: number): number {
  const totalSeconds = questionCount * TIME_PER_QUESTION.average;
  return Math.ceil(totalSeconds / 60);
}

// Types
export interface TriviaStats {
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  currentStreak: number;
  bestStreak: number;
  totalMastered: number;
  testsTaken: number;
  testsThisWeek: number;
  masteredToday: number;
  correctToday: number;
}

export interface CategoryWithProgress extends Category {
  mastered: number;
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  isComplete: boolean;
}

export interface TriviaSessionResult {
  totalQuestions: number;
  correctAnswers: number;
  wrongQuestionIds: number[];
}

// ====== DAILY TRIVIA ======

/**
 * Get questions for today's daily trivia
 * Returns questions from facts that were shown to user today
 */
export async function getDailyTriviaQuestions(
  language: string
): Promise<QuestionWithFact[]> {
  const today = getLocalDateString();
  return database.getQuestionsForDailyTrivia(today, language);
}

/**
 * Get the number of questions available for today's daily trivia
 */
export async function getDailyTriviaQuestionsCount(
  language: string
): Promise<number> {
  const today = getLocalDateString();
  return database.getDailyTriviaQuestionsCount(today, language);
}

/**
 * Get today's daily trivia progress
 */
export async function getTodayProgress(): Promise<DailyTriviaProgress | null> {
  const today = getLocalDateString();
  return database.getDailyTriviaProgress(today);
}

/**
 * Check if today's daily trivia is completed
 */
export async function isDailyTriviaCompleted(): Promise<boolean> {
  const progress = await getTodayProgress();
  return progress !== null && progress.completed_at !== null;
}

/**
 * Save today's daily trivia progress
 */
export async function saveDailyProgress(
  totalQuestions: number,
  correctAnswers: number
): Promise<void> {
  const today = getLocalDateString();
  await database.saveDailyTriviaProgress(today, totalQuestions, correctAnswers);
}

/**
 * Get the current daily streak
 */
export async function getDailyStreak(): Promise<number> {
  return database.getDailyStreak();
}

// ====== MIXED TRIVIA ======

/**
 * Get questions for a mixed trivia session
 * Returns N random unanswered questions from the entire database
 */
export async function getMixedTriviaQuestions(
  language: string
): Promise<QuestionWithFact[]> {
  return database.getRandomUnansweredQuestions(MIXED_TRIVIA_QUESTIONS, language);
}

/**
 * Get the number of unanswered questions available for mixed trivia
 */
export async function getMixedTriviaQuestionsCount(
  language: string
): Promise<number> {
  return database.getUnansweredQuestionsCount(language);
}

// ====== CATEGORY TRIVIA ======

/**
 * Get questions for a category trivia session
 * Returns N unmastered questions from the category (default 10 questions)
 */
export async function getCategoryTriviaQuestions(
  categorySlug: string,
  language: string,
  limit: number = CATEGORY_TRIVIA_QUESTIONS
): Promise<QuestionWithFact[]> {
  return database.getQuestionsForCategory(categorySlug, limit, language, true);
}

/**
 * Get all categories with their trivia progress
 * Only returns categories that the user has selected in settings
 */
export async function getCategoriesWithProgress(
  language: string
): Promise<CategoryWithProgress[]> {
  // Get user's selected categories to filter trivia results
  const selectedCategories = await onboardingService.getSelectedCategories();
  const categories = await database.getCategoriesWithTriviaProgress(language, selectedCategories);
  
  return categories.map(cat => ({
    ...cat,
    // Accuracy is correct answers / unique questions answered (as percentage)
    accuracy: cat.answered > 0 ? Math.round((cat.correct / cat.answered) * 100) : 0,
    isComplete: cat.total > 0 && cat.mastered >= cat.total,
  }));
}

/**
 * Get progress for a specific category
 */
export async function getCategoryProgress(
  categorySlug: string,
  language: string
): Promise<{ mastered: number; total: number; isComplete: boolean }> {
  const progress = await database.getCategoryProgress(categorySlug, language);
  return {
    ...progress,
    isComplete: progress.total > 0 && progress.mastered >= progress.total,
  };
}

/**
 * Check if a category is fully mastered
 */
export async function isCategoryComplete(
  categorySlug: string,
  language: string
): Promise<boolean> {
  const progress = await getCategoryProgress(categorySlug, language);
  return progress.isComplete;
}

// ====== QUESTION ATTEMPTS ======

/**
 * Record an answer to a question
 */
export async function recordAnswer(
  questionId: number,
  isCorrect: boolean,
  triviaMode: 'daily' | 'category' | 'mixed',
  triviaSessionId?: number
): Promise<void> {
  await database.recordQuestionAttempt(questionId, isCorrect, triviaMode, triviaSessionId);
}

/**
 * Check if a question has been mastered
 */
export async function isQuestionMastered(questionId: number): Promise<boolean> {
  return database.isQuestionMastered(questionId);
}

// ====== SESSION RESULTS ======

/**
 * Get facts for wrong answers in a session
 * Used to show "Review These Facts" at end of category trivia
 */
export async function getFactsForWrongAnswers(
  wrongQuestionIds: number[]
): Promise<FactWithRelations[]> {
  if (wrongQuestionIds.length === 0) return [];
  return database.getFactsForQuestions(wrongQuestionIds);
}

// ====== STATISTICS ======

/**
 * Get overall trivia statistics
 */
export async function getOverallStats(): Promise<TriviaStats> {
  const [stats, totalMastered, testsTaken, testsThisWeek, todayStats, bestStreak] = await Promise.all([
    database.getOverallTriviaStats(),
    database.getTotalMasteredCount(),
    database.getTotalSessionsCount(),
    database.getWeeklyTestsCount(),
    database.getTodayTriviaStats(),
    database.getBestDailyStreak(),
  ]);
  
  return {
    ...stats,
    bestStreak,
    totalMastered,
    testsTaken,
    testsThisWeek,
    masteredToday: todayStats.masteredToday,
    correctToday: todayStats.correctToday,
  };
}

/**
 * Get total number of questions available for trivia
 * (from facts that have been shown to user)
 */
export async function getTotalAvailableQuestions(
  language: string
): Promise<number> {
  const categories = await database.getCategoriesWithTriviaProgress(language);
  return categories.reduce((sum, cat) => sum + cat.total, 0);
}

/**
 * Get total mastered questions count
 */
export async function getTotalMasteredQuestions(
  language: string
): Promise<number> {
  const categories = await database.getCategoriesWithTriviaProgress(language);
  return categories.reduce((sum, cat) => sum + cat.mastered, 0);
}

// ====== HELPERS ======

/**
 * Parse wrong_answers from JSON string to array
 */
export function parseWrongAnswers(wrongAnswersJson: string | null): string[] {
  if (!wrongAnswersJson) return [];
  try {
    return JSON.parse(wrongAnswersJson);
  } catch {
    return [];
  }
}

/**
 * Get all answer options for a question (shuffled)
 * For true/false questions, always returns ["True", "False"] (to be translated in UI)
 */
export function getShuffledAnswers(question: Question): string[] {
  // For true/false questions, always provide both options in consistent order
  if (question.question_type === 'true_false') {
    return ['True', 'False'];
  }
  
  const wrongAnswers = parseWrongAnswers(question.wrong_answers);
  const allAnswers = [question.correct_answer, ...wrongAnswers];
  
  // Fisher-Yates shuffle
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }
  
  return allAnswers;
}

/**
 * Format accuracy as percentage string
 */
export function formatAccuracy(totalAnswered: number, totalCorrect: number): string {
  if (totalAnswered === 0) return '0%';
  const accuracy = Math.round((totalCorrect / totalAnswered) * 100);
  return `${accuracy}%`;
}

/**
 * Get streak display text
 */
export function getStreakDisplay(streak: number): string {
  if (streak === 0) return '';
  return `🔥 ${streak}`;
}

// ====== ANSWER INDEX HELPERS ======

/**
 * Convert a selected answer text to its storage index
 * Used when saving session results
 * 
 * @param question The question object
 * @param selectedAnswer The selected answer text
 * @returns Answer index: 0 = correct, 1-3 = wrong_answers[0-2], for true/false: 0=True, 1=False
 */
export function answerToIndex(question: Question, selectedAnswer: string): number {
  // For true/false questions
  if (question.question_type === 'true_false') {
    return selectedAnswer.toLowerCase() === 'true' ? 0 : 1;
  }
  
  // For multiple choice: 0 = correct answer
  if (selectedAnswer === question.correct_answer) {
    return 0;
  }
  
  // Find index in wrong answers (1-indexed in our storage)
  const wrongAnswers = parseWrongAnswers(question.wrong_answers);
  const wrongIndex = wrongAnswers.indexOf(selectedAnswer);
  return wrongIndex >= 0 ? wrongIndex + 1 : 0; // Fallback to 0 if not found
}

/**
 * Convert a stored answer index back to the answer text
 * Used when reconstructing session results for display
 * 
 * @param question The question object
 * @param index Answer index: 0 = correct, 1-3 = wrong_answers[0-2], for true/false: 0=True, 1=False
 * @returns The answer text (in current language for true/false when translated)
 */
export function indexToAnswer(question: Question, index: number): string {
  // For true/false questions
  if (question.question_type === 'true_false') {
    return index === 0 ? 'True' : 'False';
  }
  
  // For multiple choice
  if (index === 0) {
    return question.correct_answer;
  }
  
  // Get wrong answer by index (1-indexed)
  const wrongAnswers = parseWrongAnswers(question.wrong_answers);
  return wrongAnswers[index - 1] || question.correct_answer;
}

/**
 * Check if an answer index represents the correct answer
 * @param question The question object
 * @param answerIndex The stored answer index
 */
export function isAnswerCorrect(question: Question, answerIndex: number): boolean {
  if (question.question_type === 'true_false') {
    // For true/false: correct_answer is stored as "True" or "False"
    const isCorrectTrue = question.correct_answer.toLowerCase() === 'true';
    return answerIndex === (isCorrectTrue ? 0 : 1);
  }
  // For multiple choice: 0 = correct answer
  return answerIndex === 0;
}

// ====== SESSION TRACKING ======

/**
 * Save a trivia session result with question IDs and answer data
 * Called when a trivia session is completed
 * 
 * @param questions Array of questions from the session
 * @param answers Record mapping questionId to selected answer TEXT
 *   This will be converted to answer indexes with correctness info for storage
 */
export async function saveSessionResult(
  triviaMode: 'daily' | 'category' | 'mixed',
  totalQuestions: number,
  correctAnswers: number,
  categorySlug?: string,
  elapsedTime?: number,
  bestStreak?: number,
  questions?: QuestionWithFact[],
  answers?: Record<number, string>
): Promise<number> {
  // Extract question IDs
  const questionIds = questions?.map(q => q.id);
  
  // Convert answer texts to StoredAnswer objects with index and correctness
  let selectedAnswers: Record<number, StoredAnswer> | undefined;
  if (questions && answers) {
    selectedAnswers = {};
    for (const question of questions) {
      const answerText = answers[question.id];
      if (answerText !== undefined) {
        const answerIndex = answerToIndex(question, answerText);
        const isCorrect = isAnswerCorrect(question, answerIndex);
        selectedAnswers[question.id] = {
          index: answerIndex,
          correct: isCorrect,
        };
      }
    }
  }
  
  return database.saveTriviaSession(
    triviaMode,
    totalQuestions,
    correctAnswers,
    categorySlug,
    elapsedTime,
    bestStreak,
    questionIds,
    selectedAnswers
  );
}

/**
 * Get recent trivia sessions with category data
 * Note: This returns basic session info. Use getSessionById for full question data.
 * @param limit Number of sessions to return (default 10)
 */
export async function getRecentSessions(
  limit: number = 10
): Promise<TriviaSessionWithCategory[]> {
  return database.getRecentTriviaSessions(limit);
}

/**
 * Get a single trivia session by ID with full data
 */
export async function getSessionById(
  sessionId: number
): Promise<TriviaSessionWithCategory | null> {
  return database.getTriviaSessionById(sessionId);
}

/**
 * Get all trivia sessions for history view
 * Returns all sessions ordered by completed_at DESC
 */
export async function getAllSessions(): Promise<TriviaSessionWithCategory[]> {
  // Use a large limit to get all sessions
  return database.getRecentTriviaSessions(1000);
}

/**
 * Get best daily streak ever achieved
 */
export async function getBestStreak(): Promise<number> {
  return database.getBestDailyStreak();
}

