import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import {
  ErrorCode,
  finishTransaction as finishTransactionModule,
  type ProductSubscription,
  type Purchase,
  purchaseErrorListener,
  purchaseUpdatedListener,
  useIAP,
} from 'expo-iap';

import { DEV_FORCE_PREMIUM, SUBSCRIPTION } from '../config/app';
import { setAnalyticsUserProperty } from '../config/firebase';
import {
  trackSubscriptionPurchased,
  trackSubscriptionRestored,
  trackSubscriptionStatusChanged,
} from '../services/analytics';
import { preloadAppOpenAd } from '../components/ads/AppOpenAd';
import { preloadInterstitialAd } from '../components/ads/InterstitialAd';
import { getIsConnected } from '../services/network';
import {
  getIsPremium as getPremiumState,
  setIsPremium as setPremiumState,
  shouldShowAds,
} from '../services/premiumState';
import {
  cachePremiumStatus,
  getCachedPremiumStatus,
  isCachedPremiumWithinGracePeriod,
} from '../services/purchases';

interface PremiumContextType {
  isPremium: boolean;
  isLoading: boolean;
  subscriptions: ProductSubscription[];
  restorePurchases: () => Promise<boolean>;
}

const PremiumContext = createContext<PremiumContextType>({
  isPremium: false,
  isLoading: true,
  subscriptions: [],
  restorePurchases: async () => false,
});

export const usePremium = () => useContext(PremiumContext);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  // Dev shortcut: skip all IAP logic and force premium
  if (DEV_FORCE_PREMIUM) {
    return (
      <PremiumContext.Provider
        value={{ isPremium: true, isLoading: false, subscriptions: [], restorePurchases: async () => true }}
      >
        {children}
      </PremiumContext.Provider>
    );
  }

  return <IAPPremiumProvider>{children}</IAPPremiumProvider>;
}

function IAPPremiumProvider({ children }: { children: React.ReactNode }) {
  // Initialize from in-memory state (already set by _layout.tsx from cache)
  const [isPremium, setIsPremium] = useState(getPremiumState);
  const [isLoading, setIsLoading] = useState(true);
  const updatePremiumRef = useRef<(status: boolean) => Promise<void>>(undefined);

  const {
    connected,
    subscriptions,
    activeSubscriptions,
    fetchProducts,
    getActiveSubscriptions,
    getAvailablePurchases,
  } = useIAP();

  // Track the last known status to avoid redundant analytics events
  const lastKnownStatusRef = useRef<boolean | null>(null);

  // Update premium state everywhere when it changes
  const updatePremiumStatus = useCallback(async (status: boolean) => {
    setIsPremium(status);
    setPremiumState(status);
    await cachePremiumStatus(status);
    await setAnalyticsUserProperty('is_premium', status ? 'true' : 'false');
    // Only fire analytics on actual transitions, not initial load
    if (lastKnownStatusRef.current !== null && lastKnownStatusRef.current !== status) {
      trackSubscriptionStatusChanged(status);

      // When user loses premium, preload ads so they're ready immediately
      if (!status && shouldShowAds()) {
        preloadInterstitialAd();
        preloadAppOpenAd().catch(console.error);
      }
    }
    lastKnownStatusRef.current = status;
  }, []);

  // Keep ref in sync for use in event listeners
  useEffect(() => {
    updatePremiumRef.current = updatePremiumStatus;
  }, [updatePremiumStatus]);

  // Listen for purchase events
  useEffect(() => {
    const purchaseSub = purchaseUpdatedListener(async (purchase: Purchase) => {
      try {
        await finishTransactionModule({ purchase, isConsumable: false });
        await updatePremiumRef.current?.(true);
        trackSubscriptionPurchased({ productId: purchase.productId });
      } catch (error) {
        console.error('Failed to finish transaction:', error);
      }
    });

    const errorSub = purchaseErrorListener((error) => {
      if (error.code !== ErrorCode.UserCancelled) {
        console.error('Purchase error:', error.message);
      }
    });

    return () => {
      purchaseSub.remove();
      errorSub.remove();
    };
  }, []);

  // Load cached status immediately for fast cold start
  useEffect(() => {
    const loadInitialStatus = async () => {
      const cached = await getCachedPremiumStatus();
      if (cached) {
        setIsPremium(true);
        setPremiumState(true);
      }
    };
    loadInitialStatus();
  }, []);

  // When connected, fetch products and check active subscriptions
  useEffect(() => {
    if (!connected) return;

    const init = async () => {
      try {
        // Fetch subscription products for paywall display
        await fetchProducts({
          skus: [...SUBSCRIPTION.PRODUCT_IDS],
          type: 'subs',
        });

        // Only verify subscriptions with the store if we have network
        // When offline, trust cached premium status
        if (getIsConnected()) {
          await getActiveSubscriptions([...SUBSCRIPTION.PRODUCT_IDS]);
        }
      } catch (error) {
        console.error('Failed to initialize IAP products:', error);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [connected]);

  // React to activeSubscriptions changes (only after initial load completes)
  // When offline, trust cached premium status — don't let empty store response override it
  useEffect(() => {
    if (!connected || isLoading) return;
    const hasActive = activeSubscriptions && activeSubscriptions.length > 0;

    // If offline and store says no active subs, trust the cached value instead
    // (store can't verify subscriptions without network)
    if (!hasActive && !getIsConnected()) {
      return;
    }

    // Guard against false downgrades: StoreKit can return empty activeSubscriptions
    // during init before it has synced. If user was recently premium, don't downgrade.
    if (!hasActive && getPremiumState()) {
      isCachedPremiumWithinGracePeriod().then((withinGrace) => {
        if (withinGrace) {
          console.log('activeSubscriptions empty but cache is recent — keeping premium');
          return;
        }
        updatePremiumStatus(false);
      });
      return;
    }

    updatePremiumStatus(!!hasActive);
  }, [activeSubscriptions, connected, isLoading, updatePremiumStatus]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      await getAvailablePurchases();
      // After restoring, check active subscriptions
      await getActiveSubscriptions([...SUBSCRIPTION.PRODUCT_IDS]);

      const hasActive = activeSubscriptions && activeSubscriptions.length > 0;
      if (hasActive) {
        await updatePremiumStatus(true);
        trackSubscriptionRestored();
        return true;
      }
      // Explicit user action — trust the result and clear premium cache
      await updatePremiumStatus(false);
      return false;
    } catch (error) {
      console.error('Failed to restore purchases:', error);
      return false;
    }
  }, [getAvailablePurchases, getActiveSubscriptions, activeSubscriptions, updatePremiumStatus]);

  return (
    <PremiumContext.Provider
      value={{
        isPremium,
        isLoading,
        subscriptions,
        restorePurchases,
      }}
    >
      {children}
    </PremiumContext.Provider>
  );
}
