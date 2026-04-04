import { useCallback, useMemo } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';

import { HOME_FEED } from '../config/app';
import { getLatestFactsPaginated } from '../services/database';

import { homeKeys } from './queryKeys';

import type { FactWithRelations } from '../services/database';

interface UseKeepReadingResult {
  facts: FactWithRelations[];
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

export function useKeepReading(
  locale: string,
  latestFactIds: number[]
): UseKeepReadingResult {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: homeKeys.keepReading(locale),
    queryFn: ({ pageParam = 0 }) =>
      getLatestFactsPaginated(
        HOME_FEED.KEEP_READING_PAGE_SIZE,
        pageParam,
        locale,
        latestFactIds
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < HOME_FEED.KEEP_READING_PAGE_SIZE) return undefined;
      return allPages.reduce((total, page) => total + page.length, 0);
    },
  });

  const facts = useMemo(
    () => data?.pages.flat() ?? [],
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
