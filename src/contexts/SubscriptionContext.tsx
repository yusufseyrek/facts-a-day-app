import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
  LOG_LEVEL
} from 'react-native-purchases';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Subscription tiers
export type SubscriptionTier = 'free' | 'premium';

// Context type
interface SubscriptionContextType {
  subscriptionTier: SubscriptionTier;
  isLoading: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  purchasePackage: (pkg: PurchasesPackage) => Promise<CustomerInfo | null>;
  restorePurchases: () => Promise<CustomerInfo | null>;
  checkSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

// Storage keys
const SUBSCRIPTION_TIER_KEY = '@subscription_tier';
const LAST_SYNC_KEY = '@subscription_last_sync';

// RevenueCat entitlement identifier (you'll configure this in RevenueCat dashboard)
const ENTITLEMENT_ID = 'premium';

interface SubscriptionProviderProps {
  children: ReactNode;
}

export const SubscriptionProvider: React.FC<SubscriptionProviderProps> = ({ children }) => {
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>('free');
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);

  // Initialize RevenueCat
  useEffect(() => {
    initializeRevenueCat();
  }, []);

  const initializeRevenueCat = async () => {
    try {
      // Get API keys from app.json
      const apiKey = Platform.select({
        ios: Constants.expoConfig?.extra?.REVENUECAT_IOS_API_KEY,
        android: Constants.expoConfig?.extra?.REVENUECAT_ANDROID_API_KEY,
      });

      if (!apiKey || apiKey.startsWith('YOUR_')) {
        console.warn('RevenueCat API key not configured. Using free tier.');
        // Load cached subscription tier
        await loadCachedSubscriptionTier();
        setIsLoading(false);
        return;
      }

      // Configure RevenueCat
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      await Purchases.configure({ apiKey });

      // Get customer info
      const info = await Purchases.getCustomerInfo();
      await updateSubscriptionTier(info);

      // Load offerings
      const offerings = await Purchases.getOfferings();
      if (offerings.current) {
        setOfferings(offerings.current);
      }

      // Listen for purchase updates
      Purchases.addCustomerInfoUpdateListener((info) => {
        updateSubscriptionTier(info);
      });

      setIsLoading(false);
    } catch (error) {
      console.error('Error initializing RevenueCat:', error);
      // Load cached subscription tier as fallback
      await loadCachedSubscriptionTier();
      setIsLoading(false);
    }
  };

  const updateSubscriptionTier = async (info: CustomerInfo) => {
    setCustomerInfo(info);

    // Check if user has premium entitlement
    const isPremium = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
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

  const purchasePackage = async (pkg: PurchasesPackage): Promise<CustomerInfo | null> => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      await updateSubscriptionTier(customerInfo);
      return customerInfo;
    } catch (error: any) {
      if (error.userCancelled) {
        console.log('User cancelled purchase');
      } else {
        console.error('Error purchasing package:', error);
      }
      return null;
    }
  };

  const restorePurchases = async (): Promise<CustomerInfo | null> => {
    try {
      const info = await Purchases.restorePurchases();
      await updateSubscriptionTier(info);
      return info;
    } catch (error) {
      console.error('Error restoring purchases:', error);
      return null;
    }
  };

  const checkSubscription = async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      await updateSubscriptionTier(info);
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const value: SubscriptionContextType = {
    subscriptionTier,
    isLoading,
    customerInfo,
    offerings,
    purchasePackage,
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
