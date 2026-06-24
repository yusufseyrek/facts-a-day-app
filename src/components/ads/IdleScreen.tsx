import { ReactNode, useCallback, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFocusEffect } from 'expo-router';

import { useInactivityInterstitial } from '../../hooks/useInactivityInterstitial';

import { IdleCountdownBadge } from './IdleCountdownBadge';

interface IdleScreenProps {
  /**
   * Extra gate beyond focus (default true). Mount this only once the screen is
   * interactive — the touch capture and countdown live in this subtree, so a
   * loading/empty branch that doesn't render IdleScreen simply won't arm.
   */
  enabled?: boolean;
  /** Root View style — this View becomes the screen's outer container. */
  style?: StyleProp<ViewStyle>;
  /** Countdown badge position override; defaults to bottom-right + safe area. */
  badgeStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * Runs an idle interstitial for a SINGLE native-modal screen. The global
 * IdleInterstitial can't reach these: a native modal's touches bypass its root
 * responder capture, its countdown overlay renders under the modal, and screens
 * that call pushModalScreen() make the global instance self-skip. Mount this as
 * such a screen's root — its own capture sees that screen's touches and its
 * countdown renders above the content. Focus-gated so it pauses when another
 * screen is pushed over it. Card/tab screens are already covered by the global
 * instance, so don't wrap those (it would double up).
 */
export function IdleScreen({ enabled = true, style, badgeStyle, children }: IdleScreenProps) {
  const insets = useSafeAreaInsets();

  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const { countdown, reportActivity } = useInactivityInterstitial({
    enabled: enabled && isFocused,
  });

  const onTouchStartCapture = useCallback(() => {
    reportActivity();
    return false;
  }, [reportActivity]);

  return (
    <View style={[{ flex: 1 }, style]} onStartShouldSetResponderCapture={onTouchStartCapture}>
      {children}
      <IdleCountdownBadge
        countdown={countdown}
        style={badgeStyle ?? { right: insets.right + 16, bottom: insets.bottom + 24 }}
      />
    </View>
  );
}
