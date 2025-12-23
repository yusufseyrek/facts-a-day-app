/**
 * Trivia Service
 * 
 * Handles trivia game logic including:
 * - Daily Trivia: Questions from facts shown today
 * - Category Trivia: Master all questions in a category
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
  Category
} from './database';

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
  totalMastered: number;
  testsTaken: number;
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
  triviaMode: 'daily' | 'category' | 'mixed'
): Promise<void> {
  await database.recordQuestionAttempt(questionId, isCorrect, triviaMode);
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
  const stats = await database.getOverallTriviaStats();
  const totalMastered = await database.getTotalMasteredCount();
  // Calculate tests taken: each test has ~10 questions
  const testsTaken = Math.ceil(stats.totalAnswered / MIXED_TRIVIA_QUESTIONS);
  return {
    ...stats,
    totalMastered,
    testsTaken,
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

