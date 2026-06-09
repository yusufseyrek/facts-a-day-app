import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getFactById } from '../services/api';

import { factKeys } from './queryKeys';

import type { FactResponse, FactsFeedResponse } from '../services/api';

/**
 * Fact detail, served instantly from cache when possible.
 *
 * Every list surface (Home feed, Discover, Favorites, Story) already has the
 * tapped fact in the React Query cache. Re-fetching it by id behind a
 * full-screen spinner — which is what the old screen did — threw that away and
 * made every open wait on a network round-trip.
 *
 * Here we:
 *  - scan the cache for the fact (any feed / by-ids / detail query) and use it
 *    as initialData, so the screen renders the content immediately, and
 *  - fetch getFactById only as a fallback / freshness check.
 *
 * Note: the detail modal does NOT render trivia questions (those live in the
 * trivia flow), so we request the fact WITHOUT include_questions — a smaller,
 * faster payload. On a warm tap the cached fact is shown instantly and this is
 * just a quiet background revalidation.
 */

/** Pull a fact with the given id out of any cached list/detail query. */
function findFactInCache(
  getAll: () => [readonly unknown[], unknown][],
  factId: number
): FactResponse | undefined {
  for (const [, data] of getAll()) {
    if (!data) continue;

    // Detail query: the fact itself.
    if (isFactResponse(data) && data.id === factId) return data;

    // Feed / search query: { facts: [...] }.
    const facts = (data as FactsFeedResponse).facts;
    if (Array.isArray(facts)) {
      const hit = facts.find((f) => f?.id === factId);
      if (hit) return hit;
    }

    // Infinite query: { pages: [{ facts: [...] }, ...] }.
    const pages = (data as { pages?: FactsFeedResponse[] }).pages;
    if (Array.isArray(pages)) {
      for (const page of pages) {
        const hit = page?.facts?.find((f) => f?.id === factId);
        if (hit) return hit;
      }
    }

    // by-ids query: FactResponse[].
    if (Array.isArray(data)) {
      const hit = (data as FactResponse[]).find((f) => f?.id === factId);
      if (hit) return hit;
    }
  }
  return undefined;
}

function isFactResponse(v: unknown): v is FactResponse {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as FactResponse).id === 'number' &&
    typeof (v as FactResponse).content === 'string'
  );
}

export function useFactDetail(factId: number, locale: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: factKeys.detail(locale, factId),
    queryFn: () => getFactById(factId, locale, false),
    enabled: Number.isFinite(factId) && factId > 0,
    // Seed from whatever the list queries already cached, so content paints
    // immediately; the queryFn still runs to fetch the full record (questions).
    initialData: () =>
      findFactInCache(
        () => queryClient.getQueriesData({ queryKey: factKeys.all }),
        factId
      ),
    // Treat seeded data as already-stale so the background refetch runs to fill
    // in trivia questions the list payload didn't carry.
    initialDataUpdatedAt: 0,
  });
}

/**
 * Warm the detail cache for given fact ids so swiping prev/next in the detail
 * screen is instant. Needed because some list surfaces (e.g. Discover's
 * category browse) hold their facts in local state, not React Query — so
 * useFactDetail can't seed from cache and falls back to a blocking network
 * fetch (the "long spinner" on every switch). Prefetching the neighbors removes
 * that wait. No-op for ids already cached and fresh.
 */
export function usePrefetchFactDetails(locale: string) {
  const queryClient = useQueryClient();
  return (factIds: number[]) => {
    for (const id of factIds) {
      if (!Number.isFinite(id) || id <= 0) continue;
      queryClient.prefetchQuery({
        queryKey: factKeys.detail(locale, id),
        queryFn: () => getFactById(id, locale, false),
        // Don't refetch if we already have a usable cached entry.
        staleTime: 1000 * 60 * 5,
      });
    }
  };
}

/**
 * Prime the detail cache directly from a list of already-fetched facts. Use
 * when a surface fetches facts into LOCAL state (Discover category browse,
 * search) rather than via a React Query key useFactDetail scans — seeding here
 * means opening any of them, and swiping between them, is instant with zero
 * extra network. Only seeds full records (with content); skips ids already
 * cached so a richer cached copy isn't clobbered.
 */
export function useSeedFactDetailsCache(locale: string) {
  const queryClient = useQueryClient();
  return (facts: FactResponse[]) => {
    for (const fact of facts) {
      if (!fact || typeof fact.id !== 'number' || typeof fact.content !== 'string') continue;
      const key = factKeys.detail(locale, fact.id);
      if (queryClient.getQueryData(key) === undefined) {
        queryClient.setQueryData(key, fact);
      }
    }
  };
}
