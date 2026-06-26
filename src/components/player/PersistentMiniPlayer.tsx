import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSegments } from 'expo-router';

import { useResponsive } from '../../utils/useResponsive';

import { HeaderQueueButton } from './HeaderQueueButton';

/**
 * The single, persistent queue mini-player. Rendered once above the root
 * navigator (a sibling of the root Stack whose screens are headerShown:false),
 * so ONE instance floats at the top-left across the tabs and the fact-detail
 * card — not a per-screen header button. That means no native header slot (so
 * no empty circle when idle) and no second clone on fact detail.
 *
 * HeaderQueueButton self-hides on an empty queue, so this surfaces only while
 * audio is queued/playing. Suppressed on the full player sheet (it IS the
 * player) and during onboarding.
 */
export function PersistentMiniPlayer() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { spacing } = useResponsive();

  const root = segments[0];
  if (root === 'player' || root === 'onboarding') return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + spacing.xs,
        left: spacing.lg,
        zIndex: 1000,
      }}
    >
      <HeaderQueueButton />
    </View>
  );
}
