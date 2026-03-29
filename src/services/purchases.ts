import AsyncStorage from '@react-native-async-storage/async-storage';
import { endConnection, hasActiveSubscriptions, initConnection } from 'expo-iap';

import { SUBSCRIPTION } from '../config/app';

import { getIsConnected } from './network';
import { getIsPremium, setIsPremium } from './premiumState';

/** Don't downgrade a cached premium status unless it's older than this (3 days) */
const PREMIUM_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

const PREMIUM_CACHED_AT_KEY = '@factsaday_premium_cached_at';

/**
 * Initialize the IAP connection with the store.
 * Should be called once during app startup.
 */
export const initIAPConnection = async (): Promise<void> => {
  try {
    await initConnection();
    if (__DEV__) console.log('IAP connection initialized');
  } catch (error) {
    // Expected to fail on emulators/simulators without Play Store or StoreKit
    if (__DEV__) {
      console.warn('⚠️ IAP: initConnection failed (expected on emulators)');
    } else {
      console.error('Failed to initialize IAP connection:', error);
    }
  }
};

/**
 * End the IAP connection. Call on app unmount.
 */
export const endIAPConnection = async (): Promise<void> => {
  try {
    await endConnection();
  } catch (error) {
    console.error('Failed to end IAP connection:', error);
  }
};

/**
 * Check if user has an active subscription and update premium state.
 * Returns true if user is premium.
 */
export const checkAndUpdatePremiumStatus = async (): Promise<boolean> => {
  try {
    // Don't verify with store when offline — trust cached status
    if (!getIsConnected()) {
      const cached = await getCachedPremiumStatus();
      setIsPremium(cached);
      return cached;
    }

    const wasPremium = getIsPremium();
    const isActive = await hasActiveSubscriptions([...SUBSCRIPTION.PRODUCT_IDS]);

    // Guard against false downgrades: if the user was premium and the store
    // says they're not, only trust that if the cached status is old enough.
    // StoreKit can return false during init before it has synced, or when
    // the app is backgrounded mid-check.
    if (wasPremium && !isActive && (await isCachedPremiumWithinGracePeriod())) {
      if (__DEV__) console.log('Store returned non-premium but cache is recent — keeping premium');
      return true;
    }

    setIsPremium(isActive);
    await cachePremiumStatus(isActive);

    if (wasPremium && !isActive) {
      if (__DEV__) console.log('Premium expired — image cache will expire via TTL');
    }

    return isActive;
  } catch (error) {
    console.error('Failed to check subscription status:', error);
    // Fall back to cached status
    const cached = await getCachedPremiumStatus();
    setIsPremium(cached);
    return cached;
  }
};

/**
 * Cache premium status in AsyncStorage for fast cold-start reads.
 * Also stores a timestamp so we can apply a grace period on downgrades.
 */
export const cachePremiumStatus = async (isPremium: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(SUBSCRIPTION.PREMIUM_STORAGE_KEY, JSON.stringify(isPremium));
    if (isPremium) {
      await AsyncStorage.setItem(PREMIUM_CACHED_AT_KEY, Date.now().toString());
    } else {
      await AsyncStorage.removeItem(PREMIUM_CACHED_AT_KEY);
    }
  } catch (error) {
    console.error('Failed to cache premium status:', error);
  }
};

/**
 * Read cached premium status from AsyncStorage.
 * Used for instant cold-start checks before IAP connection is ready.
 */
export const getCachedPremiumStatus = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(SUBSCRIPTION.PREMIUM_STORAGE_KEY);
    return value ? JSON.parse(value) === true : false;
  } catch {
    return false;
  }
};

/**
 * Returns true if there's a cached premium=true that is within the grace period.
 * Used to prevent false downgrades when StoreKit hasn't synced yet.
 */
export const isCachedPremiumWithinGracePeriod = async (): Promise<boolean> => {
  try {
    const cachedAt = await AsyncStorage.getItem(PREMIUM_CACHED_AT_KEY);
    if (!cachedAt) return false;
    return Date.now() - Number(cachedAt) < PREMIUM_GRACE_PERIOD_MS;
  } catch {
    return false;
  }
};

// --- Subscription price caching ---

const SUBSCRIPTION_CACHE_KEY = '@factsaday_subscription_cache';

export interface CachedSubscription {
  id: string;
  displayPrice: string;
}

/**
 * Cache subscription product info (id + displayPrice) for instant paywall display.
 */
export const cacheSubscriptions = async (subs: CachedSubscription[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(subs));
  } catch (error) {
    console.error('Failed to cache subscriptions:', error);
  }
};

/**
 * Read cached subscription products. Returns empty array if none cached.
 */
export const getCachedSubscriptions = async (): Promise<CachedSubscription[]> => {
  try {
    const value = await AsyncStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
};
