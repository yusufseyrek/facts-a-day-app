/**
 * Preferences Service
 *
 * Handles preference changes (language, categories) with comprehensive
 * data refresh logic including:
 * - Clearing future/unscheduled facts
 * - Preserving delivered facts (scheduled_date <= now)
 * - Updating translations for delivered facts
 * - Downloading new facts from backend
 * - Rescheduling notifications
 */

import * as database from './database';
import * as api from './api';
import * as onboardingService from './onboarding';
import * as notificationService from './notifications';
import { SupportedLocale } from '../i18n/translations';

// Feed refresh listeners for preference changes
type FeedRefreshListener = () => void;
const feedRefreshListeners: Set<FeedRefreshListener> = new Set();

/**
 * Subscribe to feed refresh events triggered by preference changes
 * (language change, categories change)
 */
export function onPreferenceFeedRefresh(listener: FeedRefreshListener): () => void {
  feedRefreshListeners.add(listener);
  return () => {
    feedRefreshListeners.delete(listener);
  };
}

/**
 * Emit feed refresh event to all listeners after preference changes
 */
function emitFeedRefresh(): void {
  console.log('📢 Emitting feed refresh after preference change');
  feedRefreshListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Error in feed refresh listener:', error);
    }
  });
}

export interface RefreshProgress {
  stage: 'clearing' | 'translating' | 'downloading' | 'scheduling' | 'complete';
  percentage: number;
  message: string;
}

export interface RefreshResult {
  success: boolean;
  error?: string;
  factsCount?: number;
}

/**
 * Handle language change - requires full data refresh with translated content
 *
 * Flow:
 * 1. Clear future/unscheduled facts
 * 2. Fetch and update metadata with new language
 * 3. Fetch all facts in new language and update delivered ones
 * 4. Download new facts
 * 5. Reschedule notifications with new language
 */
