/**
 * useFactAudio
 *
 * Shared audio playback state for a single fact. Multiple FactAudioButton
 * instances (e.g., one in the content area and one in the sticky header)
 * subscribe to the same controller so they stay in sync.
 *
 * The hook is always callable — pass `audioUrl=null` and it becomes a no-op
 * (no playback, idle state). This keeps hook-call order stable across
 * conditional renders.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import {
  cancelAnimation,
  Easing,
  type SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useNavigation } from 'expo-router';

import {
  trackFactAudioCompleted,
  trackFactAudioError,
  trackFactAudioPause,
  trackFactAudioPlay,
} from '../services/analytics';
import { cacheFactAudio, getLocalFactAudioPath } from '../services/factAudio';

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface FactAudioController {
  /** Coarse-grained UI state for the button. */
  playbackState: PlaybackState;
  /** 0..1 — read by useAnimatedProps in the SVG ring. */
  progress: SharedValue<number>;
  /** Total duration in seconds (0 until metadata loads). */
  durationSeconds: number;
  /** Current playback position in seconds. */
  currentSeconds: number;
  /** Whether the system is in reduce-motion mode (skip timing animations). */
  reduceMotion: boolean;
  /** Toggle play/pause. */
  toggle: () => void;
  /** True if there's a real audioUrl backing this controller. */
  hasAudio: boolean;
}

