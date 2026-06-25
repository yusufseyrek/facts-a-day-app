/**
 * Offline Library (premium)
 *
 * Lets premium users download a slice of the fact corpus — content, images, and
 * audio in their language — so it can be read and played with no connection.
 *
 * The corpus is far too large to mirror, so we cache the two ends users care
 * about: the NEWEST facts and the foundational OLDEST ones. The chosen size is
 * split half/half and capped per side (OFFLINE_LIBRARY.MAX_PER_SIDE), giving
 * "up to 1000 newest + 1000 oldest" at the 2000 maximum.
 *
 * Storage:
 *  - SQLite `offline_facts`: one row per cached fact, holding the full
 *    FactResponse JSON (the API is unreachable offline, so we keep everything
 *    the cards/detail need) plus the local media filenames.
 *  - documentDirectory/offline-library/images|audio: the pinned media. We use
 *    documentDirectory (NOT cacheDirectory) and our OWN dirs so the OS — and the
 *    existing TTL/LRU caches in images.ts / factAudio.ts — can never evict a
 *    download the user explicitly asked us to keep.
 *
 * An in-memory index (factId → media filenames) is loaded once so the image and
 * audio resolvers can answer synchronously on the hot render path.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { OFFLINE_LIBRARY, STORAGE_KEYS } from '../config/app';

import { getFactsFeed } from './api';
import { openDatabase } from './database';

import type { FactResponse } from './api';

const ROOT_DIR = `${FileSystem.documentDirectory}offline-library/`;
const IMAGES_DIR = `${ROOT_DIR}images/`;
const AUDIO_DIR = `${ROOT_DIR}audio/`;

type Side = 'tail' | 'head'; // tail = newest, head = oldest

interface IndexEntry {
  image: string | null; // filename in IMAGES_DIR
  audio: string | null; // filename in AUDIO_DIR
  language: string;
}

// ── schema ──────────────────────────────────────────────────────────────────

let schemaPromise: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = await openDatabase();
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS offline_facts (
          fact_id INTEGER PRIMARY KEY,
          language TEXT NOT NULL,
          side TEXT NOT NULL,
          seq INTEGER NOT NULL,
          data TEXT NOT NULL,
          image_file TEXT,
          audio_file TEXT,
          saved_at TEXT NOT NULL
        );
      `);
    })().catch((err) => {
      // Reset so a later call can retry rather than caching the rejection.
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

async function ensureDirs(): Promise<void> {
  for (const dir of [IMAGES_DIR, AUDIO_DIR]) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

// ── in-memory index (for the sync image/audio resolvers) ─────────────────────

let index: Map<number, IndexEntry> | null = null;
let indexPromise: Promise<Map<number, IndexEntry>> | null = null;

async function loadIndex(): Promise<Map<number, IndexEntry>> {
  await ensureSchema();
  const db = await openDatabase();
  const rows = await db.getAllAsync<{
    fact_id: number;
    image_file: string | null;
    audio_file: string | null;
    language: string;
  }>(`SELECT fact_id, image_file, audio_file, language FROM offline_facts`);
  const map = new Map<number, IndexEntry>();
  for (const r of rows) {
    map.set(r.fact_id, { image: r.image_file, audio: r.audio_file, language: r.language });
  }
  index = map;
  return map;
}

function ensureIndex(): Promise<Map<number, IndexEntry>> {
  if (index) return Promise.resolve(index);
  if (!indexPromise) {
    indexPromise = loadIndex().finally(() => {
      indexPromise = null;
    });
  }
  return indexPromise;
}

/** Pre-load the index (call once on app launch so resolvers are warm). */
export async function initOfflineLibrary(): Promise<void> {
  try {
    await ensureIndex();
  } catch {
    // Best-effort warmup; resolvers still lazy-load on first use.
  }
}

/**
 * Drop the cached index so the next resolver call reloads it from SQLite.
 * Call on app-locale change: downloaded audio is language-specific (keyed by
 * the language it was fetched in), so a switch must not keep answering from the
 * previous language's in-memory snapshot.
 */
export function invalidateOfflineIndex(): void {
  index = null;
  indexPromise = null;
}

// ── settings ─────────────────────────────────────────────────────────────────

/** The user's chosen cache size (facts). 0 = off. Clamped to the max. */
export async function getOfflineLimit(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_CACHE_LIMIT);
    const n = raw ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(n, OFFLINE_LIBRARY.MAX_FACTS);
  } catch {
    return 0;
  }
}

export async function setOfflineLimit(limit: number): Promise<void> {
  const clamped = Math.max(0, Math.min(Math.round(limit), OFFLINE_LIBRARY.MAX_FACTS));
  await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_CACHE_LIMIT, String(clamped));
}

