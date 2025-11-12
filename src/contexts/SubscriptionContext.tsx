import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  restorePurchases as restorePurchasesIAP,
  getAvailablePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Purchase,
} from 'expo-iap';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Subscription tiers
export type SubscriptionTier = 'free' | 'premium';

// Product information
export interface ProductInfo {
  productId: string;
  price: string;
  priceFormatted: string;
  title: string;
  description: string;
  type: 'monthly' | 'annual';
}

// Context type
interface SubscriptionContextType {
  subscriptionTier: SubscriptionTier;
  isLoading: boolean;
  products: ProductInfo[];
  purchaseProduct: (productId: string) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  checkSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

// Storage keys
const SUBSCRIPTION_TIER_KEY = '@subscription_tier';
const LAST_SYNC_KEY = '@subscription_last_sync';

// Product IDs - Update these with your actual product IDs from App Store Connect and Google Play Console
const PRODUCT_IDS = Platform.select({
  ios: {
    monthly: 'com.factsaday.monthly',
    annual: 'com.factsaday.annual',
  },
  android: {
    monthly: 'com.factsaday.monthly',
    annual: 'com.factsaday.annual',
  },
  default: {
    monthly: 'com.factsaday.monthly',
    annual: 'com.factsaday.annual',
  },
})!;

interface SubscriptionProviderProps {
  children: ReactNode;
}

export const SubscriptionProvider: React.FC<SubscriptionProviderProps> = ({ children }) => {
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>('free');
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<ProductInfo[]>([]);

  // Initialize In-App Purchases
  useEffect(() => {
    let purchaseUpdateSubscription: { remove: () => void } | null = null;
    let purchaseErrorSubscription: { remove: () => void } | null = null;

    const initializeIAP = async () => {
      try {
        // Load cached subscription tier first
        await loadCachedSubscriptionTier();

        // Connect to store
        await initConnection();

        // Set up purchase listeners
        purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: Purchase) => {
          console.log('Purchase updated:', purchase);

          // Finish the transaction
          await finishTransaction({
            purchase,
            isConsumable: false, // Subscriptions are not consumable
          });

          // Update subscription status
          await checkSubscription();
        });

        purchaseErrorSubscription = purchaseErrorListener((error) => {
          console.error('Purchase error:', error);
        });

        // Get products
        const productList = await fetchProducts({
          skus: [PRODUCT_IDS.monthly, PRODUCT_IDS.annual],
          type: 'subs',
        });

        if (productList && productList.length > 0) {
          const formattedProducts: ProductInfo[] = productList.map((product) => ({
            productId: product.id,
            price: product.price ? String(product.price) : '0',
            priceFormatted: product.displayPrice || '$0',
            title: product.title || '',
            description: product.description || '',
            type: product.id === PRODUCT_IDS.monthly ? 'monthly' as const : 'annual' as const,
          }));
          setProducts(formattedProducts);
        }

        // Check current subscription status
        await checkSubscription();

        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing IAP:', error);
        // Load cached subscription tier as fallback
        await loadCachedSubscriptionTier();
        setIsLoading(false);
      }
    };

    initializeIAP();

    return () => {
      // Cleanup: remove listeners and disconnect
      purchaseUpdateSubscription?.remove();
      purchaseErrorSubscription?.remove();
      endConnection().catch(console.error);
    };
  }, []);

  const updateSubscriptionTier = async (isPremium: boolean) => {
    const tier: SubscriptionTier = isPremium ? 'premium' : 'free';
    setSubscriptionTier(tier);

    // Cache the subscription tier
    await AsyncStorage.setItem(SUBSCRIPTION_TIER_KEY, tier);
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  };

  const loadCachedSubscriptionTier = async () => {
    try {
      const cached = await AsyncStorage.getItem(SUBSCRIPTION_TIER_KEY);
      if (cached === 'premium' || cached === 'free') {
        setSubscriptionTier(cached);
      }
    } catch (error) {
      console.error('Error loading cached subscription tier:', error);
    }
  };

  const isSubscriptionActive = (purchase: Purchase): boolean => {
    // Check if purchase is in a valid state
    if (purchase.purchaseState !== 'purchased') {
      return false;
    }

    // For iOS, check expiration date if available
    if (Platform.OS === 'ios' && 'expirationDateIOS' in purchase) {
      const expirationDate = purchase.expirationDateIOS;
      if (expirationDate) {
        return expirationDate > Date.now();
      }
    }

    // For Android, check auto-renewing status
    if (Platform.OS === 'android' && 'isAcknowledgedAndroid' in purchase) {
      return purchase.isAutoRenewing;
    }

    // If no expiration info, consider it active if purchased
    return true;
  };

  const checkSubscription = async () => {
    try {
      const purchases = await getAvailablePurchases();

      if (purchases && purchases.length > 0) {
        // Check if user has any active premium subscription
        const hasPremium = purchases.some(
          (purchase) =>
            (purchase.productId === PRODUCT_IDS.monthly ||
             purchase.productId === PRODUCT_IDS.annual) &&
            isSubscriptionActive(purchase)
        );

        await updateSubscriptionTier(hasPremium);
      } else {
        await updateSubscriptionTier(false);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const purchaseProduct = async (productId: string): Promise<boolean> => {
    try {
      await requestPurchase({
        request: {
          ios: {
            sku: productId,
          },
          android: {
            skus: [productId],
          },
        },
        type: 'subs',
      });

      // Return true to indicate purchase was initiated successfully
      // The actual result will be handled by the purchase listener
      return true;
    } catch (error) {
      console.error('Error purchasing product:', error);
      return false;
    }
  };

  const restorePurchases = async (): Promise<boolean> => {
    try {
      // Restore purchases
      await restorePurchasesIAP();

      // Get available purchases after restore
      const purchases = await getAvailablePurchases();

      if (purchases && purchases.length > 0) {
        // Check if user has any active premium subscription
        const hasPremium = purchases.some(
          (purchase) =>
            (purchase.productId === PRODUCT_IDS.monthly ||
             purchase.productId === PRODUCT_IDS.annual) &&
            isSubscriptionActive(purchase)
        );

        await updateSubscriptionTier(hasPremium);
        return hasPremium;
      }

      return false;
    } catch (error) {
      console.error('Error restoring purchases:', error);
      return false;
    }
  };

  const value: SubscriptionContextType = {
    subscriptionTier,
    isLoading,
    products,
    purchaseProduct,
    restorePurchases,
    checkSubscription,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

// Hook to use subscription context
export const useSubscription = (): SubscriptionContextType => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

// Helper hook to check if user is premium
export const useIsPremium = (): boolean => {
  const { subscriptionTier } = useSubscription();
  return subscriptionTier === 'premium';
};
