/**
 * widgetData service — verifies the payload written to the native widgets.
 *
 * The native decoders (ios-widget/WidgetDataStore.swift `WidgetFact` /
 * android-widget/WidgetDataStore.kt `WidgetFact`) parse the exact JSON shape
 * asserted here, so these tests double as a contract check between the JS
 * producer and both native consumers.
 */

import { reloadWidgets, setWidgetData } from '../../native/WidgetBridge';
import { getFactsFeed } from '../../services/api';
import { pushWidgetFacts, refreshWidgetData } from '../../services/widgetData';

import type { FactResponse } from '../../services/api';

jest.mock('../../native/WidgetBridge', () => ({
  setWidgetData: jest.fn().mockResolvedValue(undefined),
  reloadWidgets: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/api');

const mockSetWidgetData = setWidgetData as jest.MockedFunction<typeof setWidgetData>;
const mockReloadWidgets = reloadWidgets as jest.MockedFunction<typeof reloadWidgets>;
const mockGetFactsFeed = getFactsFeed as jest.MockedFunction<typeof getFactsFeed>;

function makeFact(id: number, overrides: Partial<FactResponse> = {}): FactResponse {
  return {
    id,
    title: `Fact number ${id}`,
    content: `Content ${id}`,
    category: 'science',
    category_name: 'Science',
    category_color_hex: '#00D4FF',
    image_url: `https://cdn.example.com/${id}.jpg`,
    is_historical: false,
    metadata: null,
    language: 'en',
    created_at: `2026-06-01 00:00:0${id % 10}`,
    ...overrides,
  };
}

/** The JSON object handed to the native bridge on the most recent push. */
function lastPayload(): {
  facts: Record<string, unknown>[];
  updatedAt: string;
  theme: string;
  locale: string;
  isPremium: boolean;
} {
  const json = mockSetWidgetData.mock.calls.at(-1)?.[0] as string;
  return JSON.parse(json);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pushWidgetFacts', () => {
  it('writes only the newest 5 facts, order preserved, then reloads', async () => {
    // A full feed page is 25 facts; the widget shows the newest 5.
    const facts = Array.from({ length: 25 }, (_, i) => makeFact(i + 1));

    await pushWidgetFacts(facts, 'en');

    expect(mockSetWidgetData).toHaveBeenCalledTimes(1);
    expect(mockReloadWidgets).toHaveBeenCalledTimes(1);

    const payload = lastPayload();
    expect(payload.facts).toHaveLength(5);
    expect(payload.facts.map((f) => f.id)).toEqual([1, 2, 3, 4, 5]);
    expect(payload.locale).toBe('en');
    expect(['light', 'dark']).toContain(payload.theme);
    expect(typeof payload.isPremium).toBe('boolean');
    expect(Date.parse(payload.updatedAt)).not.toBeNaN();
  });

  it('maps a fact to the exact native WidgetFact contract', async () => {
    await pushWidgetFacts(
      [
        makeFact(42, {
          title: 'Hello world',
          category: 'history',
          category_name: 'History',
          category_color_hex: '#FFAA00',
          image_url: 'https://img/x.jpg',
        }),
      ],
      'es'
    );

    expect(lastPayload().facts[0]).toEqual({
      id: 42,
      title: 'Hello world',
      categorySlug: 'history',
      categoryName: 'History',
      categoryColor: '#FFAA00',
      categoryTextColor: '#000000', // bright orange -> dark text
      deepLink: 'factsaday://fact/42',
      imageUrl: 'https://img/x.jpg',
    });
  });

  it('falls back to truncated content and a neon color when fields are missing', async () => {
    await pushWidgetFacts(
      [
        makeFact(7, {
          title: undefined,
          content: 'X'.repeat(300),
          category: 'unknown-slug',
          category_name: undefined,
          category_color_hex: undefined,
        }),
      ],
      'en'
    );

    const fact = lastPayload().facts[0];
    expect(fact.title).toHaveLength(200); // content trimmed to 200 chars
    expect(fact.categorySlug).toBe('unknown-slug');
    expect(fact.categoryName).toBe('unknown-slug'); // falls back to the slug
    expect(fact.categoryColor).toMatch(/^#[0-9a-fA-F]{6}$/); // neon palette fallback
    expect(fact.categoryTextColor).toMatch(/^#(000000|FFFFFF)$/);
  });

  it('no-ops (no write, no reload) when there are no usable facts', async () => {
    await pushWidgetFacts([makeFact(9, { title: '', content: '' })], 'en');
    expect(mockSetWidgetData).not.toHaveBeenCalled();
    expect(mockReloadWidgets).not.toHaveBeenCalled();
  });
});

describe('refreshWidgetData', () => {
  it('fetches the latest 5 from the feed and pushes them', async () => {
    mockGetFactsFeed.mockResolvedValue({
      facts: [makeFact(1), makeFact(2)],
      next_cursor: null,
      has_more: false,
    });

    await refreshWidgetData('fr');

    expect(mockGetFactsFeed).toHaveBeenCalledWith({ language: 'fr', limit: 5 });
    const payload = lastPayload();
    expect(payload.facts.map((f) => f.id)).toEqual([1, 2]);
    expect(payload.locale).toBe('fr');
    expect(mockReloadWidgets).toHaveBeenCalledTimes(1);
  });

  it('swallows fetch errors and writes nothing', async () => {
    mockGetFactsFeed.mockRejectedValue(new Error('network down'));

    await expect(refreshWidgetData('en')).resolves.toBeUndefined();
    expect(mockSetWidgetData).not.toHaveBeenCalled();
    expect(mockReloadWidgets).not.toHaveBeenCalled();
  });
});
