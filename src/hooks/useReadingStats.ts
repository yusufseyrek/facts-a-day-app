import { useQuery } from '@tanstack/react-query';

import { getAllReadingStats } from '../services/stats';

import { statsKeys } from './queryKeys';

const STALE_TIME = 1000 * 60 * 5; // 5 minutes

/**
 * Single hook that fetches all reading stats in one batched call.
 * All 6 underlying DB queries run in parallel via Promise.all,
 * and the screen gets a single loading / data / error transition.
 */
export function useAllReadingStats() {
  return useQuery({
    queryKey: statsKeys.all,
    queryFn: getAllReadingStats,
    staleTime: STALE_TIME,
  });
}
