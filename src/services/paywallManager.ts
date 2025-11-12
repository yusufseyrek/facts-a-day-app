import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const FIRST_LAUNCH_DATE_KEY = '@first_launch_date';
const PAYWALL_SHOWN_TODAY_KEY = '@paywall_shown_today';
const PAYWALL_DISMISSED_COUNT_KEY = '@paywall_dismissed_count';

// Configuration
const DAYS_BEFORE_PAYWALL = 5; // Show paywall after 5 days of use
const MAX_DISMISSALS_PER_DAY = 1; // Only show paywall once per day

/**
 * Initialize first launch tracking
 */
export const initializePaywallTracking = async (): Promise<void> => {
  try {
    const firstLaunch = await AsyncStorage.getItem(FIRST_LAUNCH_DATE_KEY);

    if (!firstLaunch) {
      // First time user opened the app
      await AsyncStorage.setItem(FIRST_LAUNCH_DATE_KEY, new Date().toISOString());
    }
  } catch (error) {
    console.error('Error initializing paywall tracking:', error);
  }
};

/**
 * Check if paywall should be shown
 * @param isPremium - Whether user is already premium
 * @returns Whether paywall should be shown
 */
export const shouldShowPaywall = async (isPremium: boolean): Promise<boolean> => {
  // Don't show for premium users
  if (isPremium) {
    return false;
  }

  try {
    // Get first launch date
    const firstLaunchStr = await AsyncStorage.getItem(FIRST_LAUNCH_DATE_KEY);
    if (!firstLaunchStr) {
      // Initialize if not set
      await initializePaywallTracking();
      return false;
    }

    const firstLaunchDate = new Date(firstLaunchStr);
    const now = new Date();

    // Calculate days since first launch
    const daysSinceFirstLaunch = Math.floor(
      (now.getTime() - firstLaunchDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if enough days have passed
    if (daysSinceFirstLaunch < DAYS_BEFORE_PAYWALL) {
      return false;
    }

    // Check if paywall was already shown today
    const shownTodayStr = await AsyncStorage.getItem(PAYWALL_SHOWN_TODAY_KEY);
    if (shownTodayStr) {
      const shownToday = new Date(shownTodayStr);
      const isToday = shownToday.toDateString() === now.toDateString();

      if (isToday) {
        return false; // Already shown today
      }
    }

    return true;
  } catch (error) {
    console.error('Error checking if paywall should be shown:', error);
    return false;
  }
};

/**
 * Mark that paywall was shown
 */
export const markPaywallShown = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(PAYWALL_SHOWN_TODAY_KEY, new Date().toISOString());
  } catch (error) {
    console.error('Error marking paywall shown:', error);
  }
};

/**
 * Get days since first launch
 */
export const getDaysSinceFirstLaunch = async (): Promise<number> => {
  try {
    const firstLaunchStr = await AsyncStorage.getItem(FIRST_LAUNCH_DATE_KEY);
    if (!firstLaunchStr) {
      return 0;
    }

    const firstLaunchDate = new Date(firstLaunchStr);
    const now = new Date();

    return Math.floor(
      (now.getTime() - firstLaunchDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  } catch (error) {
    console.error('Error getting days since first launch:', error);
    return 0;
  }
};

/**
 * Reset paywall tracking (for testing)
 */
export const resetPaywallTracking = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(FIRST_LAUNCH_DATE_KEY);
    await AsyncStorage.removeItem(PAYWALL_SHOWN_TODAY_KEY);
    await AsyncStorage.removeItem(PAYWALL_DISMISSED_COUNT_KEY);
  } catch (error) {
    console.error('Error resetting paywall tracking:', error);
  }
};
