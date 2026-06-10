/**
 * Tracks the last non-search tab the user was on.
 *
 * Used by the iOS 26 search-tab exit flow: the role="search" tab's ✕ button is
 * NOT a tab-bar event — it's the cancel button of the screen's
 * headerSearchBarOptions UISearchController, which iOS 26 integrates into the
 * tab bar. UIKit swallows the press without touching tab selection, so the
 * search screen handles onCancelButtonPress and needs to know where to return.
 * The tabs layout (which watches the pathname) records it here.
 */
let lastNonSearchTabPath = '/';

export function setLastNonSearchTabPath(path: string): void {
  lastNonSearchTabPath = path;
}

export function getLastNonSearchTabPath(): string {
  return lastNonSearchTabPath;
}

/**
 * Search-session reset: emitted by the tabs layout when the user LEAVES the
 * search tab for another real tab (✕ exit or a direct tab switch). The search
 * screen listens and clears its query/category scope so the next entry into
 * search mode targets ALL facts instead of reopening a stale "Search in X"
 * browse. Leaving to a non-tab route (e.g. opening /fact/123 from results)
 * deliberately does NOT emit — returning from a fact continues the session.
 */
type SearchSessionResetListener = () => void;
const searchSessionResetListeners = new Set<SearchSessionResetListener>();

export function emitSearchSessionReset(): void {
  searchSessionResetListeners.forEach((listener) => listener());
}

export function onSearchSessionReset(listener: SearchSessionResetListener): () => void {
  searchSessionResetListeners.add(listener);
  return () => {
    searchSessionResetListeners.delete(listener);
  };
}