export async function getLastSyncAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_LAST_SYNC);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function setLastSyncAt(epochMs: number): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_LAST_SYNC, String(epochMs));
}

// ── target-set math (pure, exported for tests) ───────────────────────────────

/**
 * Split a chosen total into per-side download targets: half newest, half
 * oldest, each capped at MAX_PER_SIDE. The newest side gets the odd one.
 */
export function computeSideTargets(limit: number): { newest: number; oldest: number } {
  const capped = Math.max(0, Math.min(Math.round(limit), OFFLINE_LIBRARY.MAX_FACTS));
  if (capped <= 0) return { newest: 0, oldest: 0 };
  const newest = Math.min(Math.ceil(capped / 2), OFFLINE_LIBRARY.MAX_PER_SIDE);
  const oldest = Math.min(capped - newest, OFFLINE_LIBRARY.MAX_PER_SIDE);
  return { newest, oldest };
}

// ── sync-state event store (drives the screen's progress UI) ─────────────────

export type OfflineSyncStatus = 'idle' | 'syncing' | 'done' | 'error' | 'cancelled';

export interface OfflineSyncState {
  status: OfflineSyncStatus;
  /** 'fetching' while collecting the id set, 'downloading' while saving media. */
  phase: 'fetching' | 'downloading' | null;
  total: number;
  completed: number;
}

let syncState: OfflineSyncState = { status: 'idle', phase: null, total: 0, completed: 0 };
const syncListeners = new Set<() => void>();
let cancelRequested = false;

function emit(next: Partial<OfflineSyncState>): void {
  syncState = { ...syncState, ...next };
  for (const l of syncListeners) l();
}

export function getOfflineSyncState(): OfflineSyncState {
  return syncState;
}

export function subscribeOfflineSync(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

export function isOfflineSyncing(): boolean {
  return syncState.status === 'syncing';
}

/** Ask an in-flight sync to stop at the next safe point. */
export function cancelOfflineSync(): void {
  if (syncState.status === 'syncing') cancelRequested = true;
}

// ── media download (own persistent dirs, no TTL/LRU) ─────────────────────────

const IMG_EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png', 'gif'];

function imageExtension(url: string): string {
  const path = url.split('?')[0];
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return IMG_EXTENSIONS.includes(ext) ? ext : 'webp';
}

function imageFilename(factId: number, url: string): string {
  return `fact-${factId}.${imageExtension(url)}`;
}

function audioFilename(factId: number, language: string): string {
  return `${factId}-${language}.mp3`;
}

/** Download a URL to `dir/filename` unless already present. Returns the
 *  filename on success, or null if the download failed. */
async function downloadTo(dir: string, filename: string, url: string): Promise<string | null> {
  const target = `${dir}${filename}`;
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists && (info as { size?: number }).size) return filename;
    const tmp = `${target}.${filename.length}.tmp`;
    const res = await FileSystem.downloadAsync(url, tmp);
    if (res.status !== 200) {
      await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
      return null;
    }
    const written = await FileSystem.getInfoAsync(tmp);
    if (!written.exists || !(written as { size?: number }).size) {
      await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
      return null;
    }
    await FileSystem.moveAsync({ from: tmp, to: target });
    return filename;
  } catch {
    return null;
  }
}

/** Persist one fact: download its media (idempotent) then upsert the row. */
async function saveFact(
  db: Awaited<ReturnType<typeof openDatabase>>,
  fact: FactResponse,
  side: Side,
  seq: number,
  language: string
): Promise<void> {
  let imageFile: string | null = null;
  if (fact.image_url) {
    imageFile = await downloadTo(IMAGES_DIR, imageFilename(fact.id, fact.image_url), fact.image_url);
  }
  let audioFile: string | null = null;
  if (fact.audio_url) {
    audioFile = await downloadTo(AUDIO_DIR, audioFilename(fact.id, language), fact.audio_url);
  }

  await db.runAsync(
    `INSERT INTO offline_facts (fact_id, language, side, seq, data, image_file, audio_file, saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(fact_id) DO UPDATE SET
       language = excluded.language,
       side = excluded.side,
       seq = excluded.seq,
       data = excluded.data,
       image_file = excluded.image_file,
       audio_file = excluded.audio_file,
       saved_at = excluded.saved_at`,
    [
      fact.id,
      language,
      side,
      seq,
      JSON.stringify(fact),
      imageFile,
      audioFile,
      new Date().toISOString(),
    ]
  );
}