export async function handleLanguageChange(
  newLanguage: SupportedLocale,
  onProgress?: (progress: RefreshProgress) => void
): Promise<RefreshResult> {
  try {
    const now = new Date().toISOString();

    // Stage 1: Clear future and unscheduled facts
    onProgress?.({
      stage: 'clearing',
      percentage: 10,
      message: 'Preparing database...'
    });

    const db = await database.openDatabase();

    // Delete facts that are:
    // - Not yet delivered (scheduled_date IS NULL OR scheduled_date > now)
    // - Not favorited
    // - Not shown in feed
    await db.runAsync(`
      DELETE FROM facts
      WHERE (scheduled_date IS NULL OR scheduled_date > ?)
        AND id NOT IN (SELECT fact_id FROM favorites)
        AND (shown_in_feed IS NULL OR shown_in_feed = 0)
    `, [now]);

    // Clean up orphaned questions (questions whose facts were deleted)
    // This handles cases where foreign key cascade wasn't enabled
    await db.runAsync(`
      DELETE FROM questions
      WHERE fact_id NOT IN (SELECT id FROM facts)
    `);

    // Get IDs of facts to update (delivered, favorited, or shown facts)
    const factsToPreserve = await db.getAllAsync<{ id: number }>(
      `SELECT id FROM facts WHERE
        (scheduled_date IS NOT NULL AND scheduled_date <= ?)
        OR id IN (SELECT fact_id FROM favorites)
        OR shown_in_feed = 1`,
      [now]
    );

    console.log(`Preserving ${factsToPreserve.length} facts (delivered, favorited, or shown)`);

    // Stage 2: Fetch translated metadata
    onProgress?.({
      stage: 'translating',
      percentage: 30,
      message: 'Loading categories...'
    });

    const metadata = await api.getMetadata(newLanguage);
    await database.insertCategories(metadata.categories);

    // Stage 3: Download ALL facts to find translations for delivered ones + new facts
    onProgress?.({
      stage: 'downloading',
      percentage: 40,
      message: 'Downloading facts...'
    });

    const categories = await onboardingService.getSelectedCategories();

    const allFacts = await api.getAllFactsWithRetry(
      newLanguage,
      categories.join(','),
      (downloaded, total) => {
        const progress = 40 + (downloaded / total) * 50; // 40-90%
        onProgress?.({
          stage: 'downloading',
          percentage: Math.round(progress),
          message: `Downloading facts (${downloaded}/${total})...`
        });
      },
      3, // maxRetries
      true // includeQuestions
    );

    // Stage 4: Process facts - update preserved ones, insert new ones
    console.log(`Processing ${allFacts.length} facts`);

    const preservedIds = new Set(factsToPreserve.map((f: { id: number }) => f.id));
    let updatedCount = 0;
    let insertedCount = 0;

    await db.withTransactionAsync(async () => {
      for (const fact of allFacts) {
        if (preservedIds.has(fact.id)) {
          // Update existing preserved fact with translation (keep scheduling info)
          await db.runAsync(`
            UPDATE facts
            SET title = ?, content = ?, summary = ?, language = ?
            WHERE id = ?
          `, [
            fact.title || null,
            fact.content,
            fact.summary || null,
            newLanguage,
            fact.id
          ]);
          updatedCount++;
        } else {
          // Insert new fact, preserving any existing scheduling info
          await db.runAsync(`
            INSERT INTO facts (
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
              shown_in_feed = facts.shown_in_feed
          `, [
            fact.id,
            fact.title || null,
            fact.content,
            fact.summary || null,
            fact.category || null,
            fact.source_url || null,
            fact.image_url || null,
            fact.language,
            fact.created_at,
            fact.last_updated || fact.created_at
          ]);
          insertedCount++;
        }
      }
    });

    console.log(`Updated ${updatedCount} preserved facts, inserted ${insertedCount} new facts`);

    // Extract and insert questions for trivia feature
    const dbQuestions: database.Question[] = [];
    for (const fact of allFacts) {
      if (fact.questions && fact.questions.length > 0) {
        for (const question of fact.questions) {
          dbQuestions.push({
            id: question.id,
            fact_id: fact.id,
            question_type: question.question_type,
            question_text: question.question_text,
            correct_answer: question.correct_answer,
            wrong_answers: question.wrong_answers ? JSON.stringify(question.wrong_answers) : null,
            explanation: question.explanation,
            difficulty: question.difficulty,
          });
        }
      }
    }

    if (dbQuestions.length > 0) {
      await database.insertQuestions(dbQuestions);
      console.log(`🧠 Synced ${dbQuestions.length} questions for trivia`);
    }

    // Stage 5: Reschedule notifications with new language
    onProgress?.({
      stage: 'scheduling',
      percentage: 95,
      message: 'Setting up notifications...'
    });

    // Get notification times (supports multiple times for premium users)
    const notificationTimes = await onboardingService.getNotificationTimes();
    if (notificationTimes && notificationTimes.length > 0) {
      const times = notificationTimes.map(t => new Date(t));
      
      // Clear all existing notifications and reschedule with new language
      await notificationService.scheduleNotifications(times, newLanguage);
    }

    onProgress?.({
      stage: 'complete',
      percentage: 100,
      message: 'Language updated successfully!'
    });

    // Notify listeners to refresh the feed with new language content
    emitFeedRefresh();

    return { success: true, factsCount: allFacts.length };
  } catch (error) {
    console.error('Error handling language change:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update language'
    };
  }
}

/**
 * Handle categories change - requires downloading new facts
 *
 * Flow:
 * 1. Clear future/unscheduled facts
 * 2. Get IDs of shown facts to preserve
 * 3. Download new facts matching new categories
 * 4. Update shown facts, insert new ones
 * 5. Refresh notification schedule
 */
