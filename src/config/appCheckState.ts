/**
 * App Check Shared State
 *
 * Shared state for App Check initialization, extracted into its own module
 * to avoid circular dependencies between firebase.ts and appCheckToken.ts.
 */

// Track if App Check is initialized
let appCheckInitialized = false;

// Track if App Check initialization failed (for blocking screen)
let appCheckInitFailed = false;

// Subscribers for failure state changes
type FailureListener = (failed: boolean) => void;
const failureListeners = new Set<FailureListener>();

// Resettable deferred promise for App Check readiness
let appCheckReadyResolve: () => void;
let appCheckReadyPromise = new Promise<void>((resolve) => {
  appCheckReadyResolve = resolve;
});

/**
 * Check if App Check is initialized
 */
export function isAppCheckInitialized(): boolean {
  return appCheckInitialized;
}

/**
 * Mark App Check as initialized (called by firebase.ts after successful init)
 */
export function setAppCheckInitialized(value: boolean): void {
  appCheckInitialized = value;
}

/**
 * Get the current appCheckReady promise
 */
export function getAppCheckReady(): Promise<void> {
  return appCheckReadyPromise;
}

/**
 * Resolve the appCheckReady promise (safe to call multiple times — no-op after first)
 */
export function resolveAppCheckReady(): void {
  appCheckReadyResolve();
}

/**
 * Reset the appCheckReady promise (for retry flow)
 * Creates a new unresolved promise so consumers will wait again
 */
export function resetAppCheckReady(): void {
  appCheckReadyPromise = new Promise<void>((resolve) => {
    appCheckReadyResolve = resolve;
  });
}

/**
 * Check if App Check initialization has failed
 */
export function isAppCheckInitFailed(): boolean {
  return appCheckInitFailed;
}

/**
 * Set the App Check init failure state and notify subscribers
 */
export function setAppCheckInitFailed(value: boolean): void {
  appCheckInitFailed = value;
  for (const listener of failureListeners) {
    listener(value);
  }
}

/**
 * Subscribe to App Check failure state changes
 * Returns an unsubscribe function
 */
export function subscribeAppCheckFailure(listener: FailureListener): () => void {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}
