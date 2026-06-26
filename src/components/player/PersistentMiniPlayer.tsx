import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSegments } from 'expo-router';

import { useFactOverlay } from '../../services/factMorph';
import { useResponsive } from '../../utils/useResponsive';

import { HeaderQueueButton } from './HeaderQueueButton';

/**
 * The single, persistent queue mini-player. Rendered once above the root
 * navigator (a sibling of the root Stack whose screens are headerShown:false),
 * so ONE instance floats at the top across the tab roots — not a per-screen
 * header button. That means no native header slot (so no empty circle when idle)
 * and no second clone elsewhere.
 *
 * Horizontal side is platform-split: iOS centers the navigation title (with the
 * large title below), so the pill owns the empty top-LEFT corner. Android's
 * Material toolbar LEFT-aligns its title, so a top-left pill would sit on top of
 * the title text — on those tab screens the pill floats top-RIGHT instead. The
 * two Android tab roots that own a native header-right control (the home
 * reading-streak flame, the trivia trophy+rank) reserve extra room so the pill
 * lands to the LEFT of that control rather than over it.
 *
 * HeaderQueueButton self-hides on an empty queue, so this surfaces only while
 * audio is queued/playing. On top of that it is suppressed wherever a screen
 * owns its own top chrome, so the floating pill never lands on top of it and
 * never has to reposition itself to dodge it:
 *  - the full player sheet (/player, which IS the player) and onboarding,
 *  - the immersive trivia game (its own exit button + progress bar),
 *  - the story viewer — its own close (X) sits top-right and content overlays
 *    the bottom, so the pill stays out entirely rather than shifting sides when
 *    a story opens; covers both the fullScreenModal route and the in-place morph
 *    variant (segment '[0]' === 'story' for both),
 *  - fact detail (sticky header title slides into the top-left, close button
 *    top-right) — both the card/modal routes AND the in-tab morph overlay, which
 *    keeps the underlying tab's segments so it is detected via useFactOverlay;
 *    fact detail renders its own FactDetailQueueButton (a round control stacked
 *    under the close button) in place of this pill,
 *  - the search tab, where the native full-width search field owns the top row.
 * The queue keeps playing throughout; the pill simply returns on a tab root.
 */
export function PersistentMiniPlayer() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { spacing, iconSizes } = useResponsive();
  const factOverlayOpen = useFactOverlay() !== null;

  const root = segments[0];
  const hidden =
    root === 'player' ||
    root === 'onboarding' ||
    root === 'trivia' || // standalone fullscreen game (the trivia TAB sits under '(tabs)')
    root === 'fact' || // fact-detail card + modal routes
    root === 'story' || // story viewer owns its chrome (close X + bottom overlay), both modal + morph
    segments.includes('(search)') || // search tab: the native search field owns the top row
    factOverlayOpen; // in-tab morph fact overlay (same tab segments, so read the store)

  if (hidden) return null;

  // On the Android tab screens the pill floats top-right (the toolbar left-aligns
  // the title). The home and trivia tab roots own a native header-right control,
  // so on those reserve room for it — generously, since over-reserving only
  // nudges the pill a little further from the edge (still clearly top-right)
  // whereas under-reserving would overlap the control. The clearance is built
  // from responsive tokens so it scales with phone/tablet sizing.
  const onScreenWithHeaderRightControl =
    segments.includes('(home)') || segments.includes('trivia');
  const androidRight =
    spacing.lg + (onScreenWithHeaderRightControl ? iconSizes.xl + spacing.xxl * 2 : 0);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + spacing.xs,
        ...(Platform.OS === 'android' ? { right: androidRight } : { left: spacing.lg }),
        zIndex: 1000,
      }}
    >
      <HeaderQueueButton />
    </View>
  );
}
