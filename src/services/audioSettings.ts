/**
 * Audio queue player settings.
 *
 * Two persisted toggles that govern the global queue player (see
 * `AudioQueueContext`):
 *   - playInBackground   — keep audio going when the app is backgrounded or the
 *                          screen is locked. Premium-only: the context never
 *                          enables `shouldPlayInBackground` unless the user is
 *                          premium AND this is on.
 *   - autoplayNext       — auto-advance to the next queued sound when one ends.
 *
 * Values are mirrored in memory so synchronous reads (e.g. the AppState
 * background handler, the playback-finished callback) never await AsyncStorage.
 * A tiny pub/sub keeps the settings screen and the player context in sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '../config/app';

export interface AudioSettings {
  playInBackground: boolean;
  autoplayNext: boolean;
}

const DEFAULTS: AudioSettings = {
  playInBackground: false,
  autoplayNext: true,
};

// In-memory mirror, seeded with defaults until `initAudioSettings` resolves.
let cache: AudioSettings = { ...DEFAULTS };
let loaded = false;

type Listener = (settings: AudioSettings) => void;
const listeners = new Set<Listener>();

const KEY_BY_FIELD: Record<keyof AudioSettings, string> = {
  playInBackground: STORAGE_KEYS.AUDIO_PLAY_IN_BACKGROUND,
  autoplayNext: STORAGE_KEYS.AUDIO_AUTOPLAY_NEXT,
};

function emit(): void {
  const snapshot = getAudioSettings();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      if (__DEV__) console.warn('[audioSettings] listener error:', error);
    }
  });
}

/** Synchronous snapshot of the current settings (a copy, safe to keep). */
export function getAudioSettings(): AudioSettings {
  return { ...cache };
}

/** True once `initAudioSettings` has read persisted values from disk. */
export function isAudioSettingsLoaded(): boolean {
  return loaded;
}

/**
 * Hydrate the in-memory cache from AsyncStorage. Call once on app launch.
 * Missing/invalid keys keep their default. Idempotent.
 */
export async function initAudioSettings(): Promise<AudioSettings> {
  try {
    const keys = Object.values(KEY_BY_FIELD);
    const pairs = await AsyncStorage.multiGet(keys);
    const byKey = new Map(pairs);
    const next: AudioSettings = { ...DEFAULTS };
    (Object.keys(KEY_BY_FIELD) as (keyof AudioSettings)[]).forEach((field) => {
      const raw = byKey.get(KEY_BY_FIELD[field]);
      if (raw === 'true') next[field] = true;
      else if (raw === 'false') next[field] = false;
    });
    cache = next;
  } catch (error) {
    if (__DEV__) console.warn('[audioSettings] init failed, using defaults:', error);
  } finally {
    loaded = true;
    emit();
  }
  return getAudioSettings();
}

/** Update one setting, persist it, and notify subscribers. */
export async function setAudioSetting<K extends keyof AudioSettings>(
  field: K,
  value: AudioSettings[K]
): Promise<void> {
  if (cache[field] === value) return;
  cache = { ...cache, [field]: value };
  emit();
  try {
    await AsyncStorage.setItem(KEY_BY_FIELD[field], value ? 'true' : 'false');
  } catch (error) {
    if (__DEV__) console.warn(`[audioSettings] failed to persist ${field}:`, error);
  }
}

/** Subscribe to settings changes. Fires immediately with the current snapshot. */
export function subscribeAudioSettings(listener: Listener): () => void {
  listeners.add(listener);
  listener(getAudioSettings());
  return () => {
    listeners.delete(listener);
  };
}
