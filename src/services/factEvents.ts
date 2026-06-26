import { AppState } from 'react-native';

import { postFactEvents, type FactEventPayload } from './api';

/**
 * First-party engagement tracker (the app side of our own analytics).
 *
 * Records per-fact interactions — view / favorite / share — to our backend so
 * the admin can see which facts get the most engagement. Comments are NOT sent
 * here; they're counted server-side from the comments they already create.
 *
 * Design: anonymous (only fact id + type), batched (a short debounce so several
 * quick actions go in one request), and fire-and-forget (a failed analytics ping
 * is swallowed, never retried). Disabled in dev — matching Firebase/PostHog — so
 * dev/test runs don't need a backend.
 */

export type FactEventType = FactEventPayload['type'];

/** Coalesce bursts: wait this long after the last event before flushing. */
const FLUSH_DEBOUNCE_MS = 4000;
/** Flush immediately once the queue reaches this size. */
const MAX_QUEUE = 20;
/** Backend's per-request cap (mirror of the server's MAX_BATCH). */
const MAX_BATCH = 50;

let queue: FactEventPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let appStateBound = false;

function clearTimer(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(flushFactEvents, FLUSH_DEBOUNCE_MS);
}

/**
 * Send the queued events (up to the backend batch cap) and forget. If more than
 * one batch is queued, the remainder is rescheduled.
 */
export function flushFactEvents(): void {
  clearTimer();
  if (queue.length === 0) return;

  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);

  // Fire-and-forget: analytics must never surface an error or block anything.
  postFactEvents(batch).catch(() => {});

  if (queue.length > 0) scheduleFlush();
}

function bindAppState(): void {
  if (appStateBound) return;
  appStateBound = true;
  // Flush as the app leaves the foreground so queued events aren't stranded when
  // it's backgrounded or killed.
  AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') flushFactEvents();
  });
}

/**
 * Record a first-party engagement event for a fact. Cheap and safe to call from
 * hot paths — it only enqueues. No-op in dev.
 */
export function enqueueFactEvent(factId: number, type: FactEventType): void {
  if (__DEV__) return;
  if (!Number.isInteger(factId) || factId <= 0) return;

  bindAppState();
  queue.push({ fact_id: factId, type });

  if (queue.length >= MAX_QUEUE) flushFactEvents();
  else scheduleFlush();
}

/** Test seam: reset module state between cases. */
export const __testing = {
  reset(): void {
    queue = [];
    clearTimer();
    appStateBound = false;
  },
  getQueueLength(): number {
    return queue.length;
  },
};
