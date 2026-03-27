import { createContext, type ReactNode, useCallback, useContext, useRef } from 'react';

import type { DailyFeedSections } from '../services/dailyFeed';
import type { FactWithRelations } from '../services/database';

// Module-level storage for preloaded data
// This allows setting data before React providers mount
let preloadedFactsStorage: FactWithRelations[] | null = null;
let preloadedRecommendationsStorage: FactWithRelations[] | null = null;

// Module-level storage for onboarding-preloaded daily feed
// Set by success screen, consumed by home screen on first mount
let onboardingFeedStorage: DailyFeedSections | null = null;

export function setOnboardingPreloadedFeed(feed: DailyFeedSections): void {
  onboardingFeedStorage = feed;
}

export function consumeOnboardingPreloadedFeed(): DailyFeedSections | null {
  const feed = onboardingFeedStorage;
  onboardingFeedStorage = null;
  return feed;
}

// Module-level promise for home screen ready signal
let homeScreenReadyResolve: (() => void) | null = null;
let homeScreenReadyPromise: Promise<void> | null = null;

// Module-level promise for first carousel image ready signal
let carouselImageReadyResolve: (() => void) | null = null;
let carouselImageReadyPromise: Promise<void> | null = null;

// Module-level promise for locale refresh gate
// When set, splash overlay will wait for this before fading out
let localeRefreshResolve: (() => void) | null = null;
let localeRefreshPromise: Promise<void> | null = null;

// Module-level promise for feed loaded gate
// Used by _layout.tsx to wait for the home screen to finish loading feed data
// before releasing the splash. NOT added to waitForHomeScreenReady() because
// the promise can be resolved (and nulled) before the SplashOverlay mounts.
let feedLoadedResolve: (() => void) | null = null;
let feedLoadedPromise: Promise<void> | null = null;

export function setPreloadedFactsBeforeMount(facts: FactWithRelations[]) {
  preloadedFactsStorage = facts;
  // Create a promise that will resolve when home screen signals ready
  homeScreenReadyPromise = new Promise((resolve) => {
    homeScreenReadyResolve = resolve;
  });
}

export function setPreloadedRecommendationsBeforeMount(recs: FactWithRelations[]) {
  preloadedRecommendationsStorage = recs;
  if (recs.length > 0) {
    // Create a promise that will resolve when the first carousel image loads
    carouselImageReadyPromise = new Promise((resolve) => {
      carouselImageReadyResolve = resolve;
    });
  }
}

/**
 * Call before setting onboarding status to gate the splash overlay.
 * The splash won't fade out until signalLocaleRefreshDone() is called.
 */
export function setLocaleRefreshPending(): void {
  localeRefreshPromise = new Promise((resolve) => {
    localeRefreshResolve = resolve;
  });
}

/**
 * Signal that the locale refresh (and app open ad) are done.
 * This unblocks the splash overlay fade-out.
 */
export function signalLocaleRefreshDone(): void {
  if (localeRefreshResolve) {
    localeRefreshResolve();
    localeRefreshResolve = null;
    localeRefreshPromise = null;
  }
}

/**
 * Call during locale change to gate the splash until the home screen
 * has finished loading feed data into its state.
 */
export function setFeedLoadPending(): void {
  feedLoadedPromise = new Promise((resolve) => {
    feedLoadedResolve = resolve;
  });
}

/**
 * Signal that the home screen has finished loading feed data.
 * Called from the home screen's onFeedRefresh handler.
 */
export function signalFeedLoaded(): void {
  if (feedLoadedResolve) {
    feedLoadedResolve();
    feedLoadedResolve = null;
    feedLoadedPromise = null;
  }
}

/**
 * Wait for the home screen to finish loading feed data.
 * Used by _layout.tsx to block before releasing the splash.
 * Returns immediately if no feed load is pending.
 */
export function waitForFeedLoaded(): Promise<void> {
  if (feedLoadedPromise) {
    return Promise.race([
      feedLoadedPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
  return Promise.resolve();
}

// Called by SplashOverlay to wait for home screen to be ready
export function waitForHomeScreenReady(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (homeScreenReadyPromise) {
    // Add a timeout fallback (2 seconds max wait)
    promises.push(
      Promise.race([
        homeScreenReadyPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ])
    );
  }

  if (carouselImageReadyPromise) {
    // Wait for first carousel image to load (3 second max wait)
    promises.push(
      Promise.race([
        carouselImageReadyPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ])
    );
  }

  if (localeRefreshPromise) {
    promises.push(localeRefreshPromise);
  }

  if (promises.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(promises).then(() => {});
}

interface PreloadedDataContextType {
  consumePreloadedFacts: () => FactWithRelations[] | null;
  consumePreloadedRecommendations: () => FactWithRelations[] | null;
  signalHomeScreenReady: () => void;
  signalCarouselImageReady: () => void;
}

const PreloadedDataContext = createContext<PreloadedDataContextType | null>(null);

export function PreloadedDataProvider({ children }: { children: ReactNode }) {
  // Move module-level data into ref on mount
  const factsRef = useRef<FactWithRelations[] | null>(preloadedFactsStorage);
  const recsRef = useRef<FactWithRelations[] | null>(preloadedRecommendationsStorage);

  // Clear module-level storage after reading
  if (preloadedFactsStorage) {
    preloadedFactsStorage = null;
  }
  if (preloadedRecommendationsStorage) {
    preloadedRecommendationsStorage = null;
  }

  const consumePreloadedFacts = useCallback((): FactWithRelations[] | null => {
    const facts = factsRef.current;
    factsRef.current = null;
    return facts;
  }, []);

  const consumePreloadedRecommendations = useCallback((): FactWithRelations[] | null => {
    const recs = recsRef.current;
    recsRef.current = null;
    return recs;
  }, []);

  const signalHomeScreenReady = useCallback(() => {
    if (homeScreenReadyResolve) {
      homeScreenReadyResolve();
      homeScreenReadyResolve = null;
      homeScreenReadyPromise = null;
    }
  }, []);

  const signalCarouselImageReady = useCallback(() => {
    if (carouselImageReadyResolve) {
      carouselImageReadyResolve();
      carouselImageReadyResolve = null;
      carouselImageReadyPromise = null;
    }
  }, []);

  return (
    <PreloadedDataContext.Provider
      value={{
        consumePreloadedFacts,
        consumePreloadedRecommendations,
        signalHomeScreenReady,
        signalCarouselImageReady,
      }}
    >
      {children}
    </PreloadedDataContext.Provider>
  );
}

export function usePreloadedData() {
  const context = useContext(PreloadedDataContext);
  if (!context) {
    throw new Error('usePreloadedData must be used within a PreloadedDataProvider');
  }
  return context;
}
