import { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * InlineOverlay — a full-screen overlay rendered IN THE MAIN WINDOW.
 *
 * Drop-in replacement for `<Modal transparent>` for surfaces that use Liquid
 * Glass. RN's `<Modal>` presents in a SEPARATE iOS UIWindow, where a glass
 * (`UIVisualEffectView`) layer has no app content behind it to refract and so
 * renders flat. Rendering the overlay inline — as an absolutely-positioned
 * sibling within the current screen tree — keeps it in the same window as the
 * content beneath, so glass actually refracts.
 *
 * Replicates the parts of `<Modal>` callers relied on:
 *  - mounts only while `visible` (kept mounted briefly after dismiss so the
 *    children's own exit animation, if any, can play),
 *  - Android hardware-back → `onRequestClose`,
 *  - EDGE-TO-EDGE coverage. Callers typically render inside a SafeAreaView
 *    (ScreenContainer), so a plain absoluteFill would stop at the safe-area
 *    inset and leave un-covered strips under the status bar / home indicator
 *    (the old `<Modal statusBarTranslucent>` covered those). We bleed past the
 *    parent's insets with negative margins so the backdrop reaches the physical
 *    screen edges.
 *
 * The children own their own enter/exit animation (every current caller already
 * wraps its card in `Animated.View entering={FadeInUp...}`), so this primitive
 * stays animation-agnostic and just manages mount lifetime + back handling.
 *
 * NOTE: the caller's screen must already be inside the app's window (every
 * current caller renders the modal within its own screen), so no portal host is
 * required — which matters here because native portals are disabled under
 * Fabric.
 */

interface InlineOverlayProps {
  visible: boolean;
  /** Fired by Android hardware back. Should drive `visible` to false. */
  onRequestClose: () => void;
  /**
   * How long to keep the layer mounted after `visible` flips false, so the
   * children's exit animation can finish (default 220ms).
   */
  exitGraceMs?: number;
  /**
   * Android: keep the inline-view rendering (no Modal) so touches PASS
   * THROUGH to the screen. For non-interactive overlays only (toasts) — a
   * real Modal's dialog window consumes every touch regardless of
   * pointerEvents="box-none".
   */
  passthrough?: boolean;
  /**
   * Android Modal: draw the dialog under the system navigation bar (full
   * bleed). Disable for dialogs with TEXT INPUTS: an edge-to-edge dialog
   * window loses the framework's adjustResize keyboard handling, so the
   * keyboard would cover the input.
   */
  coverNavigationBar?: boolean;
  /**
   * iOS: present in a real window-level <Modal> instead of the inline
   * absoluteFill view. REQUIRED when the overlay is mounted deep in the tree
   * (e.g. inside a scrolling section), where the inline view would be bounded
   * by its parent's frame instead of the screen — producing a clipped
   * "square" backdrop and an off-screen card. The trade-off is that Liquid
   * Glass can't refract content from a separate window, so the backdrop falls
   * back to a flat blur/scrim. Screen-root callers should leave this off.
   */
  forceWindow?: boolean;
  children: React.ReactNode;
}

export function InlineOverlay({
  visible,
  onRequestClose,
  exitGraceMs = 220,
  passthrough = false,
  coverNavigationBar = true,
  forceWindow = false,
  children,
}: InlineOverlayProps) {
  const insets = useSafeAreaInsets();

  // Two-phase visibility (mirrors SuccessToast): show immediately, unmount only
  // after the grace window so a child exit animation isn't cut off.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), exitGraceMs);
    return () => clearTimeout(t);
  }, [visible, exitGraceMs]);

  if (!mounted) return null;

  // ANDROID (interactive dialogs): use a real RN <Modal>. The inline-view
  // approach exists purely so iOS Liquid Glass has same-window content to
  // refract — Android gets an opaque scrim either way, and the inline view
  // CANNOT cover the NativeTabs Material bottom nav (a native sibling view):
  // the scrim stopped at the tab bar's top edge and tabs stayed tappable
  // under an open dialog. Modal owns hardware-back via onRequestClose, so no
  // BackHandler subscription needed. Passthrough overlays (toasts) keep the
  // inline path below — a Modal would block all input while they show.
  //
  // iOS opts into this same window-Modal path via `forceWindow` when the
  // overlay is mounted deep in the tree (the inline absoluteFill below would
  // otherwise be clamped to its parent's frame, not the screen).
  if ((Platform.OS === 'android' || forceWindow) && !passthrough) {
    return (
      <Modal
        transparent
        statusBarTranslucent
        navigationBarTranslucent={coverNavigationBar}
        visible={mounted}
        onRequestClose={onRequestClose}
        animationType="none"
      >
        {children}
      </Modal>
    );
  }

  // iOS (and Android passthrough): in-window overlay so glass refracts. (On
  // iOS there is no back-button concept; the backdrop's tap-to-dismiss
  // handles closing.) Negative insets bleed the layer past the parent
  // SafeAreaView to the physical screen edges, so the backdrop is truly
  // edge-to-edge.
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.layer,
        {
          top: -insets.top,
          bottom: -insets.bottom,
          left: -insets.left,
          right: -insets.right,
        },
      ]}
      pointerEvents="box-none"
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: 1000,
    elevation: 1000,
  },
});
