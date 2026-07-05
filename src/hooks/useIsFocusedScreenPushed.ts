import { useEffect, useState } from 'react';

import { useNavigationContainerRef } from 'expo-router';

import { isFocusedScreenPushed } from '../utils/navigationState';

/**
 * Live "does the focused screen show a native back control?" — true whenever
 * the focused route chain crosses a stack navigator that sits above its first
 * route (root stack pushes like /stats and /badges, AND second-level tab
 * screens like trivia/leaderboard or settings/library).
 *
 * Reads the container ref imperatively and subscribes to its 'state' events:
 * expo-router 57's useRootNavigationState() calls getState() during render
 * without subscribing, so on its own it only refreshes when the caller happens
 * to re-render — an explicit subscription keeps this correct even for callers
 * with no other reason to re-render.
 */
export function useIsFocusedScreenPushed(): boolean {
  const navigationRef = useNavigationContainerRef();
  const [pushed, setPushed] = useState(() =>
    navigationRef.isReady() ? isFocusedScreenPushed(navigationRef.getRootState()) : false
  );

  useEffect(() => {
    const update = () =>
      setPushed(navigationRef.isReady() ? isFocusedScreenPushed(navigationRef.getRootState()) : false);
    // Catch any navigation that landed between initial render and subscription.
    update();
    return navigationRef.addListener('state', update);
  }, [navigationRef]);

  return pushed;
}
