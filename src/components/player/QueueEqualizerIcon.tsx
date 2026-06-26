/**
 * A tiny three-bar equalizer that bounces while audio is playing and rests flat
 * when paused. Shared by the iOS home header button and the Android now-playing
 * bar so the "is something playing" cue is identical on both platforms.
 *
 * Honors the OS "Reduce Motion" setting: instead of bouncing, the bars settle
 * into a static staggered equalizer silhouette so the cue still reads without
 * any looping motion.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '../../hooks/useReduceMotion';

interface QueueEqualizerIconProps {
  color: string;
  size?: number;
  animating: boolean;
}

const BAR_COUNT = 3;
// Per-bar timing so the bars fall out of phase (a real equalizer never bounces
// in unison). Indexed by bar.
const DURATIONS = [340, 480, 400];
const MIN_SCALE = 0.35;
const REST_SCALE = 0.45;
// Static silhouette used when Reduce Motion is on but audio is playing.
const STATIC_SCALES = [0.55, 1, 0.7];

export function QueueEqualizerIcon({ color, size = 18, animating }: QueueEqualizerIconProps) {
  const reduceMotion = useReduceMotion();
  const barWidth = Math.max(2, Math.round(size / 6));
  const gap = barWidth;

  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap,
      }}
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <EqualizerBar
          key={i}
          index={i}
          color={color}
          width={barWidth}
          height={size}
          animating={animating}
          reduceMotion={reduceMotion}
        />
      ))}
    </View>
  );
}

function EqualizerBar({
  index,
  color,
  width,
  height,
  animating,
  reduceMotion,
}: {
  index: number;
  color: string;
  width: number;
  height: number;
  animating: boolean;
  reduceMotion: boolean;
}) {
  // Bars scale from the center; a resting bar sits at ~45% height.
  const scale = useSharedValue(animating ? 1 : REST_SCALE);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(scale);
      // Playing → static staggered silhouette; paused → flat rest.
      scale.value = withTiming(animating ? STATIC_SCALES[index % STATIC_SCALES.length] : REST_SCALE, {
        duration: 180,
      });
    } else if (animating) {
      const duration = DURATIONS[index % DURATIONS.length];
      scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
          withTiming(MIN_SCALE, { duration, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(REST_SCALE, { duration: 180 });
    }
    return () => cancelAnimation(scale);
  }, [animating, index, scale, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: width / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}
