import { useQuery } from '@tanstack/react-query';

import {
  getDailyReadingActivity,
  getReadingHabits,
  getReadingOverview,
  getTopCategoriesRead,
} from '../services/stats';

import { statsKeys } from './queryKeys';

const FIVE_MINUTES = 1000 * 60 * 5;

export function useReadingOverview() {
  return useQuery({
    queryKey: statsKeys.overview(),
    queryFn: getReadingOverview,
    staleTime: FIVE_MINUTES,
  });
}

export function useDailyReadingActivity(days: number) {
  return useQuery({
    queryKey: statsKeys.dailyActivity(days),
    queryFn: () => getDailyReadingActivity(days),
    staleTime: FIVE_MINUTES,
  });
}

export function useReadingHabits() {
  return useQuery({
    queryKey: statsKeys.habits(),
    queryFn: getReadingHabits,
    staleTime: FIVE_MINUTES,
  });
}

export function useTopCategoriesRead(limit: number) {
  return useQuery({
    queryKey: statsKeys.topCategories(limit),
    queryFn: () => getTopCategoriesRead(limit),
    staleTime: FIVE_MINUTES,
  });
}
