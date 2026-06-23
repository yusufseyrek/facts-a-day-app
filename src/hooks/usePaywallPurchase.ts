import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { ErrorCode, useIAP } from 'expo-iap';

import { SUBSCRIPTION } from '../config/app';
import { usePremium } from '../contexts';
import {
  trackPaywallPlanSelected,
  trackPaywallPurchaseInitiated,
  trackRestorePurchasesTapped,
} from '../services/analytics';
import {
  getDisplayPrice as getDisplayPriceOf,
  monthlyPerWeekDisplay as monthlyPerWeekDisplayOf,
  monthlySavingsPercent as monthlySavingsPercentOf,
  type PriceSources,
} from '../utils/paywallPricing';

const { PAYWALL_PRODUCT_IDS } = SUBSCRIPTION;
const WEEKLY_ID = PAYWALL_PRODUCT_IDS.find((id) => id.includes('weekly')) ?? PAYWALL_PRODUCT_IDS[0];
const MONTHLY_ID =
  PAYWALL_PRODUCT_IDS.find((id) => id.includes('monthly')) ?? PAYWALL_PRODUCT_IDS[0];

/**
 * Wrapper around useIAP that suppresses init connection failures. During
 * onboarding or on simulators the store is unavailable — this keeps the hook
 * from throwing there. (Was a local helper in paywall.tsx.)
 */
function useSafeIAP() {
  return useIAP({
    onError: (error) => {
      if (__DEV__) console.warn('IAP error (non-fatal):', error.message);
    },
  });
}

export interface PaywallPurchase {
  isPremium: boolean;
  /** Products to render, in display order (weekly, monthly). */
  productIds: readonly string[];
  selectedPlan: string | null;
  /** Select a plan and emit the plan-selected analytics event. */
  selectPlan: (productId: string) => void;
  isPurchasing: boolean;
  isRestoring: boolean;
  /** Buy the selected plan (in dev: flips premium on without the store). */
  handlePurchase: () => Promise<void>;
  /** Restore prior purchases; resolves to whether an active sub was found. */
  handleRestore: () => Promise<boolean>;
  /** Display price ("$4.99" / "---") for a product. */
  getDisplayPrice: (productId: string) => string;
  /** Whole-percent saving of monthly vs. weekly, or null. */
  monthlySavingsPercent: number | null;
  /** Monthly plan's effective per-week price ("$3.46"), or null. */
  monthlyPerWeekDisplay: string | null;
}

/**
 * Shared purchase + pricing logic for every premium surface (the full paywall
 * and the compact remove-ads sheet). Owns plan selection / purchasing / restore
 * state, wires the expo-iap layer, and exposes the tested pure pricing helpers
 * bound to the live + cached price sources. `source` segments analytics
 * (e.g. 'settings', 'ad_close').
 */
export function usePaywallPurchase(source: string): PaywallPurchase {
  const { isPremium, subscriptions, cachedPrices, restorePurchases, devSetPremium } = usePremium();
  const { requestPurchase } = useSafeIAP();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Narrow the IAP/cached records to the pure module's PriceLike shape so the
  // expo-iap union types never leak into the pricing helpers.
  const sources = useMemo<PriceSources>(
    () => ({
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        displayPrice: s.displayPrice,
        price: s.price ?? null,
        subscriptionOffers: s.subscriptionOffers?.map((o) => ({ price: o?.price ?? null })),
      })),
      cachedPrices,
    }),
    [subscriptions, cachedPrices]
  );

  const getDisplayPrice = useCallback(
    (productId: string) => getDisplayPriceOf(productId, sources),
    [sources]
  );

  const monthlySavingsPercent = useMemo(
    () => monthlySavingsPercentOf(sources, { weeklyId: WEEKLY_ID, monthlyId: MONTHLY_ID }),
    [sources]
  );

  const monthlyPerWeekDisplay = useMemo(
    () => monthlyPerWeekDisplayOf(sources, { monthlyId: MONTHLY_ID }),
    [sources]
  );

  const selectPlan = useCallback(
    (productId: string) => {
      setSelectedPlan(productId);
      trackPaywallPlanSelected({
        productId,
        source,
        isDefault: false,
        displayPrice: getDisplayPriceOf(productId, sources),
      });
    },
    [source, sources]
  );

  // Default selection: monthly when present, else the first available product.
  // Prefer live subscriptions, fall back to cached prices.
  useEffect(() => {
    if (selectedPlan) return;
    let defaultId: string | null = null;
    if (subscriptions.length > 0) {
      const monthly = subscriptions.find((s) => s.id.includes('monthly'));
      defaultId = monthly?.id || subscriptions[0].id;
    } else if (cachedPrices.length > 0) {
      const monthly = cachedPrices.find((c) => c.id.includes('monthly'));
      defaultId = monthly?.id || cachedPrices[0].id;
    }
    if (defaultId) {
      setSelectedPlan(defaultId);
      trackPaywallPlanSelected({
        productId: defaultId,
        source,
        isDefault: true,
        displayPrice: getDisplayPriceOf(defaultId, sources),
      });
    }
  }, [subscriptions, cachedPrices, selectedPlan, source, sources]);

  const handlePurchase = useCallback(async () => {
    if (isPurchasing) return;

    // Dev: no real store — just activate premium so the flow is testable.
    if (__DEV__) {
      setIsPurchasing(true);
      try {
        await devSetPremium(true);
      } finally {
        setIsPurchasing(false);
      }
      return;
    }

    if (!selectedPlan) return;

    setIsPurchasing(true);
    try {
      const sub = subscriptions.find((s) => s.id === selectedPlan);
      if (!sub) return;

      const offerToken =
        Platform.OS === 'android' && sub.subscriptionOffers?.[0]?.offerTokenAndroid
          ? sub.subscriptionOffers[0].offerTokenAndroid
          : '';

      trackPaywallPurchaseInitiated({
        productId: selectedPlan,
        source,
        displayPrice: getDisplayPriceOf(selectedPlan, sources),
      });

      await requestPurchase({
        request: {
          apple: { sku: selectedPlan, andDangerouslyFinishTransactionAutomatically: false },
          google: {
            skus: [selectedPlan],
            subscriptionOffers: [{ sku: selectedPlan, offerToken: offerToken || '' }],
          },
        },
        type: 'subs',
      });
    } catch (error: any) {
      if (error?.code !== ErrorCode.UserCancelled) {
        console.error('Purchase error:', error);
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [isPurchasing, selectedPlan, subscriptions, sources, source, devSetPremium, requestPurchase]);

  const handleRestore = useCallback(async (): Promise<boolean> => {
    // Restore is attributed to the 'paywall' surface (matches PremiumContext's
    // restore-result analytics), independent of which screen triggered it.
    trackRestorePurchasesTapped({ source: 'paywall' });
    setIsRestoring(true);
    try {
      return await restorePurchases();
    } catch (error) {
      console.error('Restore error:', error);
      return false;
    } finally {
      setIsRestoring(false);
    }
  }, [restorePurchases]);

  return {
    isPremium,
    productIds: PAYWALL_PRODUCT_IDS,
    selectedPlan,
    selectPlan,
    isPurchasing,
    isRestoring,
    handlePurchase,
    handleRestore,
    getDisplayPrice,
    monthlySavingsPercent,
    monthlyPerWeekDisplay,
  };
}
