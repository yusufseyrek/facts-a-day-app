import { useQuery } from '@tanstack/react-query';

import { getReadingStreak } from '../services/badges';

import { homeKeys } from './queryKeys';

export function useReadingStreak() {
  const { data } = useQuery({
    queryKey: homeKeys.readingStreak(),
    queryFn: getReadingStreak,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return { streak: data ?? 0 };
}
