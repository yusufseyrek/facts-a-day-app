/**
 * ISO 3166-1 alpha-2 region code → flag emoji ("TR" → 🇹🇷) via the regional
 * indicator symbols, so no flag assets are needed. Returns '' for anything
 * that isn't two ASCII letters — callers render nothing rather than a broken
 * glyph.
 */
export function countryFlagEmoji(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  const base = 0x1f1e6 - 65; // 'A' → REGIONAL INDICATOR SYMBOL LETTER A
  const upper = code.toUpperCase();
  return (
    String.fromCodePoint(base + upper.charCodeAt(0)) +
    String.fromCodePoint(base + upper.charCodeAt(1))
  );
}
