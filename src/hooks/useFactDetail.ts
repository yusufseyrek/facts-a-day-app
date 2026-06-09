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
