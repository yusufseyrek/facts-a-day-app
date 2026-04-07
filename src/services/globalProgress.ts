/**
 * Global Progress Service
 *
 * Module-level progress state that any part of the app can write to.
 * The GlobalProgressBar component (rendered in the tab layout) subscribes
 * and displays progress above the tab bar across all tabs.
 *
 * Usage:
 *   setGlobalProgress(0.5);   // 50%
 *   setGlobalProgress(1);     // 100%
 *   clearGlobalProgress();    // hide bar
 */

type ProgressListener = (progress: number | null) => void;

const listeners = new Set<ProgressListener>();
let currentProgress: number | null = null;

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn(currentProgress);
    } catch (e) {
      console.error('Error in global progress listener:', e);
    }
  });
}

export function setGlobalProgress(progress: number): void {
  currentProgress = progress;
  emit();
}

export function clearGlobalProgress(): void {
  currentProgress = null;
  emit();
}

export function onGlobalProgressChange(listener: ProgressListener): () => void {
  listeners.add(listener);
  // Immediately emit current state so late subscribers get it
  if (currentProgress !== null) {
    try {
      listener(currentProgress);
    } catch (e) {
      console.error('Error in global progress listener (initial):', e);
    }
  }
  return () => {
    listeners.delete(listener);
  };
}
