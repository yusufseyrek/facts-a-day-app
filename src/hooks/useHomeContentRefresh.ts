import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { usePathname } from 'expo-router';

import { HOME_FEED } from '../config/app';
import { type FeedRefreshSource } from '../services/analytics';
import { refreshHomeContent } from '../services/contentRefresh';
import { getFactOverlay, subscribeFactOverlay } from '../services/factMorph';

/**
 * The home screen's single automatic refresh driver. Re-validates the feed, On
 * This Day, and the story buttons whenever fresh content could exist:
 *
 *  - the home tab becomes the active route — cold start, switching back to the
 *    tab, or returning from a pushed detail screen. Tracked via the pathname
 *    ('/'), which updates reliably under native tabs where JS focus events
 *    (useFocusEffect) do not, and also covers the app-foreground-onto-home and
 *    tab-switch cases that a focus listener missed;
 *  - the app returns to the foreground while home is mounted (e.g. backgrounded
 *    on another tab), so content is fresh by the time the user looks at it;
 *  - a periodic poll (CONTENT_POLL_INTERVAL_MS) while the user lingers on home,
 *    so the feed keeps refreshing without a manual pull.
 *
 * The poll only runs while home is the active route, the app is foregrounded,
 * AND no fact-detail overlay is covering home — never off-screen, never in the
 * background, never behind an open fact (that overlay presents in-(tabs) without
 * changing the pathname, so it's tracked via the fact-overlay store, not the
 * route). It is re-armed after every refresh so its interval is measured from
 * the last refresh of any kind. The
 * event-driven refreshes go through refreshHomeContent's data-age gate so rapid
 * navigation can't trigger a refetch storm; the poll uses force (the timer is
 * itself the rate limiter) so a fetch completing a few ms inside the gate window
 * can't make it skip a tick. Pull-to-refresh stays separate as the explicit,
 * force-refresh path (see the home screen's handleRefresh).
 */
export function useHomeContentRefresh(locale: string): void {
  // Home lives at the root path '/'.
  const pathname = usePathname();
  const isHomeActive = pathname === '/';

  // Long-lived listeners/timers read current values through refs so they don't
  // need to re-subscribe (and re-arm) on every locale/route change.
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const isHomeActiveRef = useRef(isHomeActive);
  isHomeActiveRef.current = isHomeActive;

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // (Re)arm the periodic poll from now. clearInterval first so callers can reset
  // the cadence after an event-driven refresh without stacking timers.
  const startPolling = useCallback(() => {
    stopPolling();
    pollTimerRef.current = setInterval(() => {
      // Belt-and-suspenders: the lifecycle below already stops the poll when home
      // is hidden, the app is backgrounded, or a fact-detail overlay is up, but
      // guard the tick too. The overlay presents in-(tabs) over home WITHOUT
      // changing the pathname, so isHomeActive alone stays true while the user
      // reads a fact — without the overlay check the poll keeps refetching the
      // home feed off-screen (the repeated app_feed_refresh{interval}) and
      // competes with the fact detail's own requests.
      if (
        !isHomeActiveRef.current ||
        AppState.currentState !== 'active' ||
        getFactOverlay() !== null
      ) {
        return;
      }
      refreshHomeContent(localeRef.current, { source: 'interval', force: true });
    }, HOME_FEED.CONTENT_POLL_INTERVAL_MS);
  }, [stopPolling]);

  // Refresh now (gated) and re-arm the poll so the next tick is a full interval
  // away — avoids an event refresh and a poll tick landing back-to-back.
  const refreshAndArm = useCallback(
    (source: FeedRefreshSource) => {
      refreshHomeContent(localeRef.current, { source });
      startPolling();
    },
    [startPolling]
  );

  // Home becomes the active route (cold start / tab switch / return from detail):
  // refresh and start polling. Leaving home (or unmount) stops the poll. The
  // poll's own tick guard + the AppState effect keep it from fetching in the
  // background, so we don't gate the refresh itself on AppState here.
  useEffect(() => {
    if (isHomeActive && getFactOverlay() === null) {
      refreshAndArm('focus');
    }
    return stopPolling;
  }, [isHomeActive, locale, refreshAndArm, stopPolling]);

  // AppState 'change' also fires inactive→active (control center, share sheet,
  // permission dialogs); only refresh on a real background→active transition so
  // those momentary blurs don't trigger a refetch. Pause the poll whenever we
  // leave 'active' and resume it on return so it never fetches in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const wasBackground = appStateRef.current === 'background';
      appStateRef.current = next;

      if (next !== 'active') {
        stopPolling();
        return;
      }
      if (!isHomeActiveRef.current) return;
      // Real return-to-foreground: refresh + arm. Transient inactive→active, or
      // returning while a fact overlay still covers home: just resume the poll
      // (no refetch, matching the focus gate's intent).
      if (wasBackground && getFactOverlay() === null) {
        refreshAndArm('foreground');
      } else {
        startPolling();
      }
    });
    return () => sub.remove();
  }, [refreshAndArm, startPolling, stopPolling]);

  // The fact-detail overlay presents in-(tabs) over home without changing the
  // pathname, so the route-based isHomeActive can't see it. Mirror the focus
  // lifecycle off the overlay store: opening a fact pauses the poll (the user is
  // reading, not browsing home); dismissing it re-validates + re-arms, exactly
  // like leaving and returning to the home route.
  useEffect(() => {
    return subscribeFactOverlay(() => {
      if (getFactOverlay() !== null) {
        stopPolling();
        return;
      }
      if (isHomeActiveRef.current && AppState.currentState === 'active') {
        refreshAndArm('focus');
      }
    });
  }, [refreshAndArm, stopPolling]);
}
