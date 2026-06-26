import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import * as Haptics from 'expo-haptics';

import { type QueueTrack, useAudioQueue, usePlaybackProgress } from '../contexts';
import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { Check, ListPlus, Pause, Play } from './icons';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface FactAudioButtonProps {
  /** This fact's queue payload — built once by the parent (FactActions). */
  track: QueueTrack;
}

/**
 * The per-fact audio control, driven entirely by the app-wide queue player.
 *
 * Its meaning depends on the queue, not on an inline per-fact player:
 *   - nothing playing            → Play  → playNow (enqueue + start immediately)
 *   - a session is live, not this fact → Add-to-queue (ListPlus) → enqueue "in line"
 *   - this fact IS the active track     → Play/Pause toggle, with a progress ring
 *
 * So tapping Play on the first fact starts it; on any later fact the button has
 * already turned into an "add to queue" affordance that appends behind it.
 */
export function FactAudioButton({ track }: FactAudioButtonProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { iconSizes, spacing } = useResponsive();
  const isDark = theme === 'dark';
  const colors = hexColors[theme];

  const { currentTrack, isPlaying, isLoading, queue, playNow, toggleInQueue, togglePlayPause } =
    useAudioQueue();

  const isCurrent = currentTrack?.factId === track.factId;
  const isQueued = queue.some((q) => q.factId === track.factId);
  const hasSession = currentTrack != null;

  const accentColor = isDark ? hexColors.dark.primary : hexColors.light.primary;

  // Geometry matches the sibling action icons (Heart/Share/Flag); the SVG adds
  // one spacing step so the progress ring has breathing room around the glyph.
  const ICON_SIZE = iconSizes.lg;
  const SVG_SIZE = iconSizes.lg + spacing.sm;
  const badge = iconSizes.xs - 2;

  const loading = isCurrent && isLoading;
  const playing = isCurrent && isPlaying;
  const showAddToQueue = !isCurrent && hasSession;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isCurrent) {
      togglePlayPause();
      return;
    }
    if (hasSession) {
      // A session is live — add this fact behind it, or remove it if it's
      // already in line (tapping the checked state un-queues it).
      toggleInQueue(track);
      return;
    }
    // Nothing playing — this becomes the current track and starts immediately.
    playNow(track);
  };

  const a11yLabel = loading
    ? t('a11y_audioLoading')
    : playing
      ? t('a11y_pauseFactAudio')
      : showAddToQueue
        ? isQueued
          ? t('playerRemoveFromQueue')
          : t('playerAddToQueue')
        : t('a11y_playFactAudio');

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={spacing.sm}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, selected: playing }}
      aria-label={a11yLabel}
      style={({ pressed }) => ({
        width: SVG_SIZE,
        height: SVG_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {/* Progress ring — mounted only while this fact is the active track, so the
          ~2×/sec playback-position re-render stays isolated to the ring. */}
      {isCurrent && <QueueProgressRing size={SVG_SIZE} stroke={accentColor} />}

      {loading ? (
        <ActivityIndicator size="small" color={accentColor} />
      ) : playing ? (
        <Pause size={ICON_SIZE} color={accentColor} fill={accentColor} />
      ) : showAddToQueue ? (
        <ListPlus size={ICON_SIZE} color={accentColor} />
      ) : (
        <Play size={ICON_SIZE} color={accentColor} fill={accentColor} />
      )}

      {/* In-queue badge — a small accent check once an "add to queue" fact is
          already in line. */}
      {showAddToQueue && isQueued && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            backgroundColor: accentColor,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: colors.background,
          }}
        >
          <Check size={badge - 6} color={colors.background} />
        </View>
      )}
    </Pressable>
  );
}

/**
 * The circular progress ring around the play/pause glyph for the active track.
 * Reads the shared playback-progress store (high-frequency) in isolation so only
 * this small subtree re-renders as the position ticks.
 */
function QueueProgressRing({ size, stroke }: { size: number; stroke: string }) {
  const { borderWidths } = useResponsive();
  const { position, duration } = usePlaybackProgress();

  const RING_STROKE = borderWidths.heavy;
  const RADIUS = (size - RING_STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const target = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const progress = useSharedValue(target);
  useEffect(() => {
    progress.value = withTiming(target, { duration: 260 });
  }, [target, progress]);

  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={size} height={size}>
        <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={RADIUS}
            stroke={stroke}
            strokeOpacity={0.2}
            strokeWidth={RING_STROKE}
            fill="transparent"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={RADIUS}
            stroke={stroke}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={animatedRingProps}
          />
        </G>
      </Svg>
    </Animated.View>
  );
}
