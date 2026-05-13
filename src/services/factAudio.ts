import * as FileSystem from 'expo-file-system/legacy';

/**
 * Local cache for fact-reading TTS audio files.
 *
 * Cache layout:
 *   ${cacheDirectory}fact-audio/
 *     <factId>-<lang>-<urlHash>.mp3
 *     manifest.json   — { [filename]: lastUsedAt (epoch ms) }
 *
 * - URL hash in the filename makes the cache key change whenever the backend
 *   regenerates audio (the R2 key includes a content hash), so stale local
 *   files don't shadow new ones — they just age out via LRU.
 * - Manifest is read once per call and rewritten when entries change.
 */

const AUDIO_DIR = `${FileSystem.cacheDirectory}fact-audio/`;
const MANIFEST_PATH = `${AUDIO_DIR}manifest.json`;
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

type Manifest = Record<string, number>; // filename → lastUsedAt

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(AUDIO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
  }
}

async function readManifest(): Promise<Manifest> {
  try {
    const info = await FileSystem.getInfoAsync(MANIFEST_PATH);
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(MANIFEST_PATH);
    return JSON.parse(raw) as Manifest;
  } catch {
    return {};
  }
}

async function writeManifest(manifest: Manifest): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(MANIFEST_PATH, JSON.stringify(manifest));
  } catch {
    // Manifest is a best-effort optimization; ignore write failures
  }
}

function hashFromUrl(url: string): string {
  // Light FNV-1a-style hash — short, deterministic, no crypto dep.
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 8);
}

function filenameFor(factId: number, language: string, remoteUrl: string): string {
  const h = hashFromUrl(remoteUrl);
  return `${factId}-${language}-${h}.mp3`;
}

/**
 * Returns the local cached path for a (fact, language, remoteUrl) tuple if
 * the audio is already on disk, otherwise null. Synchronously touches the
 * manifest (lastUsedAt) when a hit occurs.
 */
export async function getLocalFactAudioPath(
  factId: number,
  language: string,
  remoteUrl: string,
): Promise<string | null> {
  const filename = filenameFor(factId, language, remoteUrl);
  const path = `${AUDIO_DIR}${filename}`;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;

  const manifest = await readManifest();
  manifest[filename] = Date.now();
  await writeManifest(manifest);
  return path;
}

/**
 * Downloads the remote MP3 to the local cache and returns the local path.
 * Idempotent: if the file already exists, returns the existing path.
 */
export async function cacheFactAudio(
  factId: number,
  language: string,
  remoteUrl: string,
): Promise<string> {
  await ensureDir();
  const filename = filenameFor(factId, language, remoteUrl);
  const path = `${AUDIO_DIR}${filename}`;

  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.downloadAsync(remoteUrl, path);
  }

  const manifest = await readManifest();
  manifest[filename] = Date.now();
  await writeManifest(manifest);
  return path;
}

/**
 * Prune the audio cache to stay under MAX_BYTES using LRU on the manifest.
 * Called once on app launch.
 */
export async function pruneAudioCacheIfOverLimit(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
    if (!dirInfo.exists) return;

    const files = await FileSystem.readDirectoryAsync(AUDIO_DIR);
    const audioFiles = files.filter((f) => f.endsWith('.mp3'));
    if (audioFiles.length === 0) return;

    const entries = await Promise.all(
      audioFiles.map(async (filename) => {
        const path = `${AUDIO_DIR}${filename}`;
        const info = await FileSystem.getInfoAsync(path);
        return {
          filename,
          path,
          size: info.exists ? (info as { size?: number }).size ?? 0 : 0,
        };
      }),
    );

    const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
    if (totalBytes <= MAX_BYTES) return;

    const manifest = await readManifest();
    // Oldest-first by manifest lastUsedAt; missing entries treated as oldest.
    entries.sort((a, b) => (manifest[a.filename] ?? 0) - (manifest[b.filename] ?? 0));

    let running = totalBytes;
    for (const entry of entries) {
      if (running <= MAX_BYTES) break;
      try {
        await FileSystem.deleteAsync(entry.path, { idempotent: true });
        delete manifest[entry.filename];
        running -= entry.size;
      } catch {
        // ignore individual delete failures
      }
    }
    await writeManifest(manifest);
  } catch (err) {
    if (__DEV__) console.warn('[factAudio] prune failed:', err);
  }
}
