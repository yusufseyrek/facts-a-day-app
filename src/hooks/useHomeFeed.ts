import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { HOME_FEED } from '../config/app';
import { usePreloadedData } from '../contexts';
import { getOnThisDay } from '../services/api';
import { mapApiFactToRelations } from '../services/database';

import { factKeys } from './queryKeys';
import { useHomeFeedData } from './useHomeFeedData';

import type { FactWithRelations } from '../services/database';

interface UseHomeFeedResult {
  latestFacts: FactWithRelations[];
  latestFactIds: number[];
  onThisDayFacts: FactWithRelations[];
  onThisDayIsWeekFallback: boolean;
  isLoading: boolean;
}

/**
 * Home sections (Latest carousel + On This Day). Latest is the FIRST
 * HOME_FEED.LATEST_COUNT facts of the shared home-feed stream (see
 * useHomeFeedData) — the same query Keep Reading reads from, so the two never
 * show the same fact. On This Day is its own dedicated endpoint (exact date,
 * with a ±3-day week fallback).
 */
export function useHomeFeed(locale: string): UseHomeFeedResult {
  const { signalHomeScreenReady } = usePreloadedData();

  const { facts: feedFacts, isLoading: feedLoading } = useHomeFeedData(locale);

  const onThisDayQuery = useQuery({
    queryKey: factKeys.onThisDay(locale),
    queryFn: () => getOnThisDay(locale),
  });

  const isLoading = feedLoading || onThisDayQuery.isLoading;

  // Latest = the first N facts of the shared stream.
  const latestFacts = useMemo(
    () => feedFacts.slice(0, HOME_FEED.LATEST_COUNT),
    [feedFacts]
  );

  const latestFactIds = useMemo(() => latestFacts.map((f) => f.id), [latestFacts]);

  // Prefer exact-date facts; fall back to the surrounding week when empty.
  const onThisDayFacts = useMemo(() => {
    const exact = onThisDayQuery.data?.exact ?? [];
    const week = onThisDayQuery.data?.week ?? [];
    const chosen = exact.length > 0 ? exact : week;
    return chosen.map(mapApiFactToRelations);
  }, [onThisDayQuery.data]);

  const onThisDayIsWeekFallback =
    (onThisDayQuery.data?.exact?.length ?? 0) === 0 &&
    (onThisDayQuery.data?.week?.length ?? 0) > 0;

  // Signal home screen ready when showing empty state
  if (!isLoading && latestFacts.length === 0 && onThisDayFacts.length === 0) {
    signalHomeScreenReady();
  }

  return { latestFacts, latestFactIds, onThisDayFacts, onThisDayIsWeekFallback, isLoading };
}
