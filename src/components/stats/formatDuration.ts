import type { TranslationKeys } from '../../i18n/translations';

type T = (key: TranslationKeys, options?: Record<string, string | number>) => string;

/** Format a duration in seconds as a short human string (e.g. "3h 42m", "17m", "38s"). */
export function formatDuration(totalSeconds: number, t: T): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return t('statsSecondsShort', { count: s });
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return t('statsMinutesShort', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (remMinutes === 0) return t('statsHoursShort', { count: hours });
  return t('statsHoursMinutes', { hours, minutes: remMinutes });
}

/** Localized weekday name (Sunday, Monday, …). */
export function formatWeekday(weekday: number, locale: string): string {
  // Use a known Sunday (2024-01-07) as the anchor.
  const anchor = new Date(Date.UTC(2024, 0, 7));
  anchor.setUTCDate(anchor.getUTCDate() + weekday);
  return anchor.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
}

/** Localized hour label (e.g. "9 PM"). */
export function formatHour(hour: number, locale: string): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(locale, { hour: 'numeric' });
}

/** Localized short date label (e.g. "Apr 3"). */
export function formatShortDate(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
