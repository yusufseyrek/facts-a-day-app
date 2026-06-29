import { useCallback } from 'react';
import { type LayoutChangeEvent,View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnyModalPresent } from '../../services/modalPresence';
import { setTabBarBannerHeight } from '../../services/tabBarBannerInset';
import { useResponsive } from '../../utils/useResponsive';

import { BannerAd } from './BannerAd';

/**
 * The fixed banner pinned just above the native tab bar, rendered once at the
 * (tabs) layout level so it stays put across tab switches (no reload per screen).
 *
 * Positioned absolutely above the tab bar (insets.bottom + tabBarHeight). It
 * publishes its measured height to tabBarBannerInset so tab screens can reserve
 * matching bottom padding — and 0 when no ad is up (premium / no-fill), so they
 * don't reserve dead space.
 *
 * NOTE: on iOS 26 the Liquid Glass bar minimizes on scroll-down; this banner
 * stays at its fixed offset (does not follow the shrink), per the chosen design.
 */
export function PersistentTabBarBanner() {
  const insets = useSafeAreaInsets();
  const { media } = useResponsive();
  // A centered dialog (DialogShell) presents as an in-window overlay that this
  // banner would otherwise paint over (it's a later sibling at zIndex 400). Hide
  // it for the dialog's lifetime so it can't cover the dialog's footer/buttons.
  // Hidden via opacity (not unmount) so BannerAd keeps its loaded ad and doesn't
  // re-request on every dialog open/close.
  const modalPresent = useAnyModalPresent();

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setTabBarBannerHeight(e.nativeEvent.layout.height);
  }, []);

  return (
    <View
      pointerEvents={modalPresent ? 'none' : 'box-none'}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + media.tabBarHeight,
        alignItems: 'center',
        zIndex: 400,
        opacity: modalPresent ? 0 : 1,
      }}
    >
      {/* Wrapper measures the live banner height (0 when collapsed/hidden). */}
      <View onLayout={onLayout}>
        <BannerAd placement="tab_bar" />
      </View>
    </View>
  );
}
