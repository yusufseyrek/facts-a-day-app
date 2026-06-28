import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSegments } from 'expo-router';

import { useFactOverlay } from '../../services/factMorph';
import { useSearchHeaderRightEdgeOccupied } from '../../services/searchHeaderState';
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
 *    under the close button) in place of this pill.
 * The queue keeps playing throughout; the pill simply returns on a tab root.
 *
 * The search-bearing tabs (search + favorites) keep the floating pill, but on
 * iOS flip it to the top-RIGHT instead of the usual top-left, with a state-driven
 * offset (searchHeaderState): it tucks left of whatever occupies the right edge
 * (the cancel button while the field is active, or the category-clear ✕) and
 * hugs the edge when that corner is clear. This keeps it beside — never over —
 * the field/controls across every view state (idle, focused, typing, category),
 * and because the floating pill renders above the native search bar it stays
 * visible even while the field is active (when a native headerRight control would
 * be hidden by the system). Android floats the pill top-right with a fixed
 * clearance on the tab roots that own a header-right control (a custom
 * headerRight collides with its toolbar-filling SearchView). See the positioning
 * block below.
 */
export function PersistentMiniPlayer() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { spacing, iconSizes } = useResponsive();
  const factOverlayOpen = useFactOverlay() !== null;
  // On iOS search/favorites: does a native control occupy the header's right
  // edge right now (search cancel button / category ✕)? Drives whether the pill
  // tucks left of it or hugs the edge — see the iOS positioning block below.
  const rightEdgeOccupied = useSearchHeaderRightEdgeOccupied();

  const root = segments[0];
  // Pushed (second-level) tab screens carry a back control in the header's
  // top-LEFT corner — exactly where the iOS pill floats. The floating pill then
  // sits on top of the back chevron and steals its tap (a "back" press lands on
  // the pill's open-player zone, double-pushing /player and crashing). On these
  // screens the queue control moves into the native header-RIGHT instead (see
  // the trivia + settings layouts), so the floating pill is suppressed here:
  //  - the offline library (pushed under (settings)),
  //  - any pushed trivia screen (performance/leaderboard/categories/history);
  //    the trivia INDEX is a tab root with an empty top-left, so it keeps the
  //    pill. Scoped to the trivia stack so settings/categories is unaffected.
  const onPushedTriviaScreen =
    segments.includes('trivia') &&
    (segments.includes('performance') ||
      segments.includes('leaderboard') ||
      segments.includes('categories') ||
      segments.includes('history'));
  const hidden =
    root === 'player' ||
    root === 'onboarding' ||
    root === 'trivia' || // standalone fullscreen game (the trivia TAB sits under '(tabs)')
    root === 'fact' || // fact-detail card + modal routes
    root === 'story' || // story viewer owns its chrome (close X + bottom overlay), both modal + morph
    segments.includes('library') || // offline library: queue control lives in headerRight
    onPushedTriviaScreen || // pushed trivia screens: queue control lives in headerRight
    factOverlayOpen; // in-tab morph fact overlay (same tab segments, so read the store)

  if (hidden) return null;

  // Clearance that tucks the pill ~2x a header control's width in from the right
  // edge, so it lands BESIDE (just left of) that control rather than over it.
  // Built from responsive tokens so it scales with phone/tablet.
  const headerRightClearance = iconSizes.xl + spacing.xxl * 2;

  // Android floats the pill top-right (the toolbar left-aligns its title). Four
  // tab roots own a native header-right control: home (the reading-streak flame),
  // trivia (the leaderboard trophy), favorites and search (the search-bar
  // magnifier Android docks as a toolbar action on the right). On those reserve
  // room for it — generously, since over-reserving only nudges the pill a little
  // further from the edge (still clearly top-right) whereas under-reserving would
  // overlap the control. Favorites/search only show the magnifier once there is
  // something to search, but reserving in the empty state too is harmless.
  const onScreenWithHeaderRightControl =
    segments.includes('(home)') ||
    segments.includes('trivia') ||
    segments.includes('(favorites)') ||
    segments.includes('(search)');
  const androidRight = spacing.lg + (onScreenWithHeaderRightControl ? headerRightClearance : 0);

  // iOS floats the pill top-LEFT (UIKit centers the title, leaving that corner
  // free) — EXCEPT on the tabs that own a native header search bar (search and
  // favorites), where it floats top-RIGHT. The floating pill renders above the
  // native search bar, so unlike a headerRight control (which the system hides
  // while the field is active) it stays visible across every view state. Its
  // exact right offset is state-driven (searchHeaderState): when a control
  // occupies the right edge — the cancel button while the field is active, or the
  // category-clear ✕ — the pill tucks ~2x that control's width to its left so it
  // sits beside, not over, it; otherwise (idle, empty corner) it hugs the edge
  // instead of floating awkwardly inboard. Without this the field, when focused,
  // would slide up over the usual top-left spot and the pill would overlap it.
  const onSearchBearingTab =
    segments.includes('(search)') || segments.includes('(favorites)');
  const iosSearchRight = rightEdgeOccupied ? spacing.lg + headerRightClearance : spacing.lg;
  const horizontal =
    Platform.OS === 'android'
      ? { right: androidRight }
      : onSearchBearingTab
        ? { right: iosSearchRight }
        : { left: spacing.lg };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        // A touch below the status bar so the pill's centerline drops into line
        // with the vertically-centered native nav-bar icons (it read a hair high
        // at spacing.xs).
        top: insets.top + spacing.sm,
        ...horizontal,
        zIndex: 1000,
      }}
    >
      <HeaderQueueButton />
    </View>
  );
}
