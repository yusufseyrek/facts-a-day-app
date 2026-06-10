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