/** Remove a fact's row and its media files. */
async function removeFact(
  db: Awaited<ReturnType<typeof openDatabase>>,
  row: { fact_id: number; image_file: string | null; audio_file: string | null }
): Promise<void> {
  if (row.image_file) {
    await FileSystem.deleteAsync(`${IMAGES_DIR}${row.image_file}`, { idempotent: true }).catch(
      () => {}
    );
  }
  if (row.audio_file) {
    await FileSystem.deleteAsync(`${AUDIO_DIR}${row.audio_file}`, { idempotent: true }).catch(
      () => {}
    );
  }
  await db.runAsync(`DELETE FROM offline_facts WHERE fact_id = ?`, [row.fact_id]);
}

/** Delete every file in `dir` not present in `keep` (orphans + leftover .tmp). */
async function deleteUnreferencedMedia(dir: string, keep: Set<string>): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(dir);
    for (const file of files) {
      if (file.endsWith('.tmp') || !keep.has(file)) {
        await FileSystem.deleteAsync(`${dir}${file}`, { idempotent: true }).catch(() => {});
      }
    }
  } catch {
    // Ignore an unreadable dir.
  }
}

/** Sweep media files on disk that no offline_facts row references — closes the
 *  small window where a download lands but its row insert then fails. */
async function pruneOrphanMedia(db: Awaited<ReturnType<typeof openDatabase>>): Promise<void> {
  const rows = await db.getAllAsync<{ image_file: string | null; audio_file: string | null }>(
    `SELECT image_file, audio_file FROM offline_facts`
  );
  const keepImages = new Set<string>();
  const keepAudio = new Set<string>();
  for (const r of rows) {
    if (r.image_file) keepImages.add(r.image_file);
    if (r.audio_file) keepAudio.add(r.audio_file);
  }
  await deleteUnreferencedMedia(IMAGES_DIR, keepImages);
  await deleteUnreferencedMedia(AUDIO_DIR, keepAudio);
}

// ── feed collection ──────────────────────────────────────────────────────────

/** Page the feed in one direction until `target` facts are gathered. */
async function collectFeed(
  language: string,
  order: 'newest' | 'oldest',
  target: number
): Promise<FactResponse[]> {
  const out: FactResponse[] = [];
  let cursor: string | undefined;
  let guard = 0; // hard stop against a server that never reports has_more=false
  while (out.length < target && guard < 1000) {
    guard++;
    const page = await getFactsFeed({
      language,
      order,
      includeHistorical: true,
      limit: OFFLINE_LIBRARY.PAGE_SIZE,
      cursor,
    });
    out.push(...page.facts);
    if (cancelRequested) break;
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return out.slice(0, target);
}

// ── sync ─────────────────────────────────────────────────────────────────────

/**
 * Reconcile the offline store with the current size setting: download the
 * newest + oldest facts (and their media), prune anything no longer in range,
 * and refresh the in-memory index. Single-flight; progress is published through
 * the sync-state store. Returns the final state.
 */
export async function syncOfflineLibrary(language: string): Promise<OfflineSyncState> {
  if (syncState.status === 'syncing') return syncState;

  cancelRequested = false;
  emit({ status: 'syncing', phase: 'fetching', total: 0, completed: 0 });

  try {
    await ensureSchema();
    await ensureDirs();
    const db = await openDatabase();

    const limit = await getOfflineLimit();
    if (limit <= 0) {
      await clearOfflineLibrary();
      emit({ status: 'done', phase: null, total: 0, completed: 0 });
      return syncState;
    }

    const { newest, oldest } = computeSideTargets(limit);

    const newestFacts = await collectFeed(language, 'newest', newest);
    if (cancelRequested) {
      emit({ status: 'cancelled', phase: null });
      return syncState;
    }
    const oldestFacts = oldest > 0 ? await collectFeed(language, 'oldest', oldest) : [];
    if (cancelRequested) {
      emit({ status: 'cancelled', phase: null });
      return syncState;
    }

    // Build the target set. A fact present in both ends (tiny corpus) is kept
    // once, attributed to the newest side.
    const targets = new Map<number, { fact: FactResponse; side: Side; seq: number }>();
    newestFacts.forEach((fact, i) => targets.set(fact.id, { fact, side: 'tail', seq: i }));
    oldestFacts.forEach((fact, i) => {
      if (!targets.has(fact.id)) targets.set(fact.id, { fact, side: 'head', seq: i });
    });

    // Download + persist with bounded concurrency. This runs BEFORE any pruning
    // so a cancel (or crash) mid-download never leaves the store emptier than it
    // started — the previous rows stay readable until their replacements land.
    const items = [...targets.values()];
    emit({ phase: 'downloading', total: items.length, completed: 0 });

    let next = 0;
    let completed = 0;
    let succeeded = 0;
    const worker = async () => {
      while (next < items.length && !cancelRequested) {
        const item = items[next++];
        try {
          await saveFact(db, item.fact, item.side, item.seq, language);
          succeeded++;
        } catch {
          // A single fact failing must not abort the whole download; any media
          // it left on disk is swept by pruneOrphanMedia below.
        }
        completed++;
        emit({ completed });
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(OFFLINE_LIBRARY.DOWNLOAD_CONCURRENCY, items.length || 1) },
        worker
      )
    );

    // Only now reconcile: drop rows that fell out of range (size lowered, facts
    // shifted) and sweep any media not referenced by a surviving row — orphans
    // from a failed insert, an interrupted move, or a leftover .tmp. Skipped on
    // cancel so we never prune against a half-finished target set.
    if (!cancelRequested) {
      const existing = await db.getAllAsync<{
        fact_id: number;
        image_file: string | null;
        audio_file: string | null;
      }>(`SELECT fact_id, image_file, audio_file FROM offline_facts`);
      for (const row of existing) {
        if (!targets.has(row.fact_id)) await removeFact(db, row);
      }
      await pruneOrphanMedia(db);
    }

    await loadIndex();

    if (cancelRequested) {
      emit({ status: 'cancelled', phase: null });
      return syncState;
    }

    if (__DEV__ && succeeded < items.length) {
      console.warn(`[offlineLibrary] partial sync: ${succeeded}/${items.length} facts saved`);
    }
    await setLastSyncAt(Date.now());
    emit({ status: 'done', phase: null, completed, total: items.length });
    return syncState;
  } catch (err) {
    if (__DEV__) console.warn('[offlineLibrary] sync failed:', err);
    await loadIndex().catch(() => {});
    emit({ status: 'error', phase: null });
    return syncState;
  } finally {
    cancelRequested = false;
  }
}

