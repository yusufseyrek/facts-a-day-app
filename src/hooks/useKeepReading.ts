import { useCallback, useMemo } from 'react';

import { HOME_FEED } from '../config/app';

import { useHomeFeedData } from './useHomeFeedData';

import type { FactWithRelations } from '../services/database';

interface UseKeepReadingResult {
  facts: FactWithRelations[];
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

/**
 * "Keep Reading" — everything in the shared home-feed stream AFTER the Latest
 * carousel's first HOME_FEED.LATEST_COUNT facts. Reads from the same infinite
 * query as the Latest carousel (see useHomeFeedData), so the two never overlap;
 * infinite scroll keeps paging the same stream via cursor.
 */
export function useKeepReading(locale: string): UseKeepReadingResult {
  const { facts, fetchNextPage, hasNextPage, isFetchingNextPage } = useHomeFeedData(locale);

  // Skip the facts already shown in the Latest carousel.
  const keepReadingFacts = useMemo(() => facts.slice(HOME_FEED.LATEST_COUNT), [facts]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    facts: keepReadingFacts,
    fetchNextPage: loadMore,
    hasNextPage,
    isFetchingNextPage,
  };
}
