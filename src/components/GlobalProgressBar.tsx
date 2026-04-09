import { useEffect, useState } from 'react';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { onGlobalProgressChange } from '../services/globalProgress';
import { hexColors, useTheme } from '../theme';

export function GlobalProgressBar() {
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const [progress, setProgress] = useState<number | null>(null);
  const barWidth = useSharedValue(0);

  useEffect(() => {
    return onGlobalProgressChange(setProgress);
  }, []);

  useEffect(() => {
    if (progress !== null) {
      barWidth.value = withTiming(progress * 100, { duration: 300 });
    } else {
      barWidth.value = 0;
    }
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%` as any,
  }));

  if (progress === null) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(400)}
      style={{ height: 2, backgroundColor: colors.border }}
    >
      <Animated.View
        style={[{ height: 2, backgroundColor: colors.primary }, barStyle]}
      />
    </Animated.View>
  );
}
