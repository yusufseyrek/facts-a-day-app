import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSegments } from 'expo-router';

import { useIsFocusedScreenPushed } from '../../hooks/useIsFocusedScreenPushed';
import { useFactOverlay } from '../../services/factMorph';
import { useSearchHeaderRightEdgeOccupied } from '../../services/searchHeaderState';
import { useResponsive } from '../../utils/useResponsive';

import { HeaderQueueButton } from './HeaderQueueButton';

/**
 * The single, persistent queue mini-player. Rendered once above the root
 * navigator (a sibling of the root Stack), so ONE instance floats at the top
 * across every screen — never a per-screen header button. That keeps it out of
 * the native header entirely: no empty slot when idle, no clone per screen,
 * and on iOS 26 no system Liquid Glass capsule drawn around it (bar items get
 * one; a floating overlay doesn't).
 *
 * HeaderQueueButton self-hides on an empty queue, so this surfaces only while
 * audio is queued/playing.
 *
 * Placement is decided in two structural steps:
 *
 * 1) PUSHED screens (anything showing a native back control — detected
 *    structurally via useIsFocusedScreenPushed, NOT by route-name lists): the
 *    back chevron owns the top-LEFT, so the pill floats top-RIGHT on both
 *    platforms. This covers root-stack pushes (/stats, /badges) and
 *    second-level tab screens (trivia performance/leaderboard/categories/
 *    history/profile, settings/library) — and any FUTURE pushed screen,
 *    automatically. History lesson: this used to be a hand-maintained list of
 *    screen names feeding a suppress-here-and-mount-a-headerRight-there split,
 *    and every new pushed screen (most recently trivia/profile) shipped with
 *    the pill overlapping the back chevron, doubled by its headerRight twin.
 *
 * 2) TAB ROOTS (no back control): iOS centers the nav title, so the pill owns
 *    the empty top-LEFT corner — except the search-bearing tabs (search +
 *    favorites), where the native search field slides up into that corner when
 *    focused; there it floats top-RIGHT with a state-driven offset
 *    (searchHeaderState) that tucks it left of whatever occupies the right
 *    edge (cancel button / category-clear ✕) and hugs the edge otherwise.
 *    Android's Material toolbar LEFT-aligns its title, so the pill always
 *    floats top-RIGHT; tab roots that own a native header-right control (home
 *    streak flame, trivia trophy, the search magnifier) reserve clearance so
 *    the pill lands beside — not over — that control.
 *
 * On top of placement, the pill is suppressed entirely on screens that own
 * their OWN top chrome, where any corner would collide (an explicit list — a
 * screen "owning chrome" is a per-screen fact no structure can infer):
 *  - the full player sheet (/player, which IS the player) and onboarding,
 *  - the immersive trivia game (its own exit button + progress bar),
 *  - the story viewer (own close ✕ top-right; modal + morph variants),
 *  - fact detail (sticky title top-left, close ✕ top-right) — card/modal
 *    routes AND the in-tab morph overlay (detected via useFactOverlay); it
 *    renders its own FactDetailQueueButton stacked under the close button,
 *  - the paywall family (paywall / remove-ads / hint-store), which own a
 *    top-right close control.
 * The queue keeps playing throughout; the pill simply returns elsewhere.
 * NEW SCREENS: a pushed screen needs no wiring — the pill floats top-right by
 * itself. Only add to the hidden list if the screen draws its own top chrome.
 */
export function PersistentMiniPlayer() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { spacing, iconSizes } = useResponsive();
  const factOverlayOpen = useFactOverlay() !== null;
  const isPushed = useIsFocusedScreenPushed();
  // On iOS search/favorites: does a native control occupy the header's right
  // edge right now (search cancel button / category ✕)? Drives whether the pill
  // tucks left of it or hugs the edge — see the iOS positioning block below.
  const rightEdgeOccupied = useSearchHeaderRightEdgeOccupied();

  const root = segments[0];
  const hidden =
    root === 'player' ||
    root === 'onboarding' ||
    root === 'trivia' || // standalone fullscreen game (the trivia TAB sits under '(tabs)')
    root === 'fact' || // fact-detail card + modal routes
    root === 'story' || // story viewer owns its chrome (close X + bottom overlay), both modal + morph
    root === 'paywall' || // paywall owns a top-right close button the Android pill was landing on
    root === 'remove-ads' || // remove-ads paywall sheet (same family; keep the pill off it)
    root === 'hint-store' || // hint-pack sheet (same paywall family)
    factOverlayOpen; // in-tab morph fact overlay (same tab segments, so read the store)

  if (hidden) return null;

  // Clearance that tucks the pill ~2x a header control's width in from the right
  // edge, so it lands BESIDE (just left of) that control rather than over it.
  // Built from responsive tokens so it scales with phone/tablet.
  const headerRightClearance = iconSizes.xl + spacing.xxl * 2;

  // Android tab roots that own a native header-right control: home (the
  // reading-streak flame), trivia (the leaderboard trophy), favorites and
  // search (the search-bar magnifier Android docks as a toolbar action on the
  // right). On those reserve room for it — generously, since over-reserving
  // only nudges the pill a little further from the edge (still clearly
  // top-right) whereas under-reserving would overlap the control.
  // Favorites/search only show the magnifier once there is something to
  // search, but reserving in the empty state too is harmless.
  const onScreenWithHeaderRightControl =
    segments.includes('(home)') ||
    segments.includes('trivia') ||
    segments.includes('(favorites)') ||
    segments.includes('(search)');
  const androidRight = spacing.lg + (onScreenWithHeaderRightControl ? headerRightClearance : 0);

  const onSearchBearingTab =
    segments.includes('(search)') || segments.includes('(favorites)');
  const iosSearchRight = rightEdgeOccupied ? spacing.lg + headerRightClearance : spacing.lg;

  // Pushed screens first (both platforms): back chevron top-left, top-right
  // structurally free (none of these screens has a header-right control — the
  // ones that own top chrome are in the hidden list above), so hug the edge.
  const horizontal = isPushed
    ? { right: spacing.lg }
    : Platform.OS === 'android'
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
