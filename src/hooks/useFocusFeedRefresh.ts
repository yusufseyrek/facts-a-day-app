import { useCallback } from 'react';

import { useFocusEffect } from 'expo-router';

import { HOME_FEED } from '../config/app';
import { queryClient } from '../config/queryClient';
import { trackFeedRefresh } from '../services/analytics';

import { factKeys } from './queryKeys';

/**
 * Silently revalidate the home content every time the screen gains focus.
 *
 * invalidateQueries triggers a background refetch: the cached pages stay on
 * screen until fresh data lands, isLoading never flips (data already exists),
 * no RefreshControl spinner shows, and the list is never unmounted — so the
 * user's scroll offset is untouched.
 *
 * Guards:
 * - skip while a fetch is already in flight (initial mount, pull-to-refresh),
 *   so focus never stacks a second refetch on top of one running;
 * - skip when the feed was fetched moments ago (FOCUS_REFRESH_MIN_AGE_MS) —
 *   bouncing home ↔ fact-detail would otherwise re-fetch every loaded page of
 *   the cursor feed on each back-navigation.
 */
export function useFocusFeedRefresh(locale: string): void {
  useFocusEffect(
    useCallback(() => {
      const feedState = queryClient.getQueryState(factKeys.feed(locale));
      const age = Date.now() - (feedState?.dataUpdatedAt ?? 0);
      if (feedState?.fetchStatus === 'fetching' || age < HOME_FEED.FOCUS_REFRESH_MIN_AGE_MS) {
        return;
      }

      trackFeedRefresh('focus');
      queryClient.invalidateQueries({ queryKey: factKeys.feed(locale) });
      queryClient.invalidateQueries({ queryKey: factKeys.onThisDay(locale) });
    }, [locale])
  );
}
