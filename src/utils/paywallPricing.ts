/**
 * Pure pricing helpers shared by the premium surfaces (the full `app/paywall`
 * and the compact `app/remove-ads` sheet).
 *
 * This math is bug-prone and only meaningfully verifiable by unit tests — you
 * can't eyeball "$1.15 / week" or "Save 31%" for correctness across currencies
 * on a screenshot. So it lives here, free of React and expo-iap types: it takes
 * plain price sources and returns strings/numbers. See paywallPricing.test.ts.
 */

/** Weeks in an average month (52/12 ≈ 4.33) — converts a monthly price to a per-week rate. */
export const WEEKS_PER_MONTH = 52 / 12;

/**
 * Minimal price-bearing shape, structurally satisfied by both expo-iap's
 * `ProductSubscription` and our `CachedSubscription`, so callers pass either.
 */
export interface PriceLike {
  id: string;
  displayPrice?: string | null;
  price?: number | null;
  subscriptionOffers?: ({ price?: number | null } | null | undefined)[] | null;
}

export interface PriceSources {
  /** Live store products (preferred). */
  subscriptions: PriceLike[];
  /** Last-known prices persisted for instant cold-start render (fallback). */
  cachedPrices: PriceLike[];
}

/**
 * Format a numeric value back into the same currency shape as a source price.
 * "$4.99" + 1.15 → "$1.15"; "14,99 €" + 3.46 → "3,46 €".
 *
 * The numeric portion is always rendered with two decimals (`toFixed(2)`), so
 * zero-decimal currencies (e.g. "￥1,580") gain a ".00" — this mirrors the
 * paywall's long-standing behavior and is asserted in the tests.
 */
export function formatPriceLike(sourceDisplay: string, value: number): string {
  const numericMatch = sourceDisplay.match(/[\d.,]+/);
  if (!numericMatch) return value.toFixed(2);
  const numeric = numericMatch[0];
  const startsWith = sourceDisplay.slice(0, numericMatch.index);
  const endsWith = sourceDisplay.slice((numericMatch.index ?? 0) + numeric.length);

  const usesCommaDecimal = /^[\d.]*,\d{1,2}$/.test(numeric);
  const fixed = value.toFixed(2);
  const formatted = usesCommaDecimal ? fixed.replace('.', ',') : fixed;
  return `${startsWith}${formatted}${endsWith}`;
}

/**
 * Parse a localized price string like "$14.99", "14,99 €", "￥1,580" into a number.
 * Handles both comma-decimal (14,99) and comma-thousand (1,580.00) formats.
 */
export function parseDisplayPrice(displayPrice: string): number | null {
  const digits = displayPrice.replace(/[^\d.,]/g, '');
  // If the last separator is a comma with ≤2 trailing digits, treat comma as the decimal.
  const commaDecimal = digits.match(/^([\d.]*),(\d{1,2})$/);
  if (commaDecimal) {
    const parsed = parseFloat(commaDecimal[1].replace(/\./g, '') + '.' + commaDecimal[2]);
    return isNaN(parsed) ? null : parsed;
  }
  // Otherwise commas are thousand separators.
  const parsed = parseFloat(digits.replace(/,/g, ''));
  return isNaN(parsed) ? null : parsed;
}

/** Display price for a product — live first, cached fallback, "---" when unknown. */
export function getDisplayPrice(productId: string, sources: PriceSources): string {
  const sub = sources.subscriptions.find((s) => s.id === productId);
  if (sub?.displayPrice) return sub.displayPrice;
  const cached = sources.cachedPrices.find((c) => c.id === productId);
  return cached?.displayPrice || '---';
}

/**
 * Numeric price for a product: `price`, then the first offer's price, then a
 * parsed `displayPrice`; falls back to the cached source. null when nothing is
 * available.
 */
export function getNumericPrice(productId: string, sources: PriceSources): number | null {
  const sub = sources.subscriptions.find((s) => s.id === productId);
  if (sub) {
    if (sub.price != null) return sub.price;
    const offerPrice = sub.subscriptionOffers?.[0]?.price;
    if (offerPrice != null) return offerPrice;
    return sub.displayPrice ? parseDisplayPrice(sub.displayPrice) : null;
  }
  const cached = sources.cachedPrices.find((c) => c.id === productId);
  if (cached) {
    if (cached.price != null) return cached.price;
    return cached.displayPrice ? parseDisplayPrice(cached.displayPrice) : null;
  }
  return null;
}

/**
 * Monthly savings vs. paying weekly, as a whole percentage: the monthly price
 * compared against (weekly price × weeks-per-month). Returns null when prices
 * are missing/zero or the monthly plan isn't actually cheaper.
 */
export function monthlySavingsPercent(
  sources: PriceSources,
  ids: { weeklyId: string; monthlyId: string }
): number | null {
  const weeklyPrice = getNumericPrice(ids.weeklyId, sources);
  const monthlyPrice = getNumericPrice(ids.monthlyId, sources);
  if (weeklyPrice == null || monthlyPrice == null || weeklyPrice <= 0) return null;
  const monthlyAtWeeklyRate = weeklyPrice * WEEKS_PER_MONTH;
  const savings = Math.round(((monthlyAtWeeklyRate - monthlyPrice) / monthlyAtWeeklyRate) * 100);
  return savings > 0 ? savings : null;
}

/**
 * Effective per-week price for the monthly plan, in the monthly price's currency
 * shape (e.g. "$1.15"). Returns null when the monthly price is unavailable.
 */
export function monthlyPerWeekDisplay(
  sources: PriceSources,
  ids: { monthlyId: string }
): string | null {
  const monthlyPrice = getNumericPrice(ids.monthlyId, sources);
  const monthlyDisplay = getDisplayPrice(ids.monthlyId, sources);
  if (monthlyPrice == null || monthlyDisplay === '---') return null;
  const perWeek = monthlyPrice / WEEKS_PER_MONTH;
  return formatPriceLike(monthlyDisplay, perWeek);
}