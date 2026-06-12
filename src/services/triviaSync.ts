import * as Localization from 'expo-localization';

import { getLocaleFromCode } from '../i18n/config';

import * as api from './api';
import * as database from './database';
import { getIdentity } from './userIdentity';

import type { TriviaSession } from './database';

/**
 * Pushes completed trivia sessions to the server leaderboard. Runs after
 * every completion, on cold start, and after a screen name is claimed — one
 * code path drains whatever the local ledger says is unsynced, so transient
 * failures self-heal on the next trigger.
 *
 * Sync semantics per submission outcome:
 * - 200, 400, 409: mark synced (stored, or permanently unsubmittable — a
 *   validation reject or a duplicate daily won't get better by retrying)
 * - 401, 429, network/5xx: stop the drain and leave the rest for next time
 *   (no identity yet, burst window full, or the server is unreachable)
 */

/** Sessions older than this never retro-submit — keeps a fresh claim from
 * flooding the board with stale games. */
const RETRO_WINDOW_DAYS = 7;
const BATCH_LIMIT = 10;

/** Stable per-session id so launch-time retries collapse server-side. The
 * completed_at salt keeps ids unique across reinstalls (local row ids reset). */
export function clientSessionId(session: Pick<TriviaSession, 'id' | 'completed_at'>): string {
  return `s${session.id}-${Date.parse(session.completed_at) || 0}`;
}

function deviceLanguage(): string {
  try {
    return getLocaleFromCode(Localization.getLocales()[0]?.languageCode || 'en');
  } catch {
    return 'en';
  }
}

function toSubmission(session: TriviaSession, language: string): api.TriviaResultSubmission | null {
  if (
    session.trivia_mode !== 'daily' &&
    session.trivia_mode !== 'mixed' &&
    session.trivia_mode !== 'category'
  ) {
    return null;
  }
  return {
    client_session_id: clientSessionId(session),
    mode: session.trivia_mode,
    category_slug:
      session.trivia_mode === 'category' ? (session.category_slug ?? undefined) : undefined,
    language,
    questions_total: session.total_questions,
    correct_count: session.correct_answers,
    // Local sessions store seconds; the wire format is milliseconds.
    elapsed_ms: (session.elapsed_time ?? 0) * 1000,
  };
}

/** True for outcomes that will never improve by retrying. */
function isPermanentRejection(status: unknown): boolean {
  return status === 400 || status === 409;
}

let syncInFlight = false;

/**
 * Drain unsynced sessions to the server. Safe to call from anywhere,
 * fire-and-forget; concurrent calls collapse into one drain.
 */
export async function syncTriviaResults(): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const identity = await getIdentity();
    if (!identity) return; // nothing to do until a name is claimed

    const since = new Date(Date.now() - RETRO_WINDOW_DAYS * 86_400_000).toISOString();
    const sessions = await database.getUnsyncedTriviaSessions(since, BATCH_LIMIT);
    if (sessions.length === 0) return;

    const language = deviceLanguage();

    for (const session of sessions) {
      const submission = toSubmission(session, language);
      if (!submission) {
        // Ineligible mode — ledger it so it never comes back.
        await database.markTriviaSessionSynced(session.id);
        continue;
      }

      try {
        await api.postTriviaResult(submission);
        await database.markTriviaSessionSynced(session.id);
      } catch (error) {
        if (isPermanentRejection((error as { status?: number })?.status)) {
          await database.markTriviaSessionSynced(session.id);
          continue;
        }
        // Identity gone, rate-limited, offline, or server error: stop and
        // let the next trigger pick up from here.
        return;
      }
    }
  } catch {
    // Never let sync failures surface — the next trigger retries.
  } finally {
    syncInFlight = false;
  }
}

/** Test hook: reset the in-flight guard. */
export function __resetTriviaSync(): void {
  syncInFlight = false;
}
