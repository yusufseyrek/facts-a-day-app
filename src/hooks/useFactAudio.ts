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

import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import {
  Easing,
  type SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
  language: string,
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

  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [reduceMotion, setReduceMotion] = useState(false);
  const errorRevertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  // Drive UI state from status.
  useEffect(() => {
    if (!hasAudio || !status) return;
    if (status.playing) {
      setPlaybackState('playing');
    } else if (status.isLoaded && (status.currentTime ?? 0) > 0) {
      setPlaybackState((prev) =>
        prev === 'loading' || prev === 'playing' ? 'paused' : prev,
      );
    }
    if (status.didJustFinish) {
      setPlaybackState('idle');
      try {
        player.seekTo(0);
      } catch {}
    }
  }, [
    hasAudio,
    status?.playing,
    status?.isLoaded,
    status?.currentTime,
    status?.duration,
    status?.didJustFinish,
    player,
  ]);

  // Pause when app backgrounds.
  useEffect(() => {
    if (!hasAudio) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        try {
          player.pause();
        } catch {}
      }
    });
    return () => sub.remove();
  }, [hasAudio, player]);

  // Cleanup the player when source changes or the hook unmounts.
  useEffect(() => {
    return () => {
      try {
        player.pause();
        player.remove();
      } catch {}
    };
  }, [player]);

  // Background-cache the remote audio on first play so next time is local.
  useEffect(() => {
    if (!audioUrl || resolvedSource !== audioUrl) return;
    cacheFactAudio(factId, language, audioUrl).catch(() => {});
  }, [resolvedSource, audioUrl, factId, language]);

  // Progress shared value driven from status.
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!status?.duration || status.duration <= 0) {
      progress.value = 0;
      return;
    }
    const next = Math.min(
      1,
      Math.max(0, (status.currentTime ?? 0) / status.duration),
    );
    progress.value = reduceMotion
      ? next
      : withTiming(next, { duration: 260, easing: Easing.linear });
  }, [status?.currentTime, status?.duration, reduceMotion, progress]);

  const toggle = useCallback(() => {
    if (!hasAudio) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    try {
      if (playbackState === 'playing') {
        player.pause();
        setPlaybackState('paused');
        return;
      }
      if (!status?.isLoaded) setPlaybackState('loading');
      player.play();
      setPlaybackState('playing');
    } catch (err) {
      setPlaybackState('error');
      if (__DEV__) console.warn('[useFactAudio] play error:', err);
      if (errorRevertTimer.current) clearTimeout(errorRevertTimer.current);
      errorRevertTimer.current = setTimeout(() => setPlaybackState('idle'), 1500);
    }
  }, [hasAudio, playbackState, player, status?.isLoaded]);

  useEffect(() => {
    return () => {
      if (errorRevertTimer.current) clearTimeout(errorRevertTimer.current);
    };
  }, []);

  return {
    playbackState,
    progress,
    durationSeconds: status?.duration ?? 0,
    currentSeconds: status?.currentTime ?? 0,
    reduceMotion,
    toggle,
    hasAudio,
  };
}
