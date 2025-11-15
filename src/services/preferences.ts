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
  newLanguage: string,
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
    await db.runAsync(`
      DELETE FROM facts
      WHERE scheduled_date IS NULL OR scheduled_date > ?
    `, [now]);

    // Get IDs of facts to update (delivered facts)
    const deliveredFacts = await db.getAllAsync<{ id: number }>(
      'SELECT id FROM facts WHERE scheduled_date IS NOT NULL AND scheduled_date <= ?',
      [now]
    );

    console.log(`Preserving ${deliveredFacts.length} delivered facts`);

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
      }
    );

    // Stage 4: Process facts - update delivered ones, insert new ones
    console.log(`Processing ${allFacts.length} facts`);

    const deliveredIds = new Set(deliveredFacts.map(f => f.id));
    let updatedCount = 0;
    let insertedCount = 0;

    await db.withTransactionAsync(async () => {
      for (const fact of allFacts) {
        if (deliveredIds.has(fact.id)) {
          // Update existing delivered fact with translation (preserve scheduling info)
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
          // Insert new fact
          await db.runAsync(`
            INSERT OR REPLACE INTO facts (
              id, title, content, summary, category,
              source_url, image_url, language, created_at, last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    console.log(`Updated ${updatedCount} delivered facts, inserted ${insertedCount} new facts`);

    // Stage 5: Reschedule notifications with new language
    onProgress?.({
      stage: 'scheduling',
      percentage: 95,
      message: 'Setting up notifications...'
    });

    const notificationTime = await onboardingService.getNotificationTime();
    if (notificationTime) {
      await notificationService.rescheduleNotifications(notificationTime, newLanguage);
    }

    onProgress?.({
      stage: 'complete',
      percentage: 100,
      message: 'Language updated successfully!'
    });

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
 * 2. Download new facts matching new categories
 * 3. Refresh notification schedule
 */
export async function handleCategoriesChange(
  newCategories: string[],
  currentLanguage: string,
  onProgress?: (progress: RefreshProgress) => void
): Promise<RefreshResult> {
  try {
    const now = new Date().toISOString();

    // Stage 1: Clear future and unscheduled facts
    onProgress?.({
      stage: 'clearing',
      percentage: 10,
      message: 'Clearing old facts...'
    });

    const db = await database.openDatabase();
    await db.runAsync(`
      DELETE FROM facts
      WHERE scheduled_date IS NULL OR scheduled_date > ?
    `, [now]);

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
      }
    );

    // Convert and insert new facts
    const dbFacts: database.Fact[] = newFacts.map((fact) => ({
      id: fact.id,
      title: fact.title,
      content: fact.content,
      summary: fact.summary,
      category: fact.category,
      source_url: fact.source_url,
      image_url: fact.image_url,
      language: fact.language,
      created_at: fact.created_at,
      last_updated: fact.last_updated,
    }));

    await database.insertFacts(dbFacts);

    // Stage 3: Refresh notification schedule
    onProgress?.({
      stage: 'scheduling',
      percentage: 95,
      message: 'Updating notifications...'
    });

    const notificationTime = await onboardingService.getNotificationTime();
    if (notificationTime) {
      await notificationService.refreshNotificationSchedule(notificationTime, currentLanguage);
    }

    onProgress?.({
      stage: 'complete',
      percentage: 100,
      message: 'Categories updated successfully!'
    });

    return { success: true, factsCount: newFacts.length };
  } catch (error) {
    console.error('Error handling categories change:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update categories'
    };
  }
}
