/**
 * Random Fact Pre-fetch Service
 *
 * This service pre-fetches a random fact and its image on app cold start,
 * so when the user clicks the random fact button, the fact and image are ready instantly.
 *
 * Flow:
 * 1. On app cold start, call initializeRandomFact() to prepare the first random fact
 * 2. When user clicks random, call consumeRandomFact() which returns the pre-fetched fact
 *    and immediately starts preparing the next one
 * 3. If no pre-fetched fact is available (edge case), falls back to fetching on demand
 */

import { preloadImageToMemoryCache } from '../utils/useFactImage';

import { getRandomFactNotInFeed } from './database';
import { prefetchFactImage } from './images';

import type { FactWithRelations } from './database';

// The pre-fetched random fact, ready to be shown
let nextRandomFact: FactWithRelations | null = null;

// Track if we're currently preparing a fact (to prevent duplicate fetches)
let isPreparing = false;

// Store the locale used for the current pre-fetched fact
let preparedLocale: string | null = null;

// Store the last consumed random fact for instant access by FactDetailModal
// This avoids re-querying the database when navigating to the random fact
let lastConsumedFact: FactWithRelations | null = null;

/**
 * Prepare the next random fact in background.
 * Fetches a random fact (not in feed) and pre-fetches its image.
 *
 * @param locale The language locale for the fact
 */
export async function prepareNextRandomFact(locale: string): Promise<void> {
  if (isPreparing) {
    return; // Already preparing
  }

  isPreparing = true;

  try {
    // Fetch a random fact not shown in feed
    const fact = await getRandomFactNotInFeed(locale);

    if (fact) {
      nextRandomFact = fact;
      preparedLocale = locale;

      // Pre-fetch the image and load into memory cache for instant display
      if (fact.image_url) {
        const localUri = await prefetchFactImage(fact.image_url, fact.id);
        if (localUri) {
          // Pre-populate useFactImage's memory cache so the modal shows instantly
          preloadImageToMemoryCache(fact.id, localUri);
        }
      }
    }
  } catch {
    // Silently fail - user can still get random fact on demand
  } finally {
    isPreparing = false;
  }
}

/**
 * Get and consume the pre-fetched random fact.
 * Returns the fact and immediately starts preparing the next one.
 *
 * @param locale The language locale for the fact
 * @returns The pre-fetched fact, or null if not available
 */
export function consumeRandomFact(locale: string): FactWithRelations | null {
  // Check if we have a pre-fetched fact for the correct locale
  if (nextRandomFact && preparedLocale === locale) {
    const fact = nextRandomFact;

    // Store as last consumed for instant access by FactDetailModal
    lastConsumedFact = fact;

    // Clear the current fact
    nextRandomFact = null;
    preparedLocale = null;

    // Start preparing the next one in background
    prepareNextRandomFact(locale);

    return fact;
  }

  // No pre-fetched fact available, start preparing for next time
  prepareNextRandomFact(locale);

  return null;
}

/**
 * Get and clear the last consumed random fact.
 * Used by FactDetailModal to avoid re-querying the database.
 *
 * @param factId The fact ID to match (ensures we return the correct fact)
 * @returns The last consumed fact if it matches the ID, null otherwise
 */
export function getLastConsumedFact(factId: number): FactWithRelations | null {
  if (lastConsumedFact && lastConsumedFact.id === factId) {
    const fact = lastConsumedFact;
    lastConsumedFact = null; // Clear after consuming
    return fact;
  }
  return null;
}

/**
 * Check if a random fact is ready (without consuming it).
 *
 * @param locale The language locale to check
 * @returns True if a pre-fetched fact is available for the locale
 */
export function isRandomFactReady(locale: string): boolean {
  return nextRandomFact !== null && preparedLocale === locale;
}

/**
 * Initialize the random fact pre-fetch on app cold start.
 * Call this early in the app initialization process.
 *
 * @param locale The language locale for the fact
 */
export function initializeRandomFact(locale: string): void {
  // Fire and forget - don't await
  prepareNextRandomFact(locale).catch(() => {});
}

/**
 * Clear the pre-fetched random fact.
 * Call this when locale changes or when needed.
 */
export function clearRandomFact(): void {
  nextRandomFact = null;
  preparedLocale = null;
  isPreparing = false;
  lastConsumedFact = null;
}