// ── reads ────────────────────────────────────────────────────────────────────

/** All cached facts, newest-first then oldest, for the library list. */
export async function getOfflineFacts(): Promise<FactResponse[]> {
  await ensureSchema();
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ data: string }>(
    `SELECT data FROM offline_facts
     ORDER BY CASE side WHEN 'tail' THEN 0 ELSE 1 END, seq ASC`
  );
  const out: FactResponse[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.data) as FactResponse);
    } catch {
      // Skip a corrupt row rather than failing the whole read.
    }
  }
  return out;
}

export async function getOfflineFactCount(): Promise<number> {
  await ensureSchema();
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM offline_facts`
  );
  return row?.count ?? 0;
}

/** Total bytes used by downloaded images + audio. */
export async function getOfflineStorageBytes(): Promise<number> {
  let total = 0;
  for (const dir of [IMAGES_DIR, AUDIO_DIR]) {
    try {
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) continue;
      const files = await FileSystem.readDirectoryAsync(dir);
      for (const file of files) {
        const info = await FileSystem.getInfoAsync(`${dir}${file}`);
        if (info.exists && (info as { size?: number }).size) {
          total += (info as { size?: number }).size as number;
        }
      }
    } catch {
      // Ignore unreadable dir.
    }
  }
  return total;
}

// ── media resolvers (consumed by images.ts and useFactAudio) ─────────────────

/** Local file:// URI for a fact's pinned image, or null if not downloaded. */
export async function getOfflineImageUri(factId: number): Promise<string | null> {
  const map = await ensureIndex();
  const entry = map.get(factId);
  return entry?.image ? `${IMAGES_DIR}${entry.image}` : null;
}

/** Synchronous variant — returns null until the index has loaded. */
export function getOfflineImageUriSync(factId: number): string | null {
  const entry = index?.get(factId);
  return entry?.image ? `${IMAGES_DIR}${entry.image}` : null;
}

/** Local file:// path for a fact's pinned audio in `language`, or null. */
export async function getOfflineAudioPath(
  factId: number,
  language: string
): Promise<string | null> {
  const map = await ensureIndex();
  const entry = map.get(factId);
  if (!entry?.audio || entry.language !== language) return null;
  return `${AUDIO_DIR}${entry.audio}`;
}

// ── clear ────────────────────────────────────────────────────────────────────

/** Delete every downloaded fact, image, and audio file. */
export async function clearOfflineLibrary(): Promise<void> {
  await ensureSchema();
  const db = await openDatabase();
  await db.execAsync(`DELETE FROM offline_facts`);
  for (const dir of [IMAGES_DIR, AUDIO_DIR]) {
    await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
  }
  index = new Map();
}
