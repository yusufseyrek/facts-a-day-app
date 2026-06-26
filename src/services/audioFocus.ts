/**
 * audioFocus — an app-wide "single active player" coordinator.
 *
 * The app runs several INDEPENDENT expo-audio players that must never sound at
 * the same time:
 *   - the global queue player (AudioQueueContext), and
 *   - one inline narration player per open fact (useFactAudio). There can be
 *     MORE THAN ONE inline player alive at once — e.g. the in-tab fact overlay
 *     stays mounted underneath a fact pushed as a route on top of it.
 *
 * expo-audio does not arbitrate between players inside the same app (its
 * `interruptionMode` only governs mixing with OTHER apps), so without explicit
 * coordination two of our players happily play together.
 *
 * Contract: a player calls `acquireAudioFocus(pause)` the instant it starts or
 * resumes playback, passing a STABLE callback that silences it. Acquiring focus
 * pauses whoever held it before, so at most one player is ever sounding —
 * regardless of how many are mounted. The `pause` callback's identity doubles as
 * the holder's identity, so a player re-acquiring focus never pauses itself.
 *
 * This is deliberately a tiny module-level singleton (like the playback-progress
 * store in AudioQueueContext): players acquire/release imperatively at their real
 * play()/pause() sites, which is a reliable signal — unlike inferring "started"
 * from a derived `isPlaying` boolean, which lags async loads and misses
 * restart-in-place (skip/next/replay the current track).
 */
type PauseFn = () => void;

let activePause: PauseFn | null = null;

/**
 * Claim exclusive audio focus, pausing the previous holder. Call this right
 * before starting/resuming playback. `pause` must be stable per player (its
 * identity is how we recognise the holder and avoid self-pausing).
 */
export function acquireAudioFocus(pause: PauseFn): void {
  const previous = activePause;
  activePause = pause;
  if (previous && previous !== pause) {
    try {
      previous();
    } catch {
      // A torn-down/released player's pause may throw; focus has already moved on.
    }
  }
}

/**
 * Relinquish focus if `pause` currently holds it. Call on an explicit
 * user/system pause, stop, or unmount so a dead player isn't left as the holder.
 * No-op if another player already took focus (then `pause` isn't the holder).
 */
export function releaseAudioFocus(pause: PauseFn): void {
  if (activePause === pause) activePause = null;
}

/** Test-only: clear the module-level holder between test cases. */
export function resetAudioFocusForTests(): void {
  activePause = null;
}
