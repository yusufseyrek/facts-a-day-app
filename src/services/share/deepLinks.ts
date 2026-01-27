/**
 * Deep Links Service
 * Generates deep links and share text for facts
 */

import { Platform } from 'react-native';

import { APP_STORE_ID, PLAY_STORE_ID } from '../../config/app';
import { i18n } from '../../i18n';

import type { ShareableFact } from './types';

const SCHEME = 'factsaday';
const WEBSITE_URL = 'https://factsaday.com';

/**
 * Generate a universal deep link for a fact
 * This URL can be handled by both web and app
 * Includes the current language for proper localization
 */
export function generateDeepLink(factId: number, slug?: string): string {
  const lang = i18n.locale || 'en';
  if (slug) {
    return `${WEBSITE_URL}/${lang}/fact/${factId}/${slug}`;
  }
  return `${WEBSITE_URL}/${lang}/fact/${factId}`;
}

/**
 * Generate a direct app scheme link for a fact
 * Only works if the app is installed
 */
export function generateAppLink(factId: number): string {
  const lang = i18n.locale || 'en';
  return `${SCHEME}://${lang}/fact/${factId}`;
}

/**
 * Get the appropriate app store URL for the current platform
 */
export function getAppStoreUrl(): string {
  return Platform.OS === 'ios'
    ? `https://apps.apple.com/app/id${APP_STORE_ID}`
    : `https://play.google.com/store/apps/details?id=${PLAY_STORE_ID}`;
}

const HASHTAGS = '#DidYouKnow #FactsADay';

/**
 * Generate share text for a fact
 * Includes the fact title, optional deep link, and hashtags
 */
export function generateShareText(fact: ShareableFact, includeDeepLink: boolean = true): string {
  const title = fact.title || fact.content.substring(0, 100) + '...';

  if (includeDeepLink) {
    const deepLink = generateDeepLink(fact.id, fact.slug);
    return `${title}\n\n${deepLink}\n\n${HASHTAGS}`;
  }

  return `${title}\n\n${HASHTAGS}`;
}

/**
 * Generate a shorter share text for platforms with character limits (e.g., Twitter)
 */
export function generateShortShareText(fact: ShareableFact, maxLength: number = 280): string {
  const deepLink = generateDeepLink(fact.id, fact.slug);

  // Calculate available space for title (account for deep link and hashtags)
  const suffix = `\n\n${deepLink}\n\n${HASHTAGS}`;
  const availableLength = maxLength - suffix.length;

  let title = fact.title || fact.content;
  if (title.length > availableLength) {
    title = title.substring(0, availableLength - 3) + '...';
  }

  return `${title}${suffix}`;
}
