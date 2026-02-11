import type { FactWithRelations, Category, Fact } from '../../services/database';

let factIdCounter = 1;

export function createFact(overrides: Partial<Fact> = {}): Fact {
  const id = overrides.id ?? factIdCounter++;
  return {
    id,
    slug: `fact-${id}`,
    title: `Test Fact ${id}`,
    content: `This is the content for test fact ${id}`,
    summary: `Summary for fact ${id}`,
    category: 'science',
    source_url: `https://example.com/fact-${id}`,
    image_url: `https://images.example.com/fact-${id}.webp`,
    language: 'en',
    created_at: '2025-01-01T00:00:00.000Z',
    last_updated: '2025-01-01T00:00:00.000Z',
    scheduled_date: undefined,
    notification_id: undefined,
    shown_in_feed: 0,
    ...overrides,
  };
}

export function createCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Science',
    slug: 'science',
    description: 'Scientific facts',
    icon: 'flask',
    color_hex: '#4CAF50',
    ...overrides,
  };
}

export function createFactWithRelations(
  overrides: Partial<FactWithRelations> = {}
): FactWithRelations {
  const fact = createFact(overrides);
  return {
    ...fact,
    categoryData: overrides.categoryData !== undefined
      ? overrides.categoryData
      : createCategory({ slug: fact.category || 'science' }),
    ...overrides,
  };
}

export function createDbRow(overrides: Record<string, any> = {}): Record<string, any> {
  const id = overrides.id ?? factIdCounter++;
  return {
    id,
    slug: `fact-${id}`,
    title: `Test Fact ${id}`,
    content: `Content for fact ${id}`,
    summary: `Summary ${id}`,
    category: 'science',
    source_url: null,
    image_url: null,
    language: 'en',
    created_at: '2025-01-01T00:00:00.000Z',
    last_updated: '2025-01-01T00:00:00.000Z',
    scheduled_date: null,
    notification_id: null,
    shown_in_feed: 0,
    category_id: 1,
    category_name: 'Science',
    category_slug: 'science',
    category_description: 'Scientific facts',
    category_icon: 'flask',
    category_color_hex: '#4CAF50',
    ...overrides,
  };
}

export function createPreferredTime(hour: number, minute: number = 0): Date {
  const date = new Date(2025, 0, 1, hour, minute, 0, 0);
  return date;
}

export function futureDate(daysFromNow: number, hour: number = 9, minute: number = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, minute, 0, 0);
  return date;
}

export function createMockJWT(payload: Record<string, any>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = btoa('mock-signature');
  return `${header}.${body}.${signature}`;
}

export function resetFactIdCounter(): void {
  factIdCounter = 1;
}
