import { createContext, useContext } from 'react';

/**
 * True for any component mounted inside the (tabs) layout — including the
 * shared screens that exist as BOTH tab re-exports and root-stack routes
 * (app/(tabs)/trivia/* re-export app/trivia/*).
 *
 * Deliberately a context set by the layout, NOT `useSegments()`: segments
 * reflect the FOCUSED route, so a still-mounted tab screen covered by a
 * pushed stack screen would read the pushed route's segments (and every
 * subscriber would re-render on every navigation).
 */
const InsideTabsContext = createContext(false);

export const InsideTabsProvider = InsideTabsContext.Provider;

export function useInsideTabs(): boolean {
  return useContext(InsideTabsContext);
}
