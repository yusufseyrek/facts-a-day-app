import { useEffect, useMemo } from 'react';

import { queryOptions, useQuery } from '@tanstack/react-query';

import { HOME_FEED } from '../config/app';
import { signalHeroImageReady, signalHomeScreenRendered } from '../contexts';
import { getOnThisDay } from '../services/api';
import { mapApiFactToRelations } from '../services/database';

import { factKeys } from './queryKeys';
import { useHomeFeedData } from './useHomeFeedData';

import type { FactWithRelations } from '../services/database';

/**
 * Shared options for the On This Day section — same dual-consumer setup as
 * homeFeedQueryOptions (home hook + onboarding warm-up prefetch).
 */
export function onThisDayQueryOptions(locale: string) {
  return queryOptions({
    queryKey: factKeys.onThisDay(locale),
    queryFn: () => getOnThisDay(locale),
  });
}

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
  const { facts: feedFacts, isLoading: feedLoading } = useHomeFeedData(locale);

  const onThisDayQuery = useQuery(onThisDayQueryOptions(locale));

  const isLoading = feedLoading || onThisDayQuery.isLoading;

  // Latest = the first N facts of the shared stream.
  const latestFacts = useMemo(() => feedFacts.slice(0, HOME_FEED.LATEST_COUNT), [feedFacts]);

  const latestFactIds = useMemo(() => latestFacts.map((f) => f.id), [latestFacts]);

  // Prefer exact-date facts; fall back to the surrounding week when empty.
  const onThisDayFacts = useMemo(() => {
    const exact = onThisDayQuery.data?.exact ?? [];
    const week = onThisDayQuery.data?.week ?? [];
    const chosen = exact.length > 0 ? exact : week;
    return chosen.map(mapApiFactToRelations);
  }, [onThisDayQuery.data]);

  const onThisDayIsWeekFallback =
    (onThisDayQuery.data?.exact?.length ?? 0) === 0 && (onThisDayQuery.data?.week?.length ?? 0) > 0;

  // Release the splash gates. Once the queries settle, the commit that runs
  // this effect contains the settled content (cards or empty state); two
  // frames later the native side has actually drawn it. The hero-image gate is
  // resolved by LatestCarousel's first card — unless there are no cards, in
  // which case no image will ever load and the gate is released here.
  const hasLatest = latestFacts.length > 0;
  useEffect(() => {
    if (isLoading) return;
    if (!hasLatest) signalHeroImageReady();
    let secondFrame: number | undefined;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => signalHomeScreenRendered());
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [isLoading, hasLatest]);

  return { latestFacts, latestFactIds, onThisDayFacts, onThisDayIsWeekFallback, isLoading };
}
