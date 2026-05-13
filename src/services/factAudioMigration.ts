/**
 * Fact Audio Migration
 *
 * One-shot full refetch for existing app installs upgrading to the version
 * that supports audio playback. The backend intentionally does NOT bump
 * `facts.updated_at` when writing `audio_url`, so the normal delta sync
 * wouldn't pull facts that only got audio added. This migration forces a
 * single full refetch (scoped to the user's locale + selected categories)
 * to pull every fact with its `audio_url` and upsert into local SQLite.
 *
 * Idempotent and persisted via AsyncStorage flag — runs at most once per
 * device. Fresh installs (which already pull everything during onboarding)
 * mark the flag on completion, so they skip the migration entirely.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import { getLocaleFromCode } from '../i18n';

import { clearGlobalProgress, setGlobalProgress } from './globalProgress';
import { fetchAllFacts, getSelectedCategories } from './onboarding';

const FLAG_KEY = '@audio_migration_v1_done';

export async function isAudioMigrationDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FLAG_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markAudioMigrationDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(FLAG_KEY, '1');
  } catch (err) {
    if (__DEV__) console.warn('[audioMigration] failed to set flag:', err);
  }
}

/**
 * Run the one-shot full refetch for existing users. Safe to call on every
 * launch — exits immediately if already done. Designed to be fire-and-forget
 * during app startup; surfaces progress via the global progress bar.
 */
export async function runAudioMigrationIfNeeded(): Promise<void> {
  if (await isAudioMigrationDone()) return;

  const categories = await getSelectedCategories();
  if (categories.length === 0) {
    // No preferences yet — onboarding hasn't run; nothing to migrate.
    return;
  }

  const deviceLanguage = Localization.getLocales()[0]?.languageCode || 'en';
  const locale = getLocaleFromCode(deviceLanguage);

  if (__DEV__) console.log('[audioMigration] starting full refetch');

  let progressShown = false;
  try {
    const result = await fetchAllFacts(locale, categories, ({ percentage }) => {
      progressShown = true;
      setGlobalProgress(Math.max(0.02, percentage / 100));
    });

    if (result.success) {
      await markAudioMigrationDone();
      if (__DEV__) console.log(`[audioMigration] complete (${result.count} facts upserted)`);
    } else {
      // Don't mark done — retry on next launch.
      console.warn('[audioMigration] fetch failed:', result.error);
    }
  } catch (err) {
    console.warn('[audioMigration] threw:', err);
    // Don't mark done — retry on next launch.
  } finally {
    if (progressShown) {
      setTimeout(() => clearGlobalProgress(), 1000);
    }
  }
}
