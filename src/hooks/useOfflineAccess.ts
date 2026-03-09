import { useEffect, useState } from 'react';

import { usePremium } from '../contexts/PremiumContext';
import { getIsConnected, onNetworkChange } from '../services/network';

/**
 * Hook to determine offline access state for premium gating.
 * Uses native network state events (expo-network) for instant detection.
 *
 * - isOffline: device has no network connectivity
 * - hasFullOfflineAccess: user is premium (can browse everything offline)
 * - shouldShowOfflineGate: user is offline AND not premium AND premium status is resolved
 */
export function useOfflineAccess() {
  const { isPremium, isLoading } = usePremium();
  const [isOffline, setIsOffline] = useState(!getIsConnected());

  useEffect(() => {
    const unsubscribe = onNetworkChange((connected) => {
      setIsOffline(!connected);
    });
    return unsubscribe;
  }, []);

  return {
    isOffline,
    hasFullOfflineAccess: isPremium,
    // Don't gate until premium status is resolved (prevents flash on cold start)
    shouldShowOfflineGate: isOffline && !isPremium && !isLoading,
  };
}
