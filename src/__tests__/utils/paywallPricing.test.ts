import {
  formatPriceLike,
  getDisplayPrice,
  getNumericPrice,
  monthlyPerWeekDisplay,
  monthlySavingsPercent,
  parseDisplayPrice,
  type PriceSources,
  WEEKS_PER_MONTH,
} from '../../utils/paywallPricing';

const WEEKLY = 'factsaday_premium_weekly';
const MONTHLY = 'factsaday_premium_monthly';

/** Build PriceSources from just live subs and/or cached prices. */
const sources = (
  subscriptions: PriceSources['subscriptions'] = [],
  cachedPrices: PriceSources['cachedPrices'] = []
): PriceSources => ({ subscriptions, cachedPrices });

describe('parseDisplayPrice', () => {
  it('parses USD dot-decimal', () => {
    expect(parseDisplayPrice('$14.99')).toBeCloseTo(14.99);
    expect(parseDisplayPrice('$0.99')).toBeCloseTo(0.99);
  });

  it('parses comma-decimal currencies (EUR with trailing symbol)', () => {
    expect(parseDisplayPrice('14,99 €')).toBeCloseTo(14.99);
    expect(parseDisplayPrice('€1,99')).toBeCloseTo(1.99);
  });

  it('parses dot-thousand + comma-decimal (e.g. "1.234,56 €")', () => {
    expect(parseDisplayPrice('1.234,56 €')).toBeCloseTo(1234.56);
  });

  it('parses comma-thousand zero-decimal currencies ("￥1,580")', () => {
    expect(parseDisplayPrice('￥1,580')).toBeCloseTo(1580);
    expect(parseDisplayPrice('$1,234.56')).toBeCloseTo(1234.56);
  });

  it('parses values with no currency symbol', () => {
    expect(parseDisplayPrice('4.99')).toBeCloseTo(4.99);
  });

  it('returns null for unparseable input', () => {
    expect(parseDisplayPrice('')).toBeNull();
    expect(parseDisplayPrice('free')).toBeNull();
    expect(parseDisplayPrice('---')).toBeNull();
  });
});

describe('formatPriceLike', () => {
  it('preserves a leading currency symbol (USD)', () => {
    expect(formatPriceLike('$4.99', 1.15)).toBe('$1.15');
  });

  it('preserves a trailing symbol and comma-decimal shape (EUR)', () => {
    expect(formatPriceLike('14,99 €', 3.46)).toBe('3,46 €');
  });

  it('always renders two decimals — zero-decimal currencies gain ".00" (documented quirk)', () => {
    expect(formatPriceLike('￥1,580', 365)).toBe('￥365.00');
  });

  it('falls back to a bare toFixed(2) when no numeric portion exists', () => {
    expect(formatPriceLike('free', 2)).toBe('2.00');
  });
});

describe('getDisplayPrice', () => {
  it('prefers the live subscription displayPrice', () => {
    const s = sources(
      [{ id: WEEKLY, displayPrice: '$4.99', price: 4.99 }],
      [{ id: WEEKLY, displayPrice: '$3.99', price: 3.99 }]
    );
    expect(getDisplayPrice(WEEKLY, s)).toBe('$4.99');
  });

  it('falls back to the cached displayPrice', () => {
    const s = sources([], [{ id: MONTHLY, displayPrice: '$14.99', price: 14.99 }]);
    expect(getDisplayPrice(MONTHLY, s)).toBe('$14.99');
  });

  it('returns "---" when the product is unknown', () => {
    expect(getDisplayPrice(WEEKLY, sources())).toBe('---');
  });
});

describe('getNumericPrice', () => {
  it('prefers sub.price', () => {
    const s = sources([{ id: WEEKLY, displayPrice: '$4.99', price: 4.99 }]);
    expect(getNumericPrice(WEEKLY, s)).toBeCloseTo(4.99);
  });

  it('uses the first offer price when sub.price is absent (Android)', () => {
    const s = sources([
      { id: MONTHLY, displayPrice: '14,99 €', subscriptionOffers: [{ price: 14.99 }] },
    ]);
    expect(getNumericPrice(MONTHLY, s)).toBeCloseTo(14.99);
  });

  it('parses displayPrice when neither price nor offer is present', () => {
    const s = sources([{ id: MONTHLY, displayPrice: '14,99 €' }]);
    expect(getNumericPrice(MONTHLY, s)).toBeCloseTo(14.99);
  });

  it('falls back to cached price', () => {
    const s = sources([], [{ id: WEEKLY, displayPrice: '$4.99', price: 4.99 }]);
    expect(getNumericPrice(WEEKLY, s)).toBeCloseTo(4.99);
  });

  it('returns null when nothing is available', () => {
    expect(getNumericPrice(WEEKLY, sources())).toBeNull();
  });
});

describe('monthlySavingsPercent', () => {
  const ids = { weeklyId: WEEKLY, monthlyId: MONTHLY };

  it('computes the rounded savings of monthly vs. weekly-rate', () => {
    // weekly 4.99 * 4.333 = 21.62/mo vs monthly 14.99 → ~31% saved
    const s = sources([
      { id: WEEKLY, price: 4.99, displayPrice: '$4.99' },
      { id: MONTHLY, price: 14.99, displayPrice: '$14.99' },
    ]);
    expect(monthlySavingsPercent(s, ids)).toBe(31);
  });

  it('returns null when there is no real saving', () => {
    // monthly priced ABOVE the weekly run-rate → not cheaper
    const s = sources([
      { id: WEEKLY, price: 4.99, displayPrice: '$4.99' },
      { id: MONTHLY, price: 25.0, displayPrice: '$25.00' },
    ]);
    expect(monthlySavingsPercent(s, ids)).toBeNull();
  });

  it('returns null when a price is missing', () => {
    const s = sources([{ id: MONTHLY, price: 14.99, displayPrice: '$14.99' }]);
    expect(monthlySavingsPercent(s, ids)).toBeNull();
  });

  it('returns null when the weekly price is zero (no divide-by-zero blowup)', () => {
    const s = sources([
      { id: WEEKLY, price: 0, displayPrice: '$0.00' },
      { id: MONTHLY, price: 14.99, displayPrice: '$14.99' },
    ]);
    expect(monthlySavingsPercent(s, ids)).toBeNull();
  });
});

describe('monthlyPerWeekDisplay', () => {
  const ids = { monthlyId: MONTHLY };

  it('renders the monthly price divided into a per-week figure (USD)', () => {
    // 14.99 / 4.333 = 3.459 → "$3.46"
    const s = sources([{ id: MONTHLY, price: 14.99, displayPrice: '$14.99' }]);
    expect(monthlyPerWeekDisplay(s, ids)).toBe('$3.46');
  });

  it('keeps the source currency shape (EUR comma-decimal)', () => {
    const s = sources([{ id: MONTHLY, price: 14.99, displayPrice: '14,99 €' }]);
    expect(monthlyPerWeekDisplay(s, ids)).toBe('3,46 €');
  });

  it('returns null when the monthly price is unavailable', () => {
    expect(monthlyPerWeekDisplay(sources(), ids)).toBeNull();
  });
});

describe('WEEKS_PER_MONTH', () => {
  it('is 52/12', () => {
    expect(WEEKS_PER_MONTH).toBeCloseTo(4.3333);
  });
});
