import { StyleProp, Text, View, ViewStyle } from 'react-native';

import { FONT_FAMILIES } from '../Typography';

interface IdleCountdownBadgeProps {
  /** Remaining seconds to show ("Ads in N…"); the badge hides when null. */
  countdown: number | null;
  /** Position override (e.g. bottom/right with safe-area insets). */
  style?: StyleProp<ViewStyle>;
}

/**
 * The "Ads in 3…" countdown chip shown before an inactivity interstitial.
 * Shared by the global IdleInterstitial and the story-view idle instance so the
 * look stays identical; each passes its own absolute position via `style`.
 */
export function IdleCountdownBadge({ countdown, style }: IdleCountdownBadgeProps) {
  if (countdown == null) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          backgroundColor: 'rgba(10,12,20,0.92)',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.14)',
          paddingHorizontal: 14,
          paddingVertical: 10,
          zIndex: 9999,
        },
        style,
      ]}
    >
      <Text style={{ color: '#FFFFFF', fontFamily: FONT_FAMILIES.semibold, fontSize: 14 }}>
        Ads in {countdown}…
      </Text>
    </View>
  );
}
