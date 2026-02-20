import type { BadgeWithStatus } from './badges';

interface BadgeCacheData {
  badges: BadgeWithStatus[];
  readingStreak: number;
  quizStreak: number;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _cache: BadgeCacheData | null = null;

export function getCachedBadgeData(): BadgeCacheData | null {
  if (!_cache) return null;
  if (Date.now() - _cache.timestamp > CACHE_TTL_MS) return null;
  return _cache;
}

export function setCachedBadgeData(data: Omit<BadgeCacheData, 'timestamp'>): void {
  _cache = { ...data, timestamp: Date.now() };
}

export function invalidateBadgeCache(): void {
  _cache = null;
}
