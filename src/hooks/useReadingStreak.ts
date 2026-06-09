import { useQuery } from '@tanstack/react-query';

import { getReadingStreak } from '../services/badges';

import { localStateKeys } from './queryKeys';

export function useReadingStreak() {
  const { data } = useQuery({
    queryKey: localStateKeys.readingStreak(),
    queryFn: getReadingStreak,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return { streak: data ?? 0 };
}
