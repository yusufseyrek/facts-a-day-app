import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Pause, Play } from '@tamagui/lucide-icons';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import type { FactAudioController } from '../hooks/useFactAudio';
import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface FactAudioButtonProps {
  controller: FactAudioController;
  categoryColor: string | null;
}

export function FactAudioButton({ controller, categoryColor }: FactAudioButtonProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { iconSizes, borderWidths, radius, spacing } = useResponsive();
  const isDark = theme === 'dark';

  const { playbackState, progress, durationSeconds, currentSeconds, toggle } = controller;

  // --- Geometry: total visual footprint == X close button (iconSizes.xl).
  const SVG_SIZE = iconSizes.xl;
  const RING_STROKE = borderWidths.medium;
  const BUTTON_SIZE = SVG_SIZE - RING_STROKE * 2;
  const RADIUS = (SVG_SIZE - RING_STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  // Ring stays category-tinted; button face is neutral translucent.
  const ringColor = categoryColor || (isDark ? hexColors.dark.primary : hexColors.light.primary);
  const fillColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.3)';

  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const isPlaying = playbackState === 'playing';
  const isLoading = playbackState === 'loading';

  const percent = durationSeconds > 0 ? Math.round((currentSeconds / durationSeconds) * 100) : 0;

  const a11yLabel = isLoading
    ? t('a11y_audioLoading')
    : isPlaying
      ? t('a11y_pauseFactAudio')
      : t('a11y_playFactAudio');

  return (
    <Pressable
      onPress={toggle}
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
      style={({ pressed }) => [
        {
          width: SVG_SIZE,
          height: SVG_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      {/* Progress ring (drawn behind / around the button face) */}
      <Svg width={SVG_SIZE} height={SVG_SIZE} style={StyleSheet.absoluteFill} pointerEvents="none">
        <G rotation={-90} originX={SVG_SIZE / 2} originY={SVG_SIZE / 2}>
          {/* Always-visible track (ghosted ring frame) */}
          <Circle
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RADIUS}
            stroke={ringColor}
            strokeOpacity={0.35}
            strokeWidth={RING_STROKE}
            fill="transparent"
          />
          {/* Animated progress arc */}
          <AnimatedCircle
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RADIUS}
            stroke={ringColor}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={animatedRingProps}
          />
        </G>
      </Svg>

      {/* Inner circular button face (sits inside the ring) */}
      <View
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: radius.full,
          backgroundColor: fillColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : isPlaying ? (
          <Pause size={iconSizes.sm} color="#FFFFFF" fill="#FFFFFF" />
        ) : (
          <Play size={iconSizes.sm} color="#FFFFFF" fill="#FFFFFF" />
        )}
      </View>
    </Pressable>
  );
}
