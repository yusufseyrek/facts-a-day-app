export const homeKeys = {
  all: ['home'] as const,
  dailyFeed: (locale: string) => ['home', 'dailyFeed', locale] as const,
  keepReading: (locale: string) => ['home', 'keepReading', locale] as const,
  readingStreak: () => ['home', 'readingStreak'] as const,
};

export const statsKeys = {
  all: ['stats'] as const,
  overview: () => ['stats', 'overview'] as const,
  dailyActivity: (days: number) => ['stats', 'dailyActivity', days] as const,
  habits: () => ['stats', 'habits'] as const,
  topCategories: (limit: number) => ['stats', 'topCategories', limit] as const,
};
