import { useEffect, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { signalFeedLoaded } from '../contexts';
import {
  getRefreshStatus,
  onFeedRefresh,
  onRefreshStatusChange,
  type RefreshStatus,
} from '../services/contentRefresh';
import { loadDailyFeedSections } from '../services/dailyFeed';
import { clearGlobalProgress, setGlobalProgress } from '../services/globalProgress';
import { preCacheOfflineImages } from '../services/images';
import { onNetworkChange } from '../services/network';

import { homeKeys } from './queryKeys';

import type { FlashListRef } from '@shopify/flash-list';
import type { FactWithRelations } from '../services/database';

interface CarouselRefs {
  latestListRef: React.RefObject<FlashListRef<FactWithRelations> | null>;
  onThisDayListRef: React.RefObject<FlashListRef<FactWithRelations> | null>;
  outerListRef: React.RefObject<FlashListRef<any> | null>;
}

interface UseHomeFeedEventsResult {
  backgroundRefreshStatus: RefreshStatus;
}

export function useHomeFeedEvents(locale: string, refs: CarouselRefs): UseHomeFeedEventsResult {
  const queryClient = useQueryClient();
  const [backgroundRefreshStatus, setBackgroundRefreshStatus] = useState<RefreshStatus>(() =>
    getRefreshStatus()
  );

  // Auto-refresh feed when facts change (content sync, preference changes)
  useEffect(() => {
    const unsubscribe = onFeedRefresh(async () => {
      const sections = await loadDailyFeedSections(locale, true);
      // Snap to top BEFORE the data swap. FlashList tracks scroll offset in
      // pixels — if we update the header data while the user is scrolled
      // partway down, the new ListHeaderComponent commits around that same
      // pixel offset, landing the viewport mid-Latest-carousel. Scrolling
      // first means the next commit anchors at offset 0.
      refs.outerListRef.current?.scrollToOffset({ offset: 0, animated: false });
      refs.latestListRef.current?.scrollToOffset({ offset: 0, animated: false });
      refs.onThisDayListRef.current?.scrollToOffset({ offset: 0, animated: false });
      queryClient.setQueryData(homeKeys.dailyFeed(locale), sections);
      queryClient.invalidateQueries({ queryKey: homeKeys.keepReading(locale) });
      queryClient.invalidateQueries({ queryKey: homeKeys.readingStreak() });
      // Fallback after layout settles, in case the keep-reading refetch lands
      // a few frames later with a different content height and FlashList
      // drifts off offset 0 again.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          refs.outerListRef.current?.scrollToOffset({ offset: 0, animated: false });
        });
      });
      signalFeedLoaded();
    });
    return () => unsubscribe();
  }, [locale, queryClient, refs.latestListRef, refs.onThisDayListRef, refs.outerListRef]);

  // Pre-cache images when network comes back online
  useEffect(() => {
    const unsubscribe = onNetworkChange((connected) => {
      if (connected) {
        preCacheOfflineImages(undefined, setGlobalProgress)
          .then(() => setTimeout(clearGlobalProgress, 1000))
          .catch(clearGlobalProgress);
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to background refresh status
  useEffect(() => {
    const unsubscribe = onRefreshStatusChange(setBackgroundRefreshStatus);
    return () => unsubscribe();
  }, []);

  return { backgroundRefreshStatus };
}
