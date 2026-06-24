import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { usePathname } from 'expo-router';

import { refreshHomeContent } from '../services/contentRefresh';

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
 *    on another tab), so content is fresh by the time the user looks at it.
 *
 * Both go through refreshHomeContent, which gates on data age so rapid
 * navigation can't trigger a refetch storm. Pull-to-refresh stays separate as
 * the explicit, force-refresh path (see the home screen's handleRefresh).
 */
export function useHomeContentRefresh(locale: string): void {
  // Home lives at the root path '/'. This fires on first mount (cold start) and
  // every time the route returns to home.
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === '/') {
      refreshHomeContent(locale, { source: 'focus' });
    }
  }, [pathname, locale]);

  // AppState 'change' also fires inactive→active (control center, share sheet,
  // permission dialogs); only react to a real background→active transition so
  // those momentary blurs don't trigger a refetch.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current === 'background' && next === 'active') {
        refreshHomeContent(locale, { source: 'foreground' });
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [locale]);
}
