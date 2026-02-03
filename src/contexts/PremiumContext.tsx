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
import {
  cachePremiumStatus,
  getCachedPremiumStatus,
  getDevPremiumOverride,
  setDevPremiumOverride,
} from '../services/purchases';
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
  mockDevPurchase: () => Promise<void>;
  /** [DEV ONLY] Toggle dev premium override - persists across app restarts */
  toggleDevPremium: () => Promise<void>;
}

const PremiumContext = createContext<PremiumContextType>({
  isPremium: false,
  isLoading: true,
  subscriptions: [],
  restorePurchases: async () => false,
  mockDevPurchase: async () => {},
  toggleDevPremium: async () => {},
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

  // Update premium state everywhere when it changes
  const updatePremiumStatus = useCallback(async (status: boolean) => {
    setIsPremium(status);
    setPremiumState(status);
    await cachePremiumStatus(status);
    await setAnalyticsUserProperty('is_premium', status ? 'true' : 'false');
    trackSubscriptionStatusChanged(status);
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

  // Load cached status and dev override immediately for fast cold start
  useEffect(() => {
    const loadInitialStatus = async () => {
      // Check dev override first (only in DEV mode)
      if (__DEV__) {
        const devOverride = await getDevPremiumOverride();
        if (devOverride !== null) {
          console.log('[DEV] Using dev premium override:', devOverride);
          setIsPremium(devOverride);
          setPremiumState(devOverride);
          return;
        }
      }
      // Fall back to cached status
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
    // DEV mode: mock restore as successful
    if (__DEV__) {
      console.log('[DEV] Mocking restore purchases - granting premium');
      await updatePremiumStatus(true);
      trackSubscriptionRestored();
      return true;
    }

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

  // DEV mode only: Mock purchase for testing
  const mockDevPurchase = useCallback(async (): Promise<void> => {
    if (!__DEV__) {
      console.warn('mockDevPurchase should only be called in DEV mode');
      return;
    }
    console.log('[DEV] Mocking purchase - granting premium');
    await updatePremiumStatus(true);
    trackSubscriptionPurchased({ productId: 'dev_mock_purchase' });
  }, [updatePremiumStatus]);

  // DEV mode only: Toggle dev premium override (persists across app restarts)
  const toggleDevPremium = useCallback(async (): Promise<void> => {
    if (!__DEV__) {
      console.warn('toggleDevPremium should only be called in DEV mode');
      return;
    }
    const newStatus = !isPremium;
    console.log('[DEV] Toggling dev premium to:', newStatus);
    await setDevPremiumOverride(newStatus);
    setIsPremium(newStatus);
    setPremiumState(newStatus);
    await setAnalyticsUserProperty('is_premium', newStatus ? 'true' : 'false');
  }, [isPremium]);

  return (
    <PremiumContext.Provider
      value={{
        isPremium,
        isLoading,
        subscriptions,
        restorePurchases,
        mockDevPurchase,
        toggleDevPremium,
      }}
    >
      {children}
    </PremiumContext.Provider>
  );
}
