/**
 * Module-level promise gates coordinating the JS splash overlay with app
 * initialization and the home screen's first real paint.
 *
 * These are module-level (not React context) on purpose: the gates must be
 * created by _layout's init code BEFORE the React tree that resolves them
 * mounts, and consumed by the SplashOverlay which lives outside that tree.
 *
 * Flow for a returning user:
 *   1. _layout's initializeApp() calls setHomeRenderPending() right before
 *      flipping the app to ready (which mounts the provider tree + home screen
 *      underneath the splash overlay).
 *   2. SplashOverlay waits on waitForHomeScreenReady() once the tree is
 *      mounted (its `appReady` prop).
 *   3. The home screen resolves the gates: signalHomeScreenRendered() once its
 *      settled content has been drawn, and signalHeroImageReady() once the
 *      first Latest card's image has decoded (or will never arrive).
 *   4. The overlay fades out over a fully painted home screen.
 *
 * Every gate is capped with a timeout so a missed signal degrades to a longer
 * splash, never a stuck one.
 */

// Max wait for the home screen to render its settled content, measured from
// when the SplashOverlay starts waiting (i.e. after init completes). Covers
// provider mount + React Query persist restore + feed fetch (cache or one
// network attempt) + first list paint.
const HOME_RENDER_MAX_WAIT_MS = 6000;

// Max wait for the hero card's image, measured from when the home screen has
// rendered (the image can't even start drawing before that).
const HERO_IMAGE_MAX_WAIT_MS = 2500;

// ── Home render gate ──
let homeRenderedResolve: (() => void) | null = null;
let homeRenderedPromise: Promise<void> | null = null;

// ── Hero image gate (first Latest carousel card) ──
let heroImageResolve: (() => void) | null = null;
let heroImagePromise: Promise<void> | null = null;

// ── Locale refresh gate ──
// When set, the splash overlay also waits for the locale-change refresh flow.
let localeRefreshResolve: (() => void) | null = null;
let localeRefreshPromise: Promise<void> | null = null;

// ── Feed loaded gate ──
// Used by _layout's locale-change flow to wait for the home screen to mount
// and kick off its feed. Separate from the render gate because _layout awaits
// it mid-initialization, before the splash overlay's wait even starts.
let feedLoadedResolve: (() => void) | null = null;
let feedLoadedPromise: Promise<void> | null = null;

/**
 * Arm the home-render and hero-image gates. Must be called BEFORE the app
 * tree mounts (i.e. before setInitialOnboardingStatus flips the app to ready)
 * so the gates exist when the SplashOverlay starts waiting.
 */
export function setHomeRenderPending(): void {
  homeRenderedPromise = new Promise((resolve) => {
    homeRenderedResolve = resolve;
  });
  heroImagePromise = new Promise((resolve) => {
    heroImageResolve = resolve;
  });
}

/** The home screen's settled content (cards or empty state) has been drawn. */
export function signalHomeScreenRendered(): void {
  if (homeRenderedResolve) {
    homeRenderedResolve();
    homeRenderedResolve = null;
    homeRenderedPromise = null;
  }
}

/**
 * The first Latest card's image has decoded — or is known to never arrive
 * (empty feed), in which case there is nothing left to wait for.
 */
export function signalHeroImageReady(): void {
  if (heroImageResolve) {
    heroImageResolve();
    heroImageResolve = null;
    heroImagePromise = null;
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
 * Signal that the home screen has mounted and kicked off its feed load.
 * Called from the home screen's useHomeFeedEvents hook.
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
    return withTimeout(feedLoadedPromise, 5000);
  }
  return Promise.resolve();
}

/**
 * Awaited by the SplashOverlay (once the app tree is mounted) before it starts
 * its fade-out. Resolves when the home screen has actually painted — or after
 * the timeout caps, whichever comes first. Resolves immediately when no gates
 * are armed (fresh install heading to onboarding).
 */
export function waitForHomeScreenReady(): Promise<void> {
  const gates: Promise<void>[] = [];

  if (homeRenderedPromise) {
    const renderGate = withTimeout(homeRenderedPromise, HOME_RENDER_MAX_WAIT_MS);
    gates.push(renderGate);

    const heroGate = heroImagePromise;
    if (heroGate) {
      // The hero image only starts loading once the home content has
      // rendered, so its timeout clock starts after the render gate.
      gates.push(renderGate.then(() => withTimeout(heroGate, HERO_IMAGE_MAX_WAIT_MS)));
    }
  }

  if (localeRefreshPromise) {
    // No cap needed: the locale-refresh flow is itself bounded by
    // waitForFeedLoaded's timeout.
    gates.push(localeRefreshPromise);
  }

  if (gates.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(gates).then(() => {});
}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}
