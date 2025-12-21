/**
 * Quiz Service
 * 
 * Handles quiz game logic including:
 * - Daily Quiz: Questions from facts shown today
 * - Category Quiz: Master all questions in a category
 * - Progress tracking and statistics
 * - Gamification elements (streaks, mastery)
 */

import * as database from './database';
import type { 
  Question, 
  QuestionWithFact, 
  DailyQuizProgress,
  FactWithRelations,
  Category
} from './database';

// Constants
export const QUESTIONS_PER_SESSION = 5;

// Types
export interface QuizStats {
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  currentStreak: number;
}

export interface CategoryWithProgress extends Category {
  mastered: number;
  total: number;
  isComplete: boolean;
}

export interface QuizSessionResult {
  totalQuestions: number;
  correctAnswers: number;
  wrongQuestionIds: number[];
}

// ====== DAILY QUIZ ======

/**
 * Get questions for today's daily quiz
 * Returns questions from facts that were shown to user today
 */
export async function getDailyQuizQuestions(
  language: string
): Promise<QuestionWithFact[]> {
  const today = new Date().toISOString().split('T')[0];
  return database.getQuestionsForDailyQuiz(today, language);
}

/**
 * Get the number of questions available for today's daily quiz
 */
export async function getDailyQuizQuestionsCount(
  language: string
): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  return database.getDailyQuizQuestionsCount(today, language);
}

/**
 * Get today's daily quiz progress
 */
export async function getTodayProgress(): Promise<DailyQuizProgress | null> {
  const today = new Date().toISOString().split('T')[0];
  return database.getDailyQuizProgress(today);
}

/**
 * Check if today's daily quiz is completed
 */
export async function isDailyQuizCompleted(): Promise<boolean> {
  const progress = await getTodayProgress();
  return progress !== null && progress.completed_at !== null;
}

/**
 * Save today's daily quiz progress
 */
export async function saveDailyProgress(
  totalQuestions: number,
  correctAnswers: number
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await database.saveDailyQuizProgress(today, totalQuestions, correctAnswers);
}

/**
 * Get the current daily streak
 */
export async function getDailyStreak(): Promise<number> {
  return database.getDailyStreak();
}

// ====== CATEGORY QUIZ ======

/**
 * Get questions for a category quiz session
 * Returns N unmastered questions from the category
 */
export async function getCategoryQuizQuestions(
  categorySlug: string,
  language: string,
  limit: number = QUESTIONS_PER_SESSION
): Promise<QuestionWithFact[]> {
  return database.getQuestionsForCategory(categorySlug, limit, language, true);
}

/**
 * Get all categories with their quiz progress
 */
export async function getCategoriesWithProgress(
  language: string
): Promise<CategoryWithProgress[]> {
  const categories = await database.getCategoriesWithQuizProgress(language);
  
  return categories.map(cat => ({
    ...cat,
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
  quizMode: 'daily' | 'category'
): Promise<void> {
  await database.recordQuestionAttempt(questionId, isCorrect, quizMode);
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
 * Used to show "Review These Facts" at end of category quiz
 */
export async function getFactsForWrongAnswers(
  wrongQuestionIds: number[]
): Promise<FactWithRelations[]> {
  if (wrongQuestionIds.length === 0) return [];
  return database.getFactsForQuestions(wrongQuestionIds);
}

// ====== STATISTICS ======

/**
 * Get overall quiz statistics
 */
export async function getOverallStats(): Promise<QuizStats> {
  return database.getOverallQuizStats();
}

/**
 * Get total number of questions available for quiz
 * (from facts that have been shown to user)
 */
export async function getTotalAvailableQuestions(
  language: string
): Promise<number> {
  const categories = await database.getCategoriesWithQuizProgress(language);
  return categories.reduce((sum, cat) => sum + cat.total, 0);
}

/**
 * Get total mastered questions count
 */
export async function getTotalMasteredQuestions(
  language: string
): Promise<number> {
  const categories = await database.getCategoriesWithQuizProgress(language);
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
 */
export function getShuffledAnswers(question: Question): string[] {
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

