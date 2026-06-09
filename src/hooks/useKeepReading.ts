import { useCallback, useMemo } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';

import { HOME_FEED } from '../config/app';
import { getFactsFeed } from '../services/api';
import { mapApiFactToRelations } from '../services/database';

import { factKeys } from './queryKeys';

import type { FactWithRelations } from '../services/database';

interface UseKeepReadingResult {
  facts: FactWithRelations[];
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

/**
 * Infinite "Keep Reading" list, now backed by the cursor feed instead of the
 * local SQLite mirror. Pages by the opaque `next_cursor` the backend returns;
 * React Query's cache holds the pages.
 */
export function useKeepReading(locale: string): UseKeepReadingResult {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: factKeys.feed(locale),
    queryFn: ({ pageParam }) =>
      getFactsFeed({
        language: locale,
        limit: HOME_FEED.KEEP_READING_PAGE_SIZE,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
  });

  const facts = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.facts).map(mapApiFactToRelations),
    [data]
  );

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    facts,
    fetchNextPage: loadMore,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  };
}
