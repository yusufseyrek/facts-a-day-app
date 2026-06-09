import { useMemo } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';

import { HOME_FEED } from '../config/app';
import { getFactsFeed } from '../services/api';
import { mapApiFactToRelations } from '../services/database';

import { factKeys } from './queryKeys';

import type { FactWithRelations } from '../services/database';

/**
 * Single source of truth for the home feed's main fact stream.
 *
 * Latest and Keep Reading used to be TWO independent queries that both fetched
 * the cursor feed from the newest fact — so Keep Reading's first rows were the
 * exact same facts as the Latest carousel. This one infinite query is shared by
 * both: Latest takes the first N facts, Keep Reading takes everything after,
 * and infinite scroll just continues paging the same stream. No overlap by
 * construction, and the facts are fetched once.
 */
export interface HomeFeedData {
  /** The full flattened, ordered fact stream (Latest + Keep Reading combined). */
  facts: FactWithRelations[];
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
}

export function useHomeFeedData(locale: string): HomeFeedData {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
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

  return {
    facts,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    isLoading,
  };
}
