import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { HOME_FEED } from '../config/app';
import { usePreloadedData } from '../contexts';
import { loadDailyFeedSections } from '../services/dailyFeed';

import { homeKeys } from './queryKeys';

import type { DailyFeedSections } from '../services/dailyFeed';
import type { FactWithRelations } from '../services/database';

interface UseHomeFeedResult {
  latestFacts: FactWithRelations[];
  latestFactIds: number[];
  onThisDayFacts: FactWithRelations[];
  onThisDayIsWeekFallback: boolean;
  isLoading: boolean;
}

export function useHomeFeed(locale: string): UseHomeFeedResult {
  const { signalHomeScreenReady } = usePreloadedData();

  const { data, isLoading } = useQuery<DailyFeedSections>({
    queryKey: homeKeys.dailyFeed(locale),
    queryFn: () => loadDailyFeedSections(locale, false),
  });

  const allFreshFacts = data?.freshFacts ?? [];

  const latestFacts = useMemo(
    () => allFreshFacts.slice(0, HOME_FEED.LATEST_COUNT),
    [allFreshFacts]
  );

  const latestFactIds = useMemo(
    () => latestFacts.map((f) => f.id),
    [latestFacts]
  );

  const onThisDayFacts = data?.onThisDay ?? [];
  const onThisDayIsWeekFallback = data?.onThisDayIsWeekFallback ?? false;

  // Signal home screen ready when showing empty state
  if (!isLoading && latestFacts.length === 0 && onThisDayFacts.length === 0) {
    signalHomeScreenReady();
  }

  return { latestFacts, latestFactIds, onThisDayFacts, onThisDayIsWeekFallback, isLoading };
}
