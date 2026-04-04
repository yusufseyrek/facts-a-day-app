export const homeKeys = {
  all: ['home'] as const,
  dailyFeed: (locale: string) => ['home', 'dailyFeed', locale] as const,
  keepReading: (locale: string) => ['home', 'keepReading', locale] as const,
  readingStreak: () => ['home', 'readingStreak'] as const,
  quickQuiz: (locale: string) => ['home', 'quickQuiz', locale] as const,
};