export function useFactAudio(
  factId: number,
  audioUrl: string | null | undefined,
  language: string
): FactAudioController {
  const hasAudio = !!audioUrl;

  // Source: prefer local cache, fall back to remote URL.
  const [resolvedSource, setResolvedSource] = useState<string>(audioUrl ?? '');
  useEffect(() => {
    if (!audioUrl) {
      setResolvedSource('');
      return;
    }
    let cancelled = false;
    setResolvedSource(audioUrl);
    getLocalFactAudioPath(factId, language, audioUrl)
      .then((local) => {
        if (!cancelled && local) setResolvedSource(local);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [factId, language, audioUrl]);

  // useAudioPlayer is called unconditionally (rules of hooks). When there's
  // no source we pass an empty string — expo-audio creates a player but
  // doesn't load anything.
  const player = useAudioPlayer(resolvedSource || '');
  const status = useAudioPlayerStatus(player);

  // Explicitly disable looping — we want playback to stop at end of audio,
  // not auto-replay.
  useEffect(() => {
    try {
      player.loop = false;
    } catch {
      // expo-audio throws transient errors when the player is being remounted; ignore.
    }
  }, [player]);

  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [reduceMotion, setReduceMotion] = useState(false);
  const errorRevertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  // Progress shared value — declared early so the factId reset effect can clear it.
  const progress = useSharedValue(0);

  // Cached TRUE duration for the current source. expo-audio reports
  // status.duration as 0/NaN until the item's metadata is loaded
  // (isLoaded === true), then snaps to the real value — it does NOT creep up.
  // We pin the FIRST finite, positive duration seen after load and keep it, so
  // a transient 0/NaN frame, or a stale frame from the PREVIOUS source after a
  // swap (e.g. a shorter clip's 12s), can never become the denominator and fill
  // the ring early. (An earlier max-latch failed: it could seed a too-small
  // stale value and, only ratcheting up, never correct it.)
  const durationRef = useRef(0);

  // Guards the completion analytics event so it fires exactly once per finish:
  // status.didJustFinish can stay true across several status ticks.
  const finishTrackedRef = useRef(false);

  // When the fact changes (prev/next in the modal), reset UI state immediately
  // and stop the current player. Without explicit pause+seek, expo-audio keeps
  // emitting `status.playing=true` briefly after the source swap, and the
  // status-driven effect below would re-promote state back to 'playing'.
  useEffect(() => {
    setPlaybackState('idle');
    progress.value = 0;
    durationRef.current = 0;
    finishTrackedRef.current = false;
    try {
      player.pause();
      // seekTo is async — a rejection after the native player is released
      // (screen close mid-seek) must not surface as an unhandled rejection.
      player.seekTo(0)?.catch?.(() => {});
    } catch {
      // expo-audio throws transient errors when the player is being remounted; ignore.
    }
  }, [factId, player, progress]);

  // Drive UI state from status. The 'playing' branch intentionally does NOT
  // promote 'idle' → 'playing': transitions into 'playing' originate from
  // `toggle()` (which sets state synchronously). This guards against stale
  // status updates from a prior fact's player overriding the reset above.
  useEffect(() => {
    if (!hasAudio || !status) return;
    if (status.playing) {
      setPlaybackState((prev) =>
        prev === 'loading' || prev === 'paused' || prev === 'playing' ? 'playing' : prev
      );
    } else if (status.isLoaded && (status.currentTime ?? 0) > 0) {
      setPlaybackState((prev) => (prev === 'loading' || prev === 'playing' ? 'paused' : prev));
    }
    if (status.didJustFinish) {
      if (!finishTrackedRef.current) {
        finishTrackedRef.current = true;
        trackFactAudioCompleted({
          factId,
          locale: language,
          durationSeconds: durationRef.current || (status?.duration ?? 0),
        });
      }
      setPlaybackState('idle');
      try {
        player.pause();
        player.seekTo(0)?.catch?.(() => {});
      } catch {
        // expo-audio throws transient errors when the player is being remounted; ignore.
      }
    } else {
      finishTrackedRef.current = false;
    }
  }, [
    hasAudio,
    status?.playing,
    status?.isLoaded,
    status?.currentTime,
    status?.duration,
    status?.didJustFinish,
    player,
    factId,
    language,
  ]);

  // Pause when app backgrounds.
  useEffect(() => {
    if (!hasAudio) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        try {
          player.pause();
        } catch {
          // expo-audio throws transient errors when the player is being remounted; ignore.
        }
      }
    });
    return () => sub.remove();
  }, [hasAudio, player]);

  // No manual player cleanup: useAudioPlayer owns the native player's
  // lifecycle and releases it on unmount AND on source change
  // (useReleasingSharedObject). The pause()/remove() we used to call here ran
  // against an already-released shared object on Android — a double-release
  // during the screen-dismissal fragment teardown. What we DO own is the
  // Reanimated progress animation: cancel it so no UI-thread timing keeps
  // writing to the SVG ring while the screen's native views are being deleted
  // (Android Fabric crash class).
  useEffect(() => {
    return () => {
      cancelAnimation(progress);
    };
  }, [progress]);

  // Quiesce the moment the host screen STARTS closing — beforeRemove covers
  // the X button, Android hardware back, and swipe-back, all of which begin a
  // native pop transition while this hook is still mounted. Pausing stops
  // currentTime from changing (so no further ring animations arm during the
  // transition) and cancelAnimation kills any in-flight timing segment. The
  // unmount cleanup above is the backstop; this closes the playing-while-
  // closing window it can't reach.
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      try {
        player.pause();
      } catch {
        // player may already be released; nothing to quiesce
      }
      cancelAnimation(progress);
    });
    return unsubscribe;
  }, [navigation, player, progress]);

  // Background-cache the remote audio on first play so next time is local.
  useEffect(() => {
    if (!audioUrl || resolvedSource !== audioUrl) return;
    cacheFactAudio(factId, language, audioUrl).catch(() => {});
  }, [resolvedSource, audioUrl, factId, language]);

  // Progress shared value driven from status against the cached TRUE duration.
  // Trust status.duration only once the item is loaded and finite, then pin the
  // first such value — so a later transient 0/NaN frame, or a stale frame from a
  // prior source, can't collapse the denominator and fill the ring early.
  useEffect(() => {
    const liveDuration = status?.duration ?? 0;
    if (
      durationRef.current <= 0 &&
      status?.isLoaded === true &&
      Number.isFinite(liveDuration) &&
      liveDuration > 0
    ) {
      durationRef.current = liveDuration;
    }
    const denom = durationRef.current;
    if (denom <= 0) {
      progress.value = 0;
      return;
    }
    const next = Math.min(1, Math.max(0, (status?.currentTime ?? 0) / denom));
    // Skip unchanged values entirely. Status ticks every ~500ms even for a
    // loaded-but-IDLE player (currentTime pinned at 0), and each tick used to
    // arm a fresh withTiming — Reanimated work that kept running through the
    // Android screen-dismissal transition and raced the native teardown
    // (crash on close). When the value DOES change (playback, pause, finish,
    // reset-to-0), keep the timing animation so the ring moves smoothly.
    if (progress.value === next) return;
    progress.value = reduceMotion
      ? next
      : withTiming(next, { duration: 260, easing: Easing.linear });
  }, [status?.currentTime, status?.duration, status?.isLoaded, reduceMotion, progress]);

  const toggle = useCallback(() => {
    if (!hasAudio) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // expo-audio throws transient errors when the player is being remounted; ignore.
    }

    const source: 'local' | 'remote' = resolvedSource !== audioUrl ? 'local' : 'remote';

    try {
      if (playbackState === 'playing') {
        trackFactAudioPause({
          factId,
          locale: language,
          positionSeconds: status?.currentTime ?? 0,
          durationSeconds: durationRef.current,
        });
        player.pause();
        setPlaybackState('paused');
        return;
      }
      if (!status?.isLoaded) setPlaybackState('loading');
      trackFactAudioPlay({
        factId,
        locale: language,
        source,
        isResume: playbackState === 'paused',
      });
      player.play();
      setPlaybackState('playing');
    } catch (err) {
      trackFactAudioError({ factId, locale: language, source, errorMessage: String(err) });
      setPlaybackState('error');
      if (__DEV__) console.warn('[useFactAudio] play error:', err);
      if (errorRevertTimer.current) clearTimeout(errorRevertTimer.current);
      errorRevertTimer.current = setTimeout(() => setPlaybackState('idle'), 1500);
    }
  }, [
    hasAudio,
    playbackState,
    player,
    status?.isLoaded,
    status?.currentTime,
    factId,
    language,
    resolvedSource,
    audioUrl,
  ]);

  useEffect(() => {
    return () => {
      if (errorRevertTimer.current) clearTimeout(errorRevertTimer.current);
    };
  }, []);

  return {
    playbackState,
    progress,
    durationSeconds:
      durationRef.current > 0
        ? durationRef.current
        : Number.isFinite(status?.duration) && (status?.duration ?? 0) > 0
          ? (status?.duration as number)
          : 0,
    currentSeconds: status?.currentTime ?? 0,
    reduceMotion,
    toggle,
    hasAudio,
  };
}