export async function handleCategoriesChange(
  newCategories: string[],
  currentLanguage: SupportedLocale,
  onProgress?: (progress: RefreshProgress) => void
): Promise<RefreshResult> {
  try {
    const now = new Date().toISOString();

    // Stage 1: Clear future and unscheduled facts (preserve favorites and shown)
    onProgress?.({
      stage: 'clearing',
      percentage: 10,
      message: 'Clearing old facts...'
    });

    const db = await database.openDatabase();

    // Delete facts that are:
    // - Not yet delivered (scheduled_date IS NULL OR scheduled_date > now)
    // - Not favorited
    // - Not shown in feed
    await db.runAsync(`
      DELETE FROM facts
      WHERE (scheduled_date IS NULL OR scheduled_date > ?)
        AND id NOT IN (SELECT fact_id FROM favorites)
        AND (shown_in_feed IS NULL OR shown_in_feed = 0)
    `, [now]);

    // Clean up orphaned questions (questions whose facts were deleted)
    // This handles cases where foreign key cascade wasn't enabled
    await db.runAsync(`
      DELETE FROM questions
      WHERE fact_id NOT IN (SELECT id FROM facts)
    `);

    // Get IDs of shown facts to preserve (keeps scheduling info intact)
    const shownFacts = await db.getAllAsync<{ id: number }>(
      `SELECT id FROM facts WHERE shown_in_feed = 1`
    );
    const shownIds = new Set(shownFacts.map((f: { id: number }) => f.id));

    console.log(`Preserving ${shownIds.size} shown facts`);

    // Stage 2: Download new facts
    onProgress?.({
      stage: 'downloading',
      percentage: 30,
      message: 'Downloading new facts...'
    });

    const newFacts = await api.getAllFactsWithRetry(
      currentLanguage,
      newCategories.join(','),
      (downloaded, total) => {
        const progress = 30 + (downloaded / total) * 60; // 30-90%
        onProgress?.({
          stage: 'downloading',
          percentage: Math.round(progress),
          message: `Downloading facts (${downloaded}/${total})...`
        });
      },
      3, // maxRetries
      true // includeQuestions
    );

    // Stage 3: Process facts - update shown ones (keep shown_in_feed), insert new ones
    console.log(`Processing ${newFacts.length} facts`);

    let updatedCount = 0;
    let insertedCount = 0;

    await db.withTransactionAsync(async () => {
      for (const fact of newFacts) {
        if (shownIds.has(fact.id)) {
          // Update existing shown fact (keep shown_in_feed, scheduled_date, notification_id)
          await db.runAsync(`
            UPDATE facts
            SET title = ?, content = ?, summary = ?, category = ?,
                source_url = ?, image_url = ?, last_updated = ?
            WHERE id = ?
          `, [
            fact.title || null,
            fact.content,
            fact.summary || null,
            fact.category || null,
            fact.source_url || null,
            fact.image_url || null,
            fact.last_updated || fact.created_at,
            fact.id
          ]);
          updatedCount++;
        } else {
          // Insert new fact, preserving any existing scheduling info
          await db.runAsync(`
            INSERT INTO facts (
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
              shown_in_feed = facts.shown_in_feed
          `, [
            fact.id,
            fact.title || null,
            fact.content,
            fact.summary || null,
            fact.category || null,
            fact.source_url || null,
            fact.image_url || null,
            fact.language,
            fact.created_at,
            fact.last_updated || fact.created_at
          ]);
          insertedCount++;
        }
      }
    });

    console.log(`Updated ${updatedCount} shown facts, inserted ${insertedCount} new facts`);

    // Extract and insert questions for trivia feature
    const dbQuestions: database.Question[] = [];
    for (const fact of newFacts) {
      if (fact.questions && fact.questions.length > 0) {
        for (const question of fact.questions) {
          dbQuestions.push({
            id: question.id,
            fact_id: fact.id,
            question_type: question.question_type,
            question_text: question.question_text,
            correct_answer: question.correct_answer,
            wrong_answers: question.wrong_answers ? JSON.stringify(question.wrong_answers) : null,
            explanation: question.explanation,
            difficulty: question.difficulty,
          });
        }
      }
    }

    if (dbQuestions.length > 0) {
      await database.insertQuestions(dbQuestions);
      console.log(`🧠 Synced ${dbQuestions.length} questions for trivia`);
    }

    // Stage 4: Reschedule notifications (clear and reschedule with new facts)
    // After categories change, old scheduled facts were deleted, so we need a full reschedule
    onProgress?.({
      stage: 'scheduling',
      percentage: 95,
      message: 'Updating notifications...'
    });

    // Get notification times (supports multiple times for premium users)
    const notificationTimes = await onboardingService.getNotificationTimes();
    if (notificationTimes && notificationTimes.length > 0) {
      const times = notificationTimes.map(t => new Date(t));
      
      // Clear all existing notifications and reschedule with new facts
      await notificationService.scheduleNotifications(times, currentLanguage);
    }

    onProgress?.({
      stage: 'complete',
      percentage: 100,
      message: 'Categories updated successfully!'
    });

    // Notify listeners to refresh the feed with new category content
    emitFeedRefresh();

    return { success: true, factsCount: newFacts.length };
  } catch (error) {
    console.error('Error handling categories change:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update categories'
    };
  }
}
