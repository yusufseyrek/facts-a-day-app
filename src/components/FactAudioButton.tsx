import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { Check, Pause, Play } from './icons';

import type { FactAudioController } from '../hooks/useFactAudio';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface FactAudioButtonProps {
  controller: FactAudioController;
  /** Fired when a tap STARTS playback (not when pausing). The parent uses this
   *  to auto-add the fact to the Up Next queue. */
  onPlayStart?: () => void;
  /** True when this fact is already in the queue — shows a small check badge. */
  queued?: boolean;
}

export function FactAudioButton({ controller, onPlayStart, queued = false }: FactAudioButtonProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { iconSizes, borderWidths, spacing } = useResponsive();
  const isDark = theme === 'dark';
  const colors = hexColors[theme];

  const { playbackState, progress, durationSeconds, currentSeconds, toggle } = controller;

  // Icon matches sibling action icons (Heart/Share/Flag) exactly. The SVG adds
  // one spacing step around the icon so the progress ring has clear breathing room.
  const ICON_SIZE = iconSizes.lg;
  const SVG_SIZE = iconSizes.lg + spacing.sm;
  const RING_STROKE = borderWidths.heavy;
  const RADIUS = (SVG_SIZE - RING_STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const accentColor = isDark ? hexColors.dark.primary : hexColors.light.primary;

  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const isPlaying = playbackState === 'playing';
  const isLoading = playbackState === 'loading';
  const isIdle = playbackState === 'idle' || playbackState === 'error';

  // Ring fades in once audio has been engaged (loading/playing/paused) and out
  // again when we return to a clean idle state.
  const ringOpacity = useSharedValue(0);
  useEffect(() => {
    ringOpacity.value = withTiming(isIdle ? 0 : 1, { duration: 220 });
  }, [isIdle, ringOpacity]);

  const ringStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.value }));

  // Tapping to START playback also auto-adds the fact to the queue (the parent
  // owns the enqueue + feedback). Tapping to pause does not.
  const handlePress = () => {
    if (!isPlaying && !isLoading) onPlayStart?.();
    toggle();
  };

  const percent = durationSeconds > 0 ? Math.round((currentSeconds / durationSeconds) * 100) : 0;

  const a11yLabel = isLoading
    ? t('a11y_audioLoading')
    : isPlaying
      ? t('a11y_pauseFactAudio')
      : t('a11y_playFactAudio');

  const badge = iconSizes.xs - 2;

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={spacing.sm}
      accessibilityRole="button"
      accessibilityState={{ busy: isLoading, selected: isPlaying }}
      aria-label={a11yLabel}
      accessibilityValue={
        durationSeconds > 0
          ? {
              now: percent,
              min: 0,
              max: 100,
              text: t('a11y_audioProgress', {
                seconds: Math.round(currentSeconds),
                total: Math.round(durationSeconds),
              }),
            }
          : undefined
      }
      style={({ pressed }) => ({
        width: SVG_SIZE,
        height: SVG_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]} pointerEvents="none">
        <Svg width={SVG_SIZE} height={SVG_SIZE}>
          <G transform={`rotate(-90 ${SVG_SIZE / 2} ${SVG_SIZE / 2})`}>
            <Circle
              cx={SVG_SIZE / 2}
              cy={SVG_SIZE / 2}
              r={RADIUS}
              stroke={accentColor}
              strokeOpacity={0.2}
              strokeWidth={RING_STROKE}
              fill="transparent"
            />
            <AnimatedCircle
              cx={SVG_SIZE / 2}
              cy={SVG_SIZE / 2}
              r={RADIUS}
              stroke={accentColor}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={CIRCUMFERENCE}
              animatedProps={animatedRingProps}
            />
          </G>
        </Svg>
      </Animated.View>

      {isLoading ? (
        <ActivityIndicator size="small" color={accentColor} />
      ) : isPlaying ? (
        <Pause size={ICON_SIZE} color={accentColor} fill={accentColor} />
      ) : (
        <Play size={ICON_SIZE} color={accentColor} fill={accentColor} />
      )}

      {/* In-queue badge — a small accent check once the fact is in the queue. */}
      {queued && (
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
