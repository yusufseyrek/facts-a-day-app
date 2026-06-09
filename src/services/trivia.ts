/**
 * Trivia Service
 *
 * Handles trivia game logic including:
 * - Daily Trivia: Questions from facts shown today
 * - Category Mastery: Master all questions in a category
 * - Progress tracking and statistics
 * - Gamification elements (streaks, mastery)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { HINT_LIMITS, STORAGE_KEYS } from '../config/app';
import { TIME_PER_QUESTION, TRIVIA_QUESTIONS } from '../config/trivia';

import * as api from './api';
import { checkAndAwardBadges } from './badges';
import * as database from './database';
import { getAnsweredQuestionIds, mapApiFactToRelations } from './database';
import * as onboardingService from './onboarding';
import { getIsPremium } from './premiumState';

import type { TriviaQuestionResponse } from './api';
import type {
  Category,
  DailyTriviaProgress,
  Question,
  QuestionWithFact,
  StoredAnswer,
  TriviaSessionWithCategory,
} from './database';

/**
 * Map API trivia questions to the QuestionWithFact shape the UI consumes,
 * hydrating each question's fact (image, content, category) via /api/facts/by-ids.
 * The trivia endpoints return question text + fact attribution but not the full
 * fact, so the game card background + results need a hydration pass.
 */
async function hydrateTriviaQuestions(
  apiQuestions: TriviaQuestionResponse[],
  language: string
): Promise<QuestionWithFact[]> {
  if (apiQuestions.length === 0) return [];

  const factIds = Array.from(new Set(apiQuestions.map((q) => q.fact_id)));
  const facts = await api.getFactsByIds(factIds, language);
  const factById = new Map(facts.map((f) => [f.id, mapApiFactToRelations(f)]));

  return apiQuestions.map((q) => ({
    id: q.id,
    fact_id: q.fact_id,
    question_type: q.question_type,
    question_text: q.question_text,
    correct_answer: q.correct_answer,
    // Local Question.wrong_answers is a JSON string; API returns an array.
    wrong_answers: q.wrong_answers ? JSON.stringify(q.wrong_answers) : null,
    explanation: q.explanation,
    difficulty: q.difficulty,
    fact: factById.get(q.fact_id),
  }));
}

// Re-export types
export type { StoredAnswer, TriviaSession, TriviaSessionWithCategory } from './database';

// Re-export constants for backwards compatibility
export const DAILY_TRIVIA_QUESTIONS = TRIVIA_QUESTIONS.DAILY;
export const MIXED_TRIVIA_QUESTIONS = TRIVIA_QUESTIONS.MIXED;
export const CATEGORY_TRIVIA_QUESTIONS = TRIVIA_QUESTIONS.CATEGORY;

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

// Re-export TIME_PER_QUESTION for backwards compatibility
export { TIME_PER_QUESTION } from '../config/trivia';

