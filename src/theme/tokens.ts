import { hexColors } from './hexColors';

export type ThemeName = 'light' | 'dark';

/**
 * Resolve a `$token` color string (e.g. "$textSecondary") against the current
 * theme's palette. Non-token values pass through untouched. Unknown tokens
 * resolve to undefined (matching the old Tamagui behavior) with a dev warning.
 */
export function resolveColorToken(theme: ThemeName, value: string): string | undefined {
  if (!value.startsWith('$')) return value;
  const token = value.slice(1) as keyof (typeof hexColors)['light'];
  const resolved = hexColors[theme][token];
  if (resolved === undefined && __DEV__) {
    console.warn(`Unknown color token "${value}" — no such key in hexColors.${theme}`);
  }
  return resolved;
}
