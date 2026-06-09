import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { HOME_FEED } from '../config/app';
import { usePreloadedData } from '../contexts';
import { getFactsFeed, getOnThisDay } from '../services/api';
import { mapApiFactToRelations } from '../services/database';

import { factKeys } from './queryKeys';

import type { FactWithRelations } from '../services/database';

interface UseHomeFeedResult {
  latestFacts: FactWithRelations[];
  latestFactIds: number[];
  onThisDayFacts: FactWithRelations[];
  onThisDayIsWeekFallback: boolean;
  isLoading: boolean;
}

/**
 * Home sections (Latest carousel + On This Day), fetched on demand from the API
 * instead of the local mirror. Latest = first page of the cursor feed; On This
 * Day = the dedicated endpoint (exact date, with a ±3-day week fallback).
 */
export function useHomeFeed(locale: string): UseHomeFeedResult {
  const { signalHomeScreenReady } = usePreloadedData();

  const latestQuery = useQuery({
    queryKey: [...factKeys.feed(locale), 'latest', HOME_FEED.LATEST_COUNT] as const,
    queryFn: () => getFactsFeed({ language: locale, limit: HOME_FEED.LATEST_COUNT }),
  });

  const onThisDayQuery = useQuery({
    queryKey: factKeys.onThisDay(locale),
    queryFn: () => getOnThisDay(locale),
  });

  const isLoading = latestQuery.isLoading || onThisDayQuery.isLoading;

  const latestFacts = useMemo(
    () => (latestQuery.data?.facts ?? []).map(mapApiFactToRelations),
    [latestQuery.data]
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