// Calculate estimated time for a quiz in minutes
export function getEstimatedTimeMinutes(questionCount: number): number {
  const totalSeconds = questionCount * TIME_PER_QUESTION.AVERAGE;
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
  answeredThisWeek: number;
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
 * Get questions for today's daily trivia. Server-defined: questions drawn from
 * facts CREATED today (the backend has no per-user "seen" log), the same set
 * for everyone. Excludes questions the user already answered.
 */
export async function getDailyTriviaQuestions(language: string): Promise<QuestionWithFact[]> {
  const answered = await getAnsweredQuestionIds();
  const questions = await api.getTriviaDaily(language, DAILY_TRIVIA_QUESTIONS, answered);
  return hydrateTriviaQuestions(questions, language);
}

/**
 * Number of questions available for today's daily trivia (cheap: just the
 * question list length from the API).
 */
export async function getDailyTriviaQuestionsCount(language: string): Promise<number> {
  const answered = await getAnsweredQuestionIds();
  const questions = await api.getTriviaDaily(language, DAILY_TRIVIA_QUESTIONS, answered);
  return questions.length;
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
 * Get the current trivia streak (consecutive days with any completed trivia session)
 */
export async function getDailyStreak(): Promise<number> {
  return database.getAnyTriviaStreak();
}

// ====== MIXED TRIVIA ======

/**
 * Get questions for a mixed trivia session: N random questions the user hasn't
 * answered yet (exclude set comes from local attempt history).
 */
export async function getMixedTriviaQuestions(language: string): Promise<QuestionWithFact[]> {
  const answered = await getAnsweredQuestionIds();
  const questions = await api.getTriviaRandom(language, MIXED_TRIVIA_QUESTIONS, answered);
  return hydrateTriviaQuestions(questions, language);
}

/**
 * Number of unanswered questions available for mixed trivia (the API caps a
 * single batch, so this reports the size of one fetch — enough to enable/disable
 * the entry point).
 */
export async function getMixedTriviaQuestionsCount(language: string): Promise<number> {
  const answered = await getAnsweredQuestionIds();
  const questions = await api.getTriviaRandom(language, MIXED_TRIVIA_QUESTIONS, answered);
  return questions.length;
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
  const answered = await getAnsweredQuestionIds();
  const questions = await api.getTriviaCategory(categorySlug, language, limit, answered);
  return hydrateTriviaQuestions(questions, language);
}

/**
 * Get the user's selected categories for the trivia category list.
 *
 * The "mastered N of TOTAL" / accuracy-per-category progress depended on the
 * full local question catalog (total pool) and a question→category map, both of
 * which lived in the removed local mirror. Those stats are no longer computable
 * client-side, so progress fields are zeroed — the category cards still render
 * for play, but the per-category progress bars are not shown.
 */
export async function getCategoriesWithProgress(language: string): Promise<CategoryWithProgress[]> {
  const selectedCategories = await onboardingService.getSelectedCategories();
  const metadata = await api.getMetadata(language);
  return metadata.categories
    .filter((cat) => selectedCategories.includes(cat.slug))
    .map((cat) => ({
      ...(cat as Category),
      mastered: 0,
      total: 0,
      answered: 0,
      correct: 0,
      accuracy: 0,
      isComplete: false,
    }));
}

// ====== QUESTION ATTEMPTS ======

/**
 * Record an answer to a question
 */
export async function recordAnswer(
  questionId: number,
  isCorrect: boolean,
  triviaMode: 'daily' | 'category' | 'mixed' | 'quick',
  triviaSessionId?: number
): Promise<void> {
  await database.recordQuestionAttempt(questionId, isCorrect, triviaMode, triviaSessionId);
}

// ====== STATISTICS ======

/**
 * Get overall trivia statistics from local attempt/session history.
 *
 * "Mastered" counts depended on the full local question catalog (removed with
 * the mirror), so they are no longer reported (totalMastered/masteredToday = 0).
 * Everything else is computable from question_attempts / trivia_sessions.
 */
export async function getOverallStats(): Promise<TriviaStats> {
  const [stats, testsTaken, testsThisWeek, answeredThisWeek, todayStats, bestStreak] =
    await Promise.all([
      database.getOverallTriviaStats(),
      database.getTotalSessionsCount(),
      database.getWeeklyTestsCount(),
      database.getWeeklyAnsweredCount(),
      database.getTodayTriviaStats(),
      database.getBestDailyStreak(),
    ]);

  return {
    ...stats,
    bestStreak,
    totalMastered: 0,
    testsTaken,
    testsThisWeek,
    answeredThisWeek,
    masteredToday: 0,
    correctToday: todayStats.correctToday,
  };
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

// ====== ANSWER INDEX HELPERS ======

// Legacy-data shim: translations generated before migration 020 localized the
// true_false correct_answer (e.g. "doğru", "verdadero"). New content stores
// literal "true"/"false", but older rows in user caches may still be localized.
const TRUE_LITERALS = new Set([
  'true',
  'wahr',
  'richtig', // de
  'verdadero',
  'cierto', // es
  'vrai', // fr
  '正しい',
  '正解', // ja
  '참',
  '정답', // ko
  'doğru', // tr
  '正确',
  '正確',
  '对',
  '是', // zh
]);

function isTrueLiteral(value: string): boolean {
  return TRUE_LITERALS.has(value.trim().toLowerCase());
}

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
    return isTrueLiteral(selectedAnswer) ? 0 : 1;
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
    const isCorrectTrue = isTrueLiteral(question.correct_answer);
    return answerIndex === (isCorrectTrue ? 0 : 1);
  }
  // For multiple choice: 0 = correct answer
  return answerIndex === 0;
}

/**
 * Check if a text answer is correct for a question
 * Uses the same index-based logic as isAnswerCorrect for consistency
 * between live game and historical results
 */
export function isTextAnswerCorrect(question: Question, selectedAnswer: string): boolean {
  const index = answerToIndex(question, selectedAnswer);
  return isAnswerCorrect(question, index);
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
  triviaMode: 'daily' | 'category' | 'mixed' | 'quick',
  totalQuestions: number,
  correctAnswers: number,
  categorySlug?: string,
  elapsedTime?: number,
  bestStreak?: number,
  questions?: QuestionWithFact[],
  answers?: Record<number, string>
): Promise<number> {
  // Extract question IDs
  const questionIds = questions?.map((q) => q.id);

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

  const sessionId = await database.saveTriviaSession(
    triviaMode,
    totalQuestions,
    correctAnswers,
    categorySlug,
    elapsedTime,
    bestStreak,
    questionIds,
    selectedAnswers
  );

  // Check for badge unlocks after saving session
  checkAndAwardBadges().catch(() => {});

  return sessionId;
}

/**
 * Get recent trivia sessions with category data
 * Note: This returns basic session info. Use getSessionById for full question data.
 * @param limit Number of sessions to return (default 10)
 */
export async function getRecentSessions(limit: number = 10): Promise<TriviaSessionWithCategory[]> {
  return database.getRecentTriviaSessions(limit);
}

/**
 * Get a single trivia session by ID with its questions hydrated for review.
 *
 * The session stores only question ids + answer indexes locally; the question
 * content (text, answers, fact) and the category display object are fetched
 * from the API/metadata here, in the current app language.
 */
export async function getSessionById(
  sessionId: number,
  language: string = 'en'
): Promise<TriviaSessionWithCategory | null> {
  const session = await database.getTriviaSessionById(sessionId);
  if (!session) return null;

  // Hydrate questions from the stored ids.
  if (session.question_ids) {
    try {
      const questionIds: number[] = JSON.parse(session.question_ids);
      const apiQuestions = await api.getTriviaByIds(questionIds, language);
      session.questions = await hydrateTriviaQuestions(apiQuestions, language);
      const foundIds = new Set(session.questions.map((q) => q.id));
      session.unavailableQuestionIds = questionIds.filter((id) => !foundIds.has(id));
    } catch {
      session.questions = [];
    }
  }

  // Attach the category display object from server metadata (no local table).
  if (session.category_slug) {
    try {
      const meta = await api.getMetadata(language);
      const cat = meta.categories.find((c) => c.slug === session.category_slug);
      if (cat) session.category = cat as Category;
    } catch {
      // category chrome is non-essential for the results screen
    }
  }

  return session;
}

/**
 * Get all trivia sessions for history view
 * Returns all sessions ordered by completed_at DESC
 */
export async function getAllSessions(): Promise<TriviaSessionWithCategory[]> {
  // Use a large limit to get all sessions
  return database.getRecentTriviaSessions(1000);
}

// ====== EXPLANATION HINT ======

interface HintUsage {
  date: string;
  count: number;
}

/**
 * Get the current hint usage for today
 */
async function getHintUsage(): Promise<HintUsage> {
  try {
    const today = getLocalDateString();
    const lastUsedDate = await AsyncStorage.getItem(STORAGE_KEYS.EXPLANATION_HINT_LAST_USED);
    const countStr = await AsyncStorage.getItem(STORAGE_KEYS.EXPLANATION_HINT_COUNT);

    // Reset count if it's a new day
    if (lastUsedDate !== today) {
      return { date: today, count: 0 };
    }

    return { date: today, count: parseInt(countStr || '0', 10) };
  } catch (error) {
    console.error('Error getting hint usage:', error);
    return { date: getLocalDateString(), count: 0 };
  }
}

/**
 * Get the daily hint limit based on premium status
 */
export function getHintLimit(): number {
  return getIsPremium() ? HINT_LIMITS.PREMIUM : HINT_LIMITS.FREE;
}

/**
 * Get the number of remaining hints for today
 */
export async function getRemainingHints(): Promise<number> {
  const usage = await getHintUsage();
  const limit = getHintLimit();
  return Math.max(0, limit - usage.count);
}

/**
 * Check if the user can use the explanation hint today
 * Free users get 1 hint per day, premium users get 3
 */
export async function canUseExplanationHint(): Promise<boolean> {
  try {
    const remaining = await getRemainingHints();
    return remaining > 0;
  } catch (error) {
    console.error('Error checking explanation hint availability:', error);
    return true; // Allow usage on error
  }
}

/**
 * Mark that the explanation hint was used today
 * Call this when the user reveals an explanation
 */
export async function useExplanationHint(): Promise<void> {
  try {
    const today = getLocalDateString();
    const usage = await getHintUsage();

    // If it's a new day, reset count to 1
    const newCount = usage.date === today ? usage.count + 1 : 1;

    await AsyncStorage.setItem(STORAGE_KEYS.EXPLANATION_HINT_LAST_USED, today);
    await AsyncStorage.setItem(STORAGE_KEYS.EXPLANATION_HINT_COUNT, String(newCount));
  } catch (error) {
    console.error('Error saving explanation hint usage:', error);
  }
}

/**
 * Clear all hint usage data
 * Used when resetting onboarding/app state
 */
export async function clearHintUsage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.EXPLANATION_HINT_LAST_USED,
      STORAGE_KEYS.EXPLANATION_HINT_COUNT,
    ]);
  } catch (error) {
    console.error('Error clearing hint usage:', error);
  }
}
