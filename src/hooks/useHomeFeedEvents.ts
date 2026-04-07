import { useEffect, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

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
import { signalFeedLoaded } from '../contexts';

import { homeKeys } from './queryKeys';

import type { FlashListRef } from '@shopify/flash-list';
import type { FactWithRelations } from '../services/database';

interface CarouselRefs {
  latestListRef: React.RefObject<FlashListRef<FactWithRelations> | null>;
  onThisDayListRef: React.RefObject<FlashListRef<FactWithRelations> | null>;
}

interface UseHomeFeedEventsResult {
  backgroundRefreshStatus: RefreshStatus;
}

export function useHomeFeedEvents(
  locale: string,
  refs: CarouselRefs
): UseHomeFeedEventsResult {
  const queryClient = useQueryClient();
  const [backgroundRefreshStatus, setBackgroundRefreshStatus] = useState<RefreshStatus>(
    () => getRefreshStatus()
  );

  // Auto-refresh feed when facts change (content sync, preference changes)
  useEffect(() => {
    const unsubscribe = onFeedRefresh(async () => {
      const sections = await loadDailyFeedSections(locale, true);
      queryClient.setQueryData(homeKeys.dailyFeed(locale), sections);
      // Reset carousel scroll positions
      refs.latestListRef.current?.scrollToOffset({ offset: 0, animated: false });
      refs.onThisDayListRef.current?.scrollToOffset({ offset: 0, animated: false });
      // Re-fetch keep reading and streak
      queryClient.invalidateQueries({ queryKey: homeKeys.keepReading(locale) });
      queryClient.invalidateQueries({ queryKey: homeKeys.readingStreak() });
      signalFeedLoaded();
    });
    return () => unsubscribe();
  }, [locale, queryClient, refs.latestListRef, refs.onThisDayListRef]);

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
