import React, { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useResponsive } from '../utils/useResponsive';

/**
 * The shared "like" (favorite) heart motion, lifted out of the fact-detail
 * action bar (FactActions) so the fact cards and the story view animate the
 * heart in EXACTLY the same way:
 *   - favoriting:   a quick squash → springy 1.3 pop → settle, a short
 *                   left/right rotation wiggle, and a radial ParticleBurst.
 *   - unfavoriting: a small squash → settle (no wiggle, no particles).
 *
 * Both the action bar and the shared FavoriteButton drive their heart through
 * animateHeartToggle() + ParticleBurst, so the motion can never drift apart.
 *
 * The caller owns the particle visibility flag (it is component state used to
 * mount/unmount <ParticleBurst>); animateHeartToggle only touches the two
 * shared values it is handed.
 */
export function animateHeartToggle(
  heartScale: SharedValue<number>,
  heartRotation: SharedValue<number>,
  isFavoriting: boolean
): void {
  if (isFavoriting) {
    heartScale.value = withSequence(
      withTiming(0.7, { duration: 80, easing: Easing.in(Easing.cubic) }),
      withSpring(1.3, { damping: 15, stiffness: 300, mass: 0.5 }),
      withSpring(1, { damping: 15, stiffness: 100 })
    );
    heartRotation.value = withSequence(
      withTiming(-12, { duration: 80 }),
      withTiming(12, { duration: 100 }),
      withTiming(-6, { duration: 80 }),
      withTiming(0, { duration: 100 })
    );
  } else {
    heartScale.value = withSequence(
      withTiming(0.8, { duration: 100, easing: Easing.in(Easing.cubic) }),
      withSpring(1, { damping: 20, stiffness: 100 })
    );
  }
}

// Radial burst rendered behind the heart on favoriting. PARTICLE_COUNT is a
// compile-time constant so the per-particle hooks below keep a stable order
// across renders (rules-of-hooks safe).
const PARTICLE_COUNT = 6;

export const ParticleBurst = ({ color, isActive }: { color: string; isActive: boolean }) => {
  const { spacing } = useResponsive();
  const particleSize = spacing.xs + 2; // 6 on phone, 8 on tablet
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * 2 * Math.PI;
    const scale = useSharedValue(0);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const opacity = useSharedValue(0);

    useEffect(() => {
      if (isActive) {
        const distance = 28 + Math.random() * 12;
        const targetX = Math.cos(angle) * distance;
        const targetY = Math.sin(angle) * distance;

        scale.value = withSequence(
          withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 250, easing: Easing.in(Easing.cubic) })
        );
        opacity.value = withSequence(
          withTiming(1, { duration: 100 }),
          withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) })
        );
        translateX.value = withTiming(targetX, { duration: 400, easing: Easing.out(Easing.cubic) });
        translateY.value = withTiming(targetY, { duration: 400, easing: Easing.out(Easing.cubic) });
      } else {
        scale.value = 0;
        opacity.value = 0;
        translateX.value = 0;
        translateY.value = 0;
      }
    }, [isActive]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      opacity: opacity.value,
    }));

    return (
      <Animated.View
        key={i}
        style={[
          {
            position: 'absolute' as const,
            width: particleSize,
            height: particleSize,
            borderRadius: particleSize / 2,
            backgroundColor: color,
          },
          animatedStyle,
        ]}
      />
    );
  });

  return <>{particles}</>;
};
