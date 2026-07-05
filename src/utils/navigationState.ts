/**
 * Structural inspection of a react-navigation state tree.
 *
 * `isFocusedScreenPushed` answers: does the CURRENTLY FOCUSED screen sit above
 * the root of some stack navigator — i.e. does it carry a native back control
 * in the header's top-left corner? It walks the focused-route chain (root
 * stack → tab navigator → the active tab's stack → …) and reports true when
 * any stack along that chain is above its first route.
 *
 * This exists to replace per-screen NAME LISTS for "is there a back button
 * here?" decisions (mini-player positioning). Those lists drifted every time a
 * new pushed screen shipped — the trivia profile screen got a header queue
 * button AND the floating pill because it was never added to the suppression
 * list. A structural walk covers future pushed screens automatically.
 */

// Minimal structural shape of a navigation state. Deliberately local:
// expo-router 57 vendors react-navigation, so its state types aren't
// addressable as a declared dependency — and the walk only needs these fields.
export type NavigationStateLike = {
  type?: string;
  index?: number;
  routes?: { state?: NavigationStateLike }[];
};

export function isFocusedScreenPushed(state: NavigationStateLike | undefined): boolean {
  let s = state;
  while (s?.routes?.length) {
    // Partial (rehydrating) states may omit `index`; react-navigation treats
    // the last route as focused in that case.
    const index = typeof s.index === 'number' ? s.index : s.routes.length - 1;
    if (s.type === 'stack' && index > 0) return true;
    s = s.routes[index]?.state;
  }
  return false;
}
