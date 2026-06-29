import { useSyncExternalStore } from 'react';

/**
 * Tracks whether a blocking centered dialog (DialogShell) is currently
 * presented. The persistent tab-bar banner reads this to hide itself while a
 * dialog is up.
 *
 * Why: on iOS a DialogShell presents as an IN-WINDOW overlay (so its Liquid
 * Glass backdrop can refract), nested inside the focused tab screen. The banner
 * is a SIBLING of the whole tab navigator, rendered after it at the (tabs)
 * layout with zIndex 400 — so it paints ABOVE that in-window overlay. Without
 * this, the banner floats over the dimmed backdrop and can cover a tall
 * dialog's footer (e.g. the notification time picker's Save button) and even
 * steal its taps. Suppressing the banner for the dialog's lifetime is both the
 * fix and the correct look (no ad over a modal scrim).
 *
 * Ref-counted: nested/overlapping dialogs must ALL close before the banner
 * returns. Listeners fire only when crossing the 0↔1 boundary, so the banner
 * re-renders only when its visibility actually flips.
 */
let _count = 0;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const l of listeners) l();
};

/**
 * Mark a dialog as presented; returns an idempotent unregister fn that clears
 * it. Designed to be returned straight from a `useEffect` (register on open,
 * unregister on close/unmount).
 */
export const registerModalPresent = (): (() => void) => {
  _count += 1;
  if (_count === 1) emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    _count -= 1;
    if (_count === 0) emit();
  };
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): boolean => _count > 0;

/** Re-renders the caller when a dialog opens or the last one closes. */
export const useAnyModalPresent = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
