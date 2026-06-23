import { useSyncExternalStore } from 'react';

/**
 * Height (px) currently occupied by the persistent tab-bar banner, published by
 * PersistentTabBarBanner via onLayout. It's 0 when the banner is hidden (premium,
 * ads disabled, no-fill), and the measured banner height when it's showing. Tab
 * screens add this to their scroll content's bottom padding so the last item
 * clears the banner — reserving space only when an ad is actually on screen.
 */
let _height = 0;
const listeners = new Set<() => void>();

export const getTabBarBannerHeight = (): number => _height;

export const setTabBarBannerHeight = (height: number): void => {
  const rounded = Math.round(height);
  if (rounded === _height) return;
  _height = rounded;
  for (const l of listeners) l();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Re-renders the caller when the tab-bar banner's reserved height changes. */
export const useTabBarBannerInset = (): number =>
  useSyncExternalStore(subscribe, getTabBarBannerHeight, getTabBarBannerHeight);
