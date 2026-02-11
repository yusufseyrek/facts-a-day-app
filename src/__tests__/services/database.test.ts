/**
 * Database tests
 *
 * Since expo-sqlite v16 cannot run in Node.js, we mock the database module
 * and test the public API contracts + mapFactsWithRelations logic.
 */

import { createDbRow, createCategory, createFact } from '../helpers/factories';

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

const sqlite = jest.requireMock('expo-sqlite');
const mockDb = sqlite.__mockDb;

// Import after mocks
import * as database from '../../services/database';

describe('database — mapFactsWithRelations', () => {
  // We test this indirectly through getFactById/getAllFacts which use mapFactsWithRelations

  it('maps row with category data', async () => {
    const row = createDbRow({
      id: 1,
      title: 'Test Fact',
      content: 'Content here',
      category: 'science',
      category_id: 10,
      category_name: 'Science',
      category_slug: 'science',
      category_description: 'Scientific facts',
      category_icon: 'flask',
      category_color_hex: '#4CAF50',
    });

    mockDb.getFirstAsync.mockResolvedValueOnce(row);

    const fact = await database.getFactById(1);
    expect(fact).not.toBeNull();
    expect(fact!.id).toBe(1);
    expect(fact!.title).toBe('Test Fact');
    expect(fact!.categoryData).toBeDefined();
    expect(fact!.categoryData!.name).toBe('Science');
    expect(fact!.categoryData!.slug).toBe('science');
    expect(fact!.categoryData!.color_hex).toBe('#4CAF50');
  });

  it('maps row without category (null category_id)', async () => {
    const row = createDbRow({
      id: 2,
      title: 'No Category',
      category: null,
      category_id: null,
      category_name: null,
      category_slug: null,
      category_description: null,
      category_icon: null,
      category_color_hex: null,
    });

    mockDb.getFirstAsync.mockResolvedValueOnce(row);

    const fact = await database.getFactById(2);
    expect(fact).not.toBeNull();
    expect(fact!.categoryData).toBeUndefined();
  });

  it('handles null fields gracefully', async () => {
    const row = createDbRow({
      id: 3,
      slug: null,
      title: null,
      summary: null,
      source_url: null,
      image_url: null,
      scheduled_date: null,
      notification_id: null,
    });

    mockDb.getFirstAsync.mockResolvedValueOnce(row);

    const fact = await database.getFactById(3);
    expect(fact).not.toBeNull();
    expect(fact!.slug).toBeNull();
    expect(fact!.title).toBeNull();
  });

  it('maps empty array', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const facts = await database.getAllFacts('en');
    expect(facts).toEqual([]);
  });
});

describe('database — insertFacts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts new facts', async () => {
    const facts = [
      createFact({ id: 100, content: 'Fact A' }),
      createFact({ id: 101, content: 'Fact B' }),
    ];

    await database.insertFacts(facts);

    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
  });

  it('uses ON CONFLICT to preserve scheduling columns', async () => {
    const facts = [createFact({ id: 200, content: 'Updated content' })];

    await database.insertFacts(facts);

    const sql = mockDb.runAsync.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE');
    // Should preserve local columns
    expect(sql).toContain('scheduled_date = facts.scheduled_date');
    expect(sql).toContain('notification_id = facts.notification_id');
    expect(sql).toContain('shown_in_feed = facts.shown_in_feed');
  });
});

describe('database — insertCategories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts categories', async () => {
    const categories = [
      createCategory({ id: 1, name: 'Science', slug: 'science' }),
      createCategory({ id: 2, name: 'History', slug: 'history' }),
    ];

    await database.insertCategories(categories);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
    const sql = mockDb.runAsync.mock.calls[0][0];
    expect(sql).toContain('INSERT OR REPLACE');
  });
});

describe('database — markFactAsScheduled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates scheduled_date and notification_id', async () => {
    await database.markFactAsScheduled(1, '2025-06-01T09:00:00.000Z', 'notif-123');

    expect(mockDb.runAsync).toHaveBeenCalled();
    const args = mockDb.runAsync.mock.calls[0][1];
    expect(args).toContain('2025-06-01T09:00:00.000Z');
    expect(args).toContain('notif-123');
    expect(args).toContain(1);
  });
});

describe('database — getRandomUnscheduledFacts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries for unscheduled facts with language filter', async () => {
    const rows = [createDbRow({ id: 1 }), createDbRow({ id: 2 })];
    mockDb.getAllAsync.mockResolvedValueOnce(rows);

    const facts = await database.getRandomUnscheduledFacts(10, 'en');
    expect(facts).toHaveLength(2);

    const sql = mockDb.getAllAsync.mock.calls[0][0];
    expect(sql).toContain('scheduled_date IS NULL');
    expect(sql).toContain('shown_in_feed');
    expect(sql).toContain('ORDER BY RANDOM()');
    expect(sql).toContain('LIMIT');
  });

  it('respects limit', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    await database.getRandomUnscheduledFacts(5, 'en');

    const args = mockDb.getAllAsync.mock.calls[0][1];
    expect(args).toContain(5);
  });
});

describe('database — getTodaysFacts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries with timezone-safe localtime comparison', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    await database.getTodaysFacts('en');

    const sql = mockDb.getAllAsync.mock.calls[0][0];
    // Should use localtime for timezone-safe date comparison
    expect(sql).toContain('localtime');
  });
});

describe('database — markDeliveredFactsAsShown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks past scheduled facts as shown, filtering by language', async () => {
    await database.markDeliveredFactsAsShown('en');

    expect(mockDb.runAsync).toHaveBeenCalled();
    const sql = mockDb.runAsync.mock.calls[0][0];
    expect(sql).toContain('shown_in_feed');
    expect(sql).toContain('language');
  });
});
