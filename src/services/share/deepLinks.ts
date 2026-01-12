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
 * Includes the current language for proper localization (only for non-English)
 */
export function generateDeepLink(factId: number): string {
  const lang = i18n.locale || 'en';
  // Only add lang param for non-English locales
  if (lang === 'en') {
    return `${WEBSITE_URL}/fact/${factId}`;
  }
  return `${WEBSITE_URL}/fact/${factId}?lang=${lang}`;
}

/**
 * Generate a direct app scheme link for a fact
 * Only works if the app is installed
 */
export function generateAppLink(factId: number): string {
  return `${SCHEME}://fact/${factId}`;
}

/**
 * Get the appropriate app store URL for the current platform
 */
export function getAppStoreUrl(): string {
  return Platform.OS === 'ios'
    ? `https://apps.apple.com/app/id${APP_STORE_ID}`
    : `https://play.google.com/store/apps/details?id=${PLAY_STORE_ID}`;
}

/**
 * Generate share text for a fact
 * Includes the fact title and optional deep link
 */
export function generateShareText(fact: ShareableFact, includeDeepLink: boolean = true): string {
  const title = fact.title || fact.content.substring(0, 100) + '...';

  if (includeDeepLink) {
    const deepLink = generateDeepLink(fact.id);
    return `${title}\n\n${deepLink}`;
  }

  return title;
}

/**
 * Generate a shorter share text for platforms with character limits (e.g., Twitter)
 */
export function generateShortShareText(fact: ShareableFact, maxLength: number = 280): string {
  const deepLink = generateDeepLink(fact.id);

  // Calculate available space for title
  const suffix = `\n\n${deepLink}`;
  const availableLength = maxLength - suffix.length;

  let title = fact.title || fact.content;
  if (title.length > availableLength) {
    title = title.substring(0, availableLength - 3) + '...';
  }

  return `${title}${suffix}`;
}
