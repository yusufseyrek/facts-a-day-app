import AsyncStorage from '@react-native-async-storage/async-storage';
import { initConnection, endConnection, hasActiveSubscriptions } from 'expo-iap';

import { SUBSCRIPTION } from '../config/app';
import { setIsPremium } from './premiumState';

/**
 * Initialize the IAP connection with the store.
 * Should be called once during app startup.
 */
export const initIAPConnection = async (): Promise<void> => {
  try {
    await initConnection();
    console.log('IAP connection initialized');
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
    const isActive = await hasActiveSubscriptions([...SUBSCRIPTION.PRODUCT_IDS]);
    setIsPremium(isActive);
    await cachePremiumStatus(isActive);
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
 */
export const cachePremiumStatus = async (isPremium: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(SUBSCRIPTION.PREMIUM_STORAGE_KEY, JSON.stringify(isPremium));
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

