import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  useIAP,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction as finishTransactionModule,
  ErrorCode,
  type ProductSubscription,
  type Purchase,
} from 'expo-iap';

import { SUBSCRIPTION } from '../config/app';
import { setAnalyticsUserProperty } from '../config/firebase';
import { setIsPremium as setPremiumState } from '../services/premiumState';
import { cachePremiumStatus, getCachedPremiumStatus } from '../services/purchases';
import {
  trackSubscriptionPurchased,
  trackSubscriptionRestored,
  trackSubscriptionStatusChanged,
} from '../services/analytics';

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
  const [isPremium, setIsPremium] = useState(false);
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

        // Check active subscriptions
        await getActiveSubscriptions([...SUBSCRIPTION.PRODUCT_IDS]);
      } catch (error) {
        console.error('Failed to initialize IAP products:', error);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [connected]);

  // React to activeSubscriptions changes
  useEffect(() => {
    if (!connected) return;
    const hasActive = activeSubscriptions && activeSubscriptions.length > 0;
    updatePremiumStatus(!!hasActive);
  }, [activeSubscriptions, connected, updatePremiumStatus]);

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
