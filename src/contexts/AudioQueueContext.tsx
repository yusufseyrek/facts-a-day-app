/**
 * AudioQueueContext — a single, app-wide queue player for fact narration.
 *
 * Unlike `useFactAudio` (one ephemeral player per open fact, pauses on close),
 * this owns ONE imperative `createAudioPlayer()` for the whole app. Users add
 * facts' sounds to a queue; the player streams them back-to-back, survives tab
 * switches, and — for premium users who opt in — keeps going in the background
 * with lock-screen controls.
 *
 * Render-cost note: playback position ticks ~2×/sec. Putting it in context
 * state would re-render the entire app subtree on every tick, so position lives
 * in a separate lightweight store (`usePlaybackProgress`) that only the seek
 * bar / mini-bar progress line subscribe to. The context value itself only
 * changes on queue edits and play/pause/track changes (infrequent).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import {
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { useTranslation } from '../i18n';
import {
  trackFactAudioCompleted,
  trackFactAudioPause,
  trackFactAudioPlay,
} from '../services/analytics';
import { acquireAudioFocus, releaseAudioFocus } from '../services/audioFocus';
import { getAudioSettings, initAudioSettings, subscribeAudioSettings } from '../services/audioSettings';
import { cacheFactAudio, getLocalFactAudioPath } from '../services/factAudio';
import { getOfflineAudioPath } from '../services/offlineLibrary';

import { usePremium } from './PremiumContext';

export interface QueueTrack {
  factId: number;
  title: string;
  audioUrl: string;
  language: string;
  /** Category slug or display label — shown as the lock-screen "artist". */
  category?: string;
  /** Remote image URL for lock-screen artwork and the player UI. */
  imageUrl?: string;
}

interface AudioQueueContextValue {
  queue: QueueTrack[];
  currentIndex: number;
  currentTrack: QueueTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  /** Total duration of the current track in seconds (0 until metadata loads). */
  durationSeconds: number;
  hasNext: boolean;
  hasPrevious: boolean;

  /** Add to the end of the queue. If nothing is loaded it becomes the current
   *  track but stays PAUSED — adding never starts playback on its own. */
  enqueue: (track: QueueTrack) => void;
  /** Ensure the track is queued, then jump to it and play immediately. */
  playNow: (track: QueueTrack) => void;
  /** Add if absent, remove if present. */
  toggleInQueue: (track: QueueTrack) => void;
  isQueued: (factId: number) => boolean;
  removeAt: (index: number) => void;
  clearQueue: () => void;
  togglePlayPause: () => void;
  next: () => void;
  previous: () => void;
  playIndex: (index: number) => void;
  seekTo: (seconds: number) => void;
  /** Pause the queue so another player (the per-fact inline narration) can take
   *  over without the same audio echoing from both. */
  pausePlayback: () => void;
}

const noop = () => {};

const AudioQueueContext = createContext<AudioQueueContextValue>({
  queue: [],
  currentIndex: -1,
  currentTrack: null,
  isPlaying: false,
  isLoading: false,
  durationSeconds: 0,
  hasNext: false,
  hasPrevious: false,
  enqueue: noop,
  playNow: noop,
  toggleInQueue: noop,
  isQueued: () => false,
  removeAt: noop,
  clearQueue: noop,
  togglePlayPause: noop,
  next: noop,
  previous: noop,
  playIndex: noop,
  seekTo: noop,
  pausePlayback: noop,
});

export const useAudioQueue = () => useContext(AudioQueueContext);

// ── Playback-progress store (out-of-band, high-frequency) ──────────────────
export interface PlaybackProgress {
  position: number;
  duration: number;
}
let progressState: PlaybackProgress = { position: 0, duration: 0 };
const progressListeners = new Set<(p: PlaybackProgress) => void>();
function emitProgress(next: PlaybackProgress): void {
  progressState = next;
  progressListeners.forEach((l) => l(next));
}

/** Subscribe to the moving playback position. Re-renders only the caller. */
export function usePlaybackProgress(): PlaybackProgress {
  const [state, setState] = useState<PlaybackProgress>(progressState);
  useEffect(() => {
    progressListeners.add(setState);
    setState(progressState);
    return () => {
      progressListeners.delete(setState);
    };
  }, []);
  return state;
}

