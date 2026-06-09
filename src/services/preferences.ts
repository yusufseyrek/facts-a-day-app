/**
 * Preferences Service
 *
 * Handles language / category preference changes. Facts are now served on
 * demand from the API (no local mirror to re-download and rewrite), so a
 * preference change is just: notify the feed to re-fetch, and re-register the
 * device for push with the new language/categories. The actual preference
 * values are persisted by the onboarding setters the UI calls before these.
 */

import {
  emitFeedRefresh as emitContentFeedRefresh,
  markFeedRefreshPending,
} from './contentRefresh';
import * as notificationService from './notifications';

import type { SupportedLocale } from '../i18n/translations';

// Feed refresh listeners for preference changes
type FeedRefreshListener = () => void;
const feedRefreshListeners: Set<FeedRefreshListener> = new Set();

/**
 * Subscribe to feed refresh events triggered by preference changes
 * (language change, categories change).
 */
export function onPreferenceFeedRefresh(listener: FeedRefreshListener): () => void {
  feedRefreshListeners.add(listener);
  return () => {
    feedRefreshListeners.delete(listener);
  };
}

function emitFeedRefresh(): void {
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
}

/** Notify every feed surface to re-fetch from the API. */
function notifyFeedRefresh(): void {
  emitFeedRefresh();
  emitContentFeedRefresh();
  markFeedRefreshPending();
}

/**
 * Handle a category-selection change: refresh the feed for the new categories
 * and re-register push with the updated category filter.
 */
export async function handleCategoriesChange(
  _newCategories: string[],
  currentLanguage: SupportedLocale,
  onProgress?: (progress: RefreshProgress) => void
): Promise<RefreshResult> {
  try {
    onProgress?.({ stage: 'scheduling', percentage: 90, message: 'Updating notifications...' });
    await notificationService.registerForPush(currentLanguage).catch((e) => {
      console.error('Push re-registration after categories change failed:', e);
    });
    onProgress?.({ stage: 'complete', percentage: 100, message: 'Categories updated successfully!' });
    notifyFeedRefresh();
    return { success: true };
  } catch (error) {
    console.error('Error handling categories change:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update categories',
    };
  }
}
