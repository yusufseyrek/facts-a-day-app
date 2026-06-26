import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSegments } from 'expo-router';

import { useFactOverlay } from '../../services/factMorph';
import { useResponsive } from '../../utils/useResponsive';

import { HeaderQueueButton } from './HeaderQueueButton';

/**
 * The single, persistent queue mini-player. Rendered once above the root
 * navigator (a sibling of the root Stack whose screens are headerShown:false),
 * so ONE instance floats at the top-left across the tab roots — not a per-screen
 * header button. That means no native header slot (so no empty circle when idle)
 * and no second clone elsewhere.
 *
 * HeaderQueueButton self-hides on an empty queue, so this surfaces only while
 * audio is queued/playing. On top of that it is suppressed wherever a screen
 * owns its own top-left chrome, so the floating pill never lands on top of it:
 *  - the full player sheet (/player, which IS the player) and onboarding,
 *  - the immersive trivia game (its own exit button + progress bar),
 *  - fact detail (sticky header title slides into the top-left, close button
 *    top-right) — both the card/modal routes AND the in-tab morph overlay, which
 *    keeps the underlying tab's segments so it is detected via useFactOverlay,
 *  - the search tab, where the native full-width search field owns the top row.
 * The queue keeps playing throughout; the pill simply returns on a tab root.
 */
export function PersistentMiniPlayer() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { spacing } = useResponsive();
  const factOverlayOpen = useFactOverlay() !== null;

  const root = segments[0];
  const hidden =
    root === 'player' ||
    root === 'onboarding' ||
    root === 'trivia' || // standalone fullscreen game (the trivia TAB sits under '(tabs)')
    root === 'fact' || // fact-detail card + modal routes
    segments.includes('(search)') || // search tab: the native search field owns the top row
    factOverlayOpen; // in-tab morph fact overlay (same tab segments, so read the store)

  if (hidden) return null;

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
