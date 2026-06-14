import React from 'react';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { LogoPullRefresh } from './LogoPullRefresh';
import { usePullToRefresh } from './usePullToRefresh';

import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';

/** Props to spread onto the wrapped scroller (ScrollView / FlashList / FlatList). */
export interface PullToRefreshScrollProps {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
  bounces: boolean;
  overScrollMode: 'never';
}

interface PullToRefreshProps {
  refreshing: boolean;
  onRefresh: () => void;
  /** Absolute top of the bulb within this wrapper. Defaults to ~14 (good when the
   *  wrapped scroller sits below a header). Pass a larger value for full-bleed
   *  lists under a translucent nav. */
  bulbTop?: number;
  style?: StyleProp<ViewStyle>;
  /** Render the scroller, spreading the supplied scroll props onto it. */
  children: (scrollProps: PullToRefreshScrollProps) => React.ReactNode;
}

/**
 * Drop-in branded pull-to-refresh for any scrollable screen. Wraps the scroller
 * in the custom {@link usePullToRefresh} gesture (works on iOS + Android) and
 * paints the {@link LogoPullRefresh} bulb on top.
 *
 * Usage:
 * ```tsx
 * <PullToRefresh refreshing={refreshing} onRefresh={handleRefresh}>
 *   {(scrollProps) => (
 *     <ScrollView {...scrollProps} contentContainerStyle={...}>...</ScrollView>
 *   )}
 * </PullToRefresh>
 * ```
 */
export function PullToRefresh({
  refreshing,
  onRefresh,
  bulbTop = 14,
  style,
  children,
}: PullToRefreshProps) {
  const { gesture, wrapStyle, progress, onScroll } = usePullToRefresh({ refreshing, onRefresh });
  const scrollProps: PullToRefreshScrollProps = {
    onScroll,
    scrollEventThrottle: 16,
    bounces: false,
    overScrollMode: 'never',
  };
  return (
    <GestureHandlerRootView style={[{ flex: 1 }, style]}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ flex: 1 }, wrapStyle]}>{children(scrollProps)}</Animated.View>
      </GestureDetector>
      <LogoPullRefresh progress={progress} refreshing={refreshing} top={bulbTop} />
    </GestureHandlerRootView>
  );
}
