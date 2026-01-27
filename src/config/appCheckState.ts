/**
 * App Check Shared State
 *
 * Shared state for App Check initialization, extracted into its own module
 * to avoid circular dependencies between firebase.ts and appCheckToken.ts.
 */

// Track if App Check is initialized
let appCheckInitialized = false;

// Promise that resolves when App Check initialization is complete (or failed)
let appCheckReadyResolve: () => void;
export const appCheckReady = new Promise<void>((resolve) => {
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
 * Resolve the appCheckReady promise (safe to call multiple times — no-op after first)
 */
export function resolveAppCheckReady(): void {
  appCheckReadyResolve();
}
