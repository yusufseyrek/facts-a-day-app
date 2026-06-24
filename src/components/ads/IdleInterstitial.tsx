import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePathname } from 'expo-router';

import { useInactivityInterstitial } from '../../hooks/useInactivityInterstitial';
import { isModalScreenActive } from '../../services/badges';
import { useResponsive } from '../../utils/useResponsive';

import { IdleCountdownBadge } from './IdleCountdownBadge';

interface IdleInterstitialProps {
  /** Disable the idle timer (e.g. during onboarding / first session). */
  enabled?: boolean;
  children: ReactNode;
}

// Routes where the GLOBAL idle interstitial must NOT fire: the paywall is a
// purchase flow, and /fact/* + /story are screens that run their OWN idle
// instance (IdleScreen) — a native modal's touches can't reset this root clock
// and its overlay would render under the modal. Belt-and-suspenders with
// isModalScreenActive(): FactModal and the story screen both pushModalScreen(),
// but the card route /fact/[id] has no route change of its own, so the prefix is
// what guarantees the global stays off it. ('/fact/' also covers /fact/modal and
// the onboarding /fact/sample.) Matched by path prefix.
const BLOCKING_ROUTE_PREFIXES = ['/paywall', '/fact/', '/story'];
const isBlockingRoute = (path: string): boolean =>
  BLOCKING_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));

/**
 * Wraps the app tree and fires an interstitial after the user has been idle
 * in-app — no touch for INTERSTITIAL_ADS.INACTIVITY_SECONDS while foregrounded.
 * A short bottom-right "Ads in 3.. 2.. 1.." countdown precedes the ad; any touch
 * during it (or the idle window) resets the clock and hides it.
 *
 * A root-level responder CAPTURE that always returns false observes every touch
 * START without claiming the responder (children handle taps/scrolls/gestures
 * normally) and resets the idle clock via reportActivity. The timer + countdown
 * live in useInactivityInterstitial; native-modal screens (paywall/story/fact
 * modal) are skipped here and the story view runs its own instance.
 */
export function IdleInterstitial({ enabled = true, children }: IdleInterstitialProps) {
  const insets = useSafeAreaInsets();
  const { media } = useResponsive();

  // Latest foregrounded route, read at fire time (touches on modal routes don't
  // reach our capture view, so we can't rely on a reset — we check at fire).
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const { countdown, reportActivity } = useInactivityInterstitial({
    enabled,
    shouldSkipAtFire: () => isBlockingRoute(pathnameRef.current) || isModalScreenActive(),
  });

  const onTouchStartCapture = useCallback(() => {
    reportActivity();
    return false;
  }, [reportActivity]);

  return (
    <View style={{ flex: 1 }} onStartShouldSetResponderCapture={onTouchStartCapture}>
      {children}
      <IdleCountdownBadge
        countdown={countdown}
        style={{
          right: insets.right + 16,
          bottom: insets.bottom + media.tabBarHeight + 24,
        }}
      />
    </View>
  );
}
