/**
 * Database tests (thin cache).
 *
 * The local DB no longer mirrors facts/categories/questions — those are served
 * on demand from the API. These tests cover the pure helpers that survive:
 * toIsoUtc (delta-sync timestamp normalization) and mapApiFactToRelations (the
 * API → UI shape adapter). expo-sqlite is mocked since it can't run in Node.
 */

// Mock expo-sqlite
jest.mock('expo-sqlite', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
  };
  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
    __mockDb: mockDb,
  };
});

import * as database from '../../services/database';

describe('database — toIsoUtc', () => {
  it('converts SQLite space-form to ISO-Z (UTC)', () => {
    expect(database.toIsoUtc('2026-06-06 00:00:28')).toBe('2026-06-06T00:00:28Z');
  });

  it('preserves fractional seconds', () => {
    expect(database.toIsoUtc('2026-06-06 00:00:28.627')).toBe('2026-06-06T00:00:28.627Z');
  });

  it('leaves an already-ISO-Z timestamp unchanged', () => {
    expect(database.toIsoUtc('2026-06-06T00:01:25.627Z')).toBe('2026-06-06T00:01:25.627Z');
  });

  it('leaves an ISO timestamp with a numeric offset unchanged', () => {
    expect(database.toIsoUtc('2026-06-06T00:01:25+03:00')).toBe('2026-06-06T00:01:25+03:00');
  });

  it('returns undefined for null/undefined/empty', () => {
    expect(database.toIsoUtc(undefined)).toBeUndefined();
    expect(database.toIsoUtc(null)).toBeUndefined();
    expect(database.toIsoUtc('')).toBeUndefined();
  });

  it('orders a normalized space-form created_at correctly against ISO-Z', () => {
    const createdAt = database.toIsoUtc('2026-06-06 00:00:28')!;
    const updatedAt = '2026-06-06T00:01:25.627Z';
    expect(createdAt < updatedAt).toBe(true);
  });
});

describe('database — mapApiFactToRelations', () => {
  const baseApiFact = {
    id: 42,
    title: 'A fact',
    content: 'Body',
    summary: 'Sum',
    category: 'science',
    category_name: 'Science',
    category_icon: 'flask',
    category_color_hex: '#00ff00',
    source_url: 'https://e.com/s',
    image_url: 'https://e.com/i.jpg',
    audio_url: 'https://e.com/a.mp3',
    is_historical: false,
    metadata: null,
    language: 'en',
    created_at: '2026-06-06 00:00:28',
    updated_at: '2026-06-06T00:01:25Z',
  };

  it('maps API booleans/objects to the local 0/1 + JSON conventions', () => {
    const f = database.mapApiFactToRelations(baseApiFact);
    expect(f.id).toBe(42);
    expect(f.is_historical).toBe(0);
    expect(f.last_updated).toBe('2026-06-06T00:01:25Z');
    expect(f.audio_url).toBe('https://e.com/a.mp3');
  });

  it('builds categoryData from inline category_* fields (no DB lookup)', () => {
    const f = database.mapApiFactToRelations(baseApiFact);
    expect(f.categoryData?.slug).toBe('science');
    expect(f.categoryData?.name).toBe('Science');
    expect(f.categoryData?.color_hex).toBe('#00ff00');
    expect(f.categoryData?.icon).toBe('flask');
  });

  it('serializes historical metadata into the local JSON string shape', () => {
    const f = database.mapApiFactToRelations({
      ...baseApiFact,
      is_historical: true,
      metadata: { month: 6, day: 6, event_year: 1944, original_event: 'D-Day', country: 'FR' },
    });
    expect(f.is_historical).toBe(1);
    expect(f.event_month).toBe(6);
    expect(f.event_day).toBe(6);
    expect(f.event_year).toBe(1944);
    expect(JSON.parse(f.metadata!)).toEqual({ original_event: 'D-Day', country: 'FR' });
  });
});