async function resolveSource(track: QueueTrack): Promise<string> {
  // Mirror useFactAudio's precedence: pinned offline copy → LRU TTS cache →
  // remote URL. Each step is best-effort; the remote URL always works.
  const offline = await getOfflineAudioPath(track.factId, track.language).catch(() => null);
  if (offline) return offline;
  const local = await getLocalFactAudioPath(track.factId, track.language, track.audioUrl).catch(
    () => null
  );
  return local ?? track.audioUrl;
}

export function AudioQueueProvider({ children }: { children: React.ReactNode }) {
  const { isPremium } = usePremium();
  const { t } = useTranslation();

  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  // The single native player. Created lazily so it survives the provider's life.
  const playerRef = useRef<AudioPlayer | null>(null);
  if (playerRef.current === null) {
    playerRef.current = createAudioPlayer(null);
    try {
      playerRef.current.loop = false;
    } catch {
      // transient during construction; ignore
    }
  }
  const player = playerRef.current;

  // Refs mirror state for use inside async/event callbacks without stale closures.
  const queueRef = useRef(queue);
  const indexRef = useRef(currentIndex);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Guards a load against being clobbered by a newer one resolving out of order.
  const loadTokenRef = useRef(0);
  // True duration, pinned on first finite value (see useFactAudio for rationale).
  const durationRef = useRef(0);
  // Fire the completion event exactly once per track finish.
  const finishGuardRef = useRef(false);

  // Pause WITHOUT haptics/analytics — the queue's audio-focus "yield" callback.
  // Stable identity (deps only on the lifetime-stable player), so it doubles as
  // this player's focus token: the coordinator calls it to silence the queue
  // when another player (an inline fact narration) takes focus. Defined up here
  // so loadIndex/togglePlayPause can acquire focus with it.
  const pausePlayback = useCallback(() => {
    if (!isPlayingRef.current) return;
    try {
      player.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    } catch {
      // ignore
    }
  }, [player]);

  const updateLockScreen = useCallback(
    (track: QueueTrack) => {
      try {
        player.setActiveForLockScreen(true, {
          title: track.title,
          artist: track.category || t('appName'),
          artworkUrl: track.imageUrl,
        });
      } catch {
        // not fatal — lock screen metadata is best-effort
      }
    },
    [player, t]
  );

  const stopAndClear = useCallback(() => {
    // Invalidate any in-flight load: its async tail checks loadTokenRef and will
    // bail before calling player.replace/play, so a load resolving after the
    // queue is cleared can't resurrect playback on an empty queue.
    ++loadTokenRef.current;
    setCurrentIndex(-1);
    indexRef.current = -1;
    setIsPlaying(false);
    isPlayingRef.current = false;
    setIsLoading(false);
    setDurationSeconds(0);
    durationRef.current = 0;
    emitProgress({ position: 0, duration: 0 });
    releaseAudioFocus(pausePlayback);
    try {
      player.pause();
      player.setActiveForLockScreen(false);
    } catch {
      // ignore
    }
  }, [player, pausePlayback]);

  const loadIndex = useCallback(
    (index: number, fromQueue: QueueTrack[], autoplay: boolean) => {
      const track = fromQueue[index];
      if (!track) return;

      const token = ++loadTokenRef.current;
      setCurrentIndex(index);
      indexRef.current = index;
      // NOTE: deliberately do NOT reset finishGuardRef here. The actual
      // player.replace happens after an async resolveSource, and expo-audio
      // keeps emitting didJustFinish=true for the OLD source across several
      // ticks during that window. Re-arming the guard now would let those
      // lingering finishes re-enter handleFinish and skip the freshly-queued
      // track. The status listener re-arms the guard (the else branch) once the
      // NEW source emits its first non-finished frame.
      durationRef.current = 0;
      setDurationSeconds(0);
      emitProgress({ position: 0, duration: 0 });
      setIsLoading(true);

      (async () => {
        const source = await resolveSource(track);
        if (token !== loadTokenRef.current) return; // superseded by a newer load
        try {
          player.replace({ uri: source });
          updateLockScreen(track);
          if (autoplay) {
            player.play();
            // Take audio focus: pauses any inline fact narration that's sounding
            // (covers every start path — enqueue/playNow/playIndex/next/previous/
            // auto-advance all funnel through here).
            acquireAudioFocus(pausePlayback);
            setIsPlaying(true);
            isPlayingRef.current = true;
            trackFactAudioPlay({
              factId: track.factId,
              locale: track.language,
              source: source === track.audioUrl ? 'remote' : 'local',
              isResume: false,
            });
          }
        } catch {
          setIsLoading(false);
          setIsPlaying(false);
          isPlayingRef.current = false;
        }
      })();

      // Warm the LRU cache so the next play of this fact is local.
      cacheFactAudio(track.factId, track.language, track.audioUrl).catch(() => {});
    },
    [player, updateLockScreen, pausePlayback]
  );

  // ── Status subscription: drives play state, progress, and auto-advance ──
  useEffect(() => {
    const handleFinish = () => {
      if (finishGuardRef.current) return;
      finishGuardRef.current = true;
      const cur = indexRef.current;
      const q = queueRef.current;
      const track = q[cur];
      if (track) {
        trackFactAudioCompleted({
          factId: track.factId,
          locale: track.language,
          durationSeconds: durationRef.current,
        });
      }
      if (getAudioSettings().autoplayNext && cur >= 0 && cur < q.length - 1) {
        loadIndex(cur + 1, q, true);
      } else {
        setIsPlaying(false);
        isPlayingRef.current = false;
        emitProgress({ position: 0, duration: durationRef.current });
        try {
          player.seekTo(0)?.catch?.(() => {});
        } catch {
          // ignore
        }
      }
    };

    const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (status.isLoaded) setIsLoading(false);

      // Pin the first finite, positive duration (transient 0/NaN frames and
      // stale frames from a prior source must not become the denominator).
      const liveDuration = status.duration ?? 0;
      if (durationRef.current <= 0 && status.isLoaded && Number.isFinite(liveDuration) && liveDuration > 0) {
        durationRef.current = liveDuration;
        setDurationSeconds(liveDuration);
      }

      const position = status.currentTime ?? 0;
      if (Math.abs(position - progressState.position) >= 0.2 || durationRef.current !== progressState.duration) {
        emitProgress({ position, duration: durationRef.current });
      }

      // Only trust `playing` once loaded — avoids flicker during source swaps.
      if (status.isLoaded) {
        setIsPlaying((prev) => (prev !== status.playing ? status.playing : prev));
        isPlayingRef.current = status.playing;
      }

      if (status.didJustFinish) {
        handleFinish();
      } else {
        finishGuardRef.current = false;
      }
    });

    return () => {
      sub.remove();
    };
  }, [player, loadIndex]);

  // ── Audio session: silent-switch override, lock-screen, background play ──
  // Re-applied whenever premium status or the background-play setting changes.
  useEffect(() => {
    const apply = () => {
      const allowBackground = isPremium && getAudioSettings().playInBackground;
      setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: allowBackground,
      }).catch(() => {});
    };
    initAudioSettings().then(apply).catch(apply);
    const unsub = subscribeAudioSettings(apply);
    return unsub;
  }, [isPremium]);

  // Pause when backgrounded unless premium background-play is on.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') return;
      const allowBackground = isPremium && getAudioSettings().playInBackground;
      if (allowBackground) return;
      if (isPlayingRef.current) {
        try {
          player.pause();
          releaseAudioFocus(pausePlayback);
          setIsPlaying(false);
          isPlayingRef.current = false;
        } catch {
          // ignore
        }
      }
    });
    return () => sub.remove();
  }, [isPremium, player, pausePlayback]);

  // Release the native player when the whole app tears down.
  useEffect(() => {
    return () => {
      releaseAudioFocus(pausePlayback);
      try {
        player.remove();
      } catch {
        // ignore
      }
    };
  }, [player, pausePlayback]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const enqueue = useCallback(
    (track: QueueTrack) => {
      const q = queueRef.current;
      const existing = q.findIndex((tk) => tk.factId === track.factId);
      if (existing >= 0) {
        // Load it as the current track but PAUSED — adding never auto-plays.
        if (indexRef.current === -1) loadIndex(existing, q, false);
        return;
      }
      const newQ = [...q, track];
      setQueue(newQ);
      queueRef.current = newQ;
      // No haptic here: callers (the FactActions toggle button) own the tactile
      // feedback so adding and removing feel identical. Loads paused (autoplay
      // false) so pressing "add to queue" never starts sound on its own.
      if (indexRef.current === -1) loadIndex(newQ.length - 1, newQ, false);
    },
    [loadIndex]
  );

  const playNow = useCallback(
    (track: QueueTrack) => {
      const q = queueRef.current;
      const existing = q.findIndex((tk) => tk.factId === track.factId);
      if (existing >= 0) {
        loadIndex(existing, q, true);
        return;
      }
      const newQ = [...q, track];
      setQueue(newQ);
      queueRef.current = newQ;
      loadIndex(newQ.length - 1, newQ, true);
    },
    [loadIndex]
  );

  const isQueued = useCallback((factId: number) => queueRef.current.some((t) => t.factId === factId), []);

  const removeAt = useCallback(
    (index: number) => {
      const q = queueRef.current;
      if (index < 0 || index >= q.length) return;
      const newQ = q.filter((_, i) => i !== index);
      setQueue(newQ);
      queueRef.current = newQ;
      if (newQ.length === 0) {
        stopAndClear();
        return;
      }
      const cur = indexRef.current;
      if (index < cur) {
        setCurrentIndex(cur - 1);
        indexRef.current = cur - 1;
      } else if (index === cur) {
        // Removed the playing track — load whatever now occupies this slot.
        const nextIdx = Math.min(index, newQ.length - 1);
        loadIndex(nextIdx, newQ, isPlayingRef.current);
      }
    },
    [loadIndex, stopAndClear]
  );

  const toggleInQueue = useCallback(
    (track: QueueTrack) => {
      const idx = queueRef.current.findIndex((t) => t.factId === track.factId);
      if (idx >= 0) removeAt(idx);
      else enqueue(track);
    },
    [enqueue, removeAt]
  );

  const clearQueue = useCallback(() => {
    setQueue([]);
    queueRef.current = [];
    stopAndClear();
  }, [stopAndClear]);

  const togglePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (indexRef.current === -1) {
      if (queueRef.current.length > 0) loadIndex(0, queueRef.current, true);
      return;
    }
    const track = queueRef.current[indexRef.current];
    try {
      if (isPlayingRef.current) {
        player.pause();
        releaseAudioFocus(pausePlayback);
        setIsPlaying(false);
        isPlayingRef.current = false;
        if (track)
          trackFactAudioPause({
            factId: track.factId,
            locale: track.language,
            positionSeconds: progressState.position,
            durationSeconds: durationRef.current,
          });
      } else {
        player.play();
        // Resuming the queue takes focus back from any inline narration.
        acquireAudioFocus(pausePlayback);
        setIsPlaying(true);
        isPlayingRef.current = true;
        if (track)
          trackFactAudioPlay({
            factId: track.factId,
            locale: track.language,
            source: 'local',
            isResume: true,
          });
      }
    } catch {
      // ignore
    }
  }, [player, loadIndex, pausePlayback]);

  const next = useCallback(() => {
    const cur = indexRef.current;
    const q = queueRef.current;
    if (cur < 0 || cur >= q.length - 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    loadIndex(cur + 1, q, true);
  }, [loadIndex]);

  const previous = useCallback(() => {
    const cur = indexRef.current;
    const q = queueRef.current;
    if (cur < 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Past the 3s mark, "previous" restarts the current track (player convention).
    if (progressState.position > 3 || cur === 0) {
      try {
        player.seekTo(0)?.catch?.(() => {});
        emitProgress({ position: 0, duration: durationRef.current });
      } catch {
        // ignore
      }
      return;
    }
    loadIndex(cur - 1, q, true);
  }, [player, loadIndex]);

  const playIndex = useCallback(
    (index: number) => {
      loadIndex(index, queueRef.current, true);
    },
    [loadIndex]
  );

  const seekTo = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, durationRef.current > 0 ? Math.min(seconds, durationRef.current) : seconds);
      try {
        player.seekTo(clamped)?.catch?.(() => {});
        emitProgress({ position: clamped, duration: durationRef.current });
      } catch {
        // ignore
      }
    },
    [player]
  );

  const currentTrack = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

  const value = useMemo<AudioQueueContextValue>(
    () => ({
      queue,
      currentIndex,
      currentTrack,
      isPlaying,
      isLoading,
      durationSeconds,
      hasNext: currentIndex >= 0 && currentIndex < queue.length - 1,
      hasPrevious: currentIndex > 0,
      enqueue,
      playNow,
      toggleInQueue,
      isQueued,
      removeAt,
      clearQueue,
      togglePlayPause,
      next,
      previous,
      playIndex,
      seekTo,
      pausePlayback,
    }),
    [
      queue,
      currentIndex,
      currentTrack,
      isPlaying,
      isLoading,
      durationSeconds,
      enqueue,
      playNow,
      toggleInQueue,
      isQueued,
      removeAt,
      clearQueue,
      togglePlayPause,
      next,
      previous,
      playIndex,
      seekTo,
      pausePlayback,
    ]
  );

  return <AudioQueueContext.Provider value={value}>{children}</AudioQueueContext.Provider>;
}
