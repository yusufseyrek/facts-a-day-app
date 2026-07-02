import { useCallback, useEffect, useState } from 'react';

import { ErrorCode, useIAP } from 'expo-iap';

import { HINT_PACK_IDS, HINT_PACKS } from '../config/app';
import { trackPaywallPurchaseInitiated } from '../services/analytics';
import { devGrantHints, getHintBalance, onHintBalanceChange } from '../services/hintWallet';
import {
  type CachedHintPack,
  cacheHintPackPrices,
  getCachedHintPackPrices,
} from '../services/purchases';

/**
 * Wrapper around useIAP that suppresses init connection failures, matching
 * usePaywallPurchase's useSafeIAP (store unavailable on simulators / during
 * onboarding must not throw).
 */
function useSafeIAP() {
  return useIAP({
    onError: (error) => {
      if (__DEV__) console.warn('IAP error (non-fatal):', error.message);
    },
  });
}

/**
 * Dev-only placeholder prices so the hint store renders with real-looking
 * numbers where the store is unavailable (mirrors DEV_MOCK_PRICES in
 * PremiumContext). Never used in production.
 */
const DEV_MOCK_PACK_PRICES: CachedHintPack[] = [
  { id: 'factsaday_hints_small', displayPrice: '$0.99' },
  { id: 'factsaday_hints_medium', displayPrice: '$2.99' },
  { id: 'factsaday_hints_large', displayPrice: '$5.99' },
];

/** Live purchased-hint balance, kept in sync with the wallet. */
export function useHintBalance(): number {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    let mounted = true;
    getHintBalance().then((b) => {
      if (mounted) setBalance(b);
    });
    const unsubscribe = onHintBalanceChange(setBalance);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return balance;
}

export interface HintPurchase {
  /** Live purchased-hint balance. */
  balance: number;
  /** Pack product IDs in display order (small → large). */
  productIds: readonly string[];
  /** Hints granted by a pack. */
  hintsFor: (productId: string) => number;
  /** Display price ("$0.99" / "---") for a pack. */
  getDisplayPrice: (productId: string) => string;
  /** Product ID currently being purchased, or null. */
  purchasingId: string | null;
  /** Buy a pack (in dev: credits the wallet without the store). */
  purchasePack: (productId: string) => Promise<void>;
  /** Whether any pack is purchasable (live or cached prices present). */
  productsAvailable: boolean;
  /**
   * Whether a pack can be bought RIGHT NOW — requires the live store product,
   * not just a cached price (cached prices render tiles; purchases need the
   * fetched product). Always true in dev.
   */
  isPackAvailable: (productId: string) => boolean;
}

/**
 * Purchase + pricing logic for consumable hint packs. The actual crediting
 * happens in PremiumContext's global purchaseUpdatedListener (credit → finish
 * as consumable); this hook only fetches products and kicks off purchases.
 * `source` segments analytics (e.g. 'trivia_hub', 'trivia_game').
 */
export function useHintPurchase(source: string): HintPurchase {
  const { connected, products, fetchProducts, requestPurchase } = useSafeIAP();
  const balance = useHintBalance();
  const [cachedPrices, setCachedPrices] = useState<CachedHintPack[]>(
    __DEV__ ? DEV_MOCK_PACK_PRICES : []
  );
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  // Cached prices for instant render before the store answers.
  useEffect(() => {
    if (__DEV__) return;
    getCachedHintPackPrices().then((packs) => {
      if (packs.length > 0) setCachedPrices(packs);
    });
  }, []);

  // Fetch live products when the store connection is up.
  useEffect(() => {
    if (!connected || !HINT_PACKS.ENABLED) return;
    fetchProducts({ skus: [...HINT_PACK_IDS], type: 'in-app' }).catch((error) => {
      if (__DEV__) console.warn('Failed to fetch hint packs:', error);
    });
  }, [connected, fetchProducts]);

  // Cache live prices once they arrive (instant render on the next open).
  useEffect(() => {
    const packs = products.filter((p) => HINT_PACKS.HINTS_BY_PRODUCT[p.id] != null);
    if (packs.length > 0) {
      cacheHintPackPrices(packs.map((p) => ({ id: p.id, displayPrice: p.displayPrice })));
    }
  }, [products]);

  const getDisplayPrice = useCallback(
    (productId: string): string =>
      products.find((p) => p.id === productId)?.displayPrice ??
      cachedPrices.find((c) => c.id === productId)?.displayPrice ??
      '---',
    [products, cachedPrices]
  );

  const hintsFor = useCallback(
    (productId: string): number => HINT_PACKS.HINTS_BY_PRODUCT[productId] ?? 0,
    []
  );

  const isPackAvailable = useCallback(
    (productId: string): boolean => __DEV__ || products.some((p) => p.id === productId),
    [products]
  );

  const purchasePack = useCallback(
    async (productId: string) => {
      if (purchasingId || !isPackAvailable(productId)) return;

      trackPaywallPurchaseInitiated({
        productId,
        source,
        displayPrice: getDisplayPrice(productId),
      });

      // Dev: no real store — credit the wallet so the flow is testable.
      if (__DEV__) {
        setPurchasingId(productId);
        try {
          await devGrantHints(HINT_PACKS.HINTS_BY_PRODUCT[productId] ?? 0);
        } finally {
          setPurchasingId(null);
        }
        return;
      }

      setPurchasingId(productId);
      try {
        await requestPurchase({
          request: {
            apple: { sku: productId, andDangerouslyFinishTransactionAutomatically: false },
            google: { skus: [productId] },
          },
          type: 'in-app',
        });
      } catch (error: any) {
        // Cancellation and failure analytics come from PremiumContext's
        // global purchaseErrorListener; just avoid noisy cancel logs here.
        if (error?.code !== ErrorCode.UserCancelled) {
          console.error('Hint pack purchase error:', error);
        }
      } finally {
        setPurchasingId(null);
      }
    },
    [purchasingId, source, getDisplayPrice, requestPurchase, isPackAvailable]
  );

  const productsAvailable =
    HINT_PACKS.ENABLED &&
    (products.some((p) => HINT_PACKS.HINTS_BY_PRODUCT[p.id] != null) || cachedPrices.length > 0);

  return {
    balance,
    productIds: HINT_PACK_IDS,
    hintsFor,
    getDisplayPrice,
    purchasingId,
    purchasePack,
    productsAvailable,
    isPackAvailable,
  };
}
