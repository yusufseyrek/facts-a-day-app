import React, { useEffect } from 'react';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { hexColors, useTheme } from '../../theme';

interface PreCacheProgressBarProps {
  progress: number | null;
}

export const PreCacheProgressBar = React.memo(function PreCacheProgressBar({
  progress,
}: PreCacheProgressBarProps) {
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const barWidth = useSharedValue(0);

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
});
