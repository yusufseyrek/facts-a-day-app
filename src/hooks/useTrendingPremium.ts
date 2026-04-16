import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import * as api from '../services/api';
import { getCategoryBySlug, getPremiumCategorySlugs } from '../services/database';

import { homeKeys } from './queryKeys';

import type { FactWithRelations } from '../services/database';

async function fetchTrendingPremiumFacts(locale: string): Promise<FactWithRelations[]> {
  const premiumSlugs = await getPremiumCategorySlugs();
  if (premiumSlugs.length === 0) return [];

  const response = await api.getFacts({
    language: locale,
    categories: premiumSlugs.join(','),
    limit: 5,
    sort: 'created_at_desc',
  });

  const results = await Promise.allSettled(
    response.facts.map(async (apiFact) => {
      const categoryData = apiFact.category
        ? await getCategoryBySlug(apiFact.category)
        : null;

      const fact: FactWithRelations = {
        id: apiFact.id,
        slug: apiFact.slug,
        title: apiFact.title,
        content: apiFact.content,
        summary: apiFact.summary,
        category: apiFact.category,
        source_url: apiFact.source_url,
        image_url: apiFact.image_url,
        is_historical: apiFact.is_historical ? 1 : 0,
        metadata: apiFact.metadata ? JSON.stringify(apiFact.metadata) : undefined,
        language: apiFact.language,
        created_at: apiFact.created_at,
        last_updated: apiFact.updated_at,
        categoryData,
      };
      return fact;
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<FactWithRelations> => r.status === 'fulfilled')
    .map((r) => r.value);
}

export function useTrendingPremium(locale: string, isPremium: boolean): FactWithRelations[] {
  const { data } = useQuery({
    queryKey: homeKeys.trendingPremium(locale),
    queryFn: () => fetchTrendingPremiumFacts(locale),
    enabled: !isPremium,
    staleTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
  });

  return useMemo(() => data ?? [], [data]);
}
