import { useEffect } from 'react';

import { signalFeedLoaded } from '../contexts';

import type { FlashListRef } from '@shopify/flash-list';
import type { FactWithRelations } from '../services/database';

interface CarouselRefs {
  latestListRef: React.RefObject<FlashListRef<FactWithRelations> | null>;
  onThisDayListRef: React.RefObject<FlashListRef<FactWithRelations> | null>;
  outerListRef: React.RefObject<FlashListRef<any> | null>;
}

interface UseHomeFeedEventsResult {
  backgroundRefreshStatus: 'idle';
}

/**
 * Home feed is served on demand from the API and cached by React Query, so the
 * old background-sync event plumbing (onFeedRefresh / loadDailyFeedSections /
 * offline image precache) is gone. This hook now just signals "feed loaded"
 * once; pull-to-refresh in the screen invalidates the React Query cache.
 */
export function useHomeFeedEvents(_locale: string, _refs: CarouselRefs): UseHomeFeedEventsResult {
  useEffect(() => {
    signalFeedLoaded();
  }, []);

  return { backgroundRefreshStatus: 'idle' };
}
