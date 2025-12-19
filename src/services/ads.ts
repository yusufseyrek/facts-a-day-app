import { Platform } from 'react-native';
import mobileAds, {
  AdsConsent,
  AdsConsentDebugGeography,
  AdsConsentStatus,
  MaxAdContentRating,
} from 'react-native-google-mobile-ads';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { preloadInterstitialAd } from '../components/ads/InterstitialAd';
import { ADS_ENABLED } from '../config/ads';
import {
  trackGDPRConsentResult,
  trackATTPermissionResult,
  trackAdsSdkInitialized,
} from './analytics';

// Re-export consent utilities for backwards compatibility
export { canShowPersonalizedAds, shouldRequestNonPersonalizedAdsOnly } from './adsConsent';

// Track if SDK has been initialized
let isSDKInitialized = false;

/**
 * Check if GDPR consent gathering is required (user is in EEA/UK)
 * Returns true if we need to show GDPR consent form, false otherwise
 */
export const isConsentRequired = async (): Promise<boolean> => {
  if (!ADS_ENABLED) {
    return false;
  }

  try {
    // Request info update to get current consent status
    const consentInfo = await AdsConsent.requestInfoUpdate();
    console.log('Consent info:', consentInfo);

    // Check if GDPR specifically applies (user is in EEA/UK)
    const gdprApplies = await AdsConsent.getGdprApplies();
    console.log('GDPR applies:', gdprApplies);

    // Only require soft message if GDPR applies AND consent status is REQUIRED
    const required = gdprApplies && consentInfo.status === AdsConsentStatus.REQUIRED;
    console.log('GDPR consent required:', required);
    return required;
  } catch (error) {
    console.error('Error checking if consent is required:', error);
    // On error, don't show soft message - ATT will still be shown on iOS
    return false;
  }
};

/**
 * Request GDPR consent using Google's UMP SDK
 * Uses gatherConsent() which handles requesting info update and showing form if needed
 * Returns the consent info after gathering consent
 */
export const requestGDPRConsent = async (): Promise<{
  canRequestAds: boolean;
  isConsentFormAvailable: boolean;
  status: AdsConsentStatus;
}> => {
  try {
    // gatherConsent() handles everything:
    // - Requests consent info update
    // - Shows the consent form if required
    // - Returns the final consent status
    const consentInfo = await AdsConsent.gatherConsent();
    console.log('Consent gathered:', consentInfo);

    // Track GDPR consent result
    const gdprApplies = await AdsConsent.getGdprApplies();
    trackGDPRConsentResult({
      status: AdsConsentStatus[consentInfo.status] || 'UNKNOWN',
      canRequestAds: consentInfo.canRequestAds,
      gdprApplies,
    });

    return consentInfo;
  } catch (error) {
    console.error('Error requesting GDPR consent:', error);

    // Track failed consent
    trackGDPRConsentResult({
      status: 'ERROR',
      canRequestAds: false,
      gdprApplies: false,
    });

    // Return a safe default - assume we can't request personalized ads
    return {
      canRequestAds: false,
      isConsentFormAvailable: false,
      status: AdsConsentStatus.UNKNOWN,
    };
  }
};

/**
 * Request App Tracking Transparency permission (iOS only)
 * For non-EEA users, this shows the ATT dialog directly.
 * For EEA users with consent for purpose one, this also shows the ATT dialog.
 * Returns true if tracking is authorized
 */
export const requestATTPermission = async (): Promise<boolean> => {
  console.log('requestATTPermission called, platform:', Platform.OS);
  
  if (Platform.OS !== 'ios') {
    // ATT is iOS only, return true for other platforms
    return true;
  }

  try {
    // For non-EEA users, we can request ATT directly
    // For EEA users, we need to check if they consented to purpose one first
    let shouldRequestATT = true;
    
    try {
      const gdprApplies = await AdsConsent.getGdprApplies();
      console.log('ATT check - GDPR applies:', gdprApplies);
      
      if (gdprApplies) {
        // Check purpose consents - purpose one is "Store and/or access information on a device"
        const purposeConsents = await AdsConsent.getPurposeConsents();
        const hasConsentForPurposeOne = purposeConsents.startsWith('1');
        console.log('ATT check - purpose consents:', purposeConsents, 'has purpose one:', hasConsentForPurposeOne);
        
        if (!hasConsentForPurposeOne) {
          // User hasn't consented to purpose one, don't request ATT
          console.log('GDPR applies and no consent for purpose one, skipping ATT');
          shouldRequestATT = false;
        }
      }
    } catch (gdprError) {
      // If we can't determine GDPR status, still try to show ATT for non-EEA users
      console.log('Could not determine GDPR status, proceeding with ATT:', gdprError);
    }

    if (!shouldRequestATT) {
      return false;
    }

    // Request ATT permission - this shows the native iOS dialog
    console.log('Requesting ATT permission dialog...');
    const { status } = await requestTrackingPermissionsAsync();
    console.log('ATT permission status:', status);

    // Track ATT permission result
    trackATTPermissionResult(status);

    return status === 'granted';
  } catch (error) {
    console.error('Error requesting ATT permission:', error);
    trackATTPermissionResult('error');
    return false;
  }
};

/**
 * Initialize the Google Mobile Ads SDK with proper configuration
 * Should be called after consent is collected
 */
export const initializeAdsSDK = async (): Promise<boolean> => {
  if (!ADS_ENABLED) {
    console.log('Ads are disabled, skipping SDK initialization');
    return false;
  }

  if (isSDKInitialized) {
    console.log('Ads SDK already initialized');
    return true;
  }

  try {
    // Check if we can request ads
    const consentInfo = await AdsConsent.getConsentInfo();
    if (!consentInfo.canRequestAds) {
      console.log('Cannot request ads - no consent');
      return false;
    }

    console.log('Initializing Google Mobile Ads SDK...');

    // Configure ad request settings for COPPA compliance
    await mobileAds().setRequestConfiguration({
      tagForUnderAgeOfConsent: true,
      maxAdContentRating: MaxAdContentRating.G,
    });

    // Initialize the SDK
    await mobileAds().initialize();

    isSDKInitialized = true;
    console.log('Google Mobile Ads SDK initialized successfully');

    // Track successful SDK initialization
    trackAdsSdkInitialized(true);

    // Preload interstitial ad
    preloadInterstitialAd();

    return true;
  } catch (error) {
    console.error('Failed to initialize Google Mobile Ads SDK:', error);
    trackAdsSdkInitialized(false);
    return false;
  }
};

/**
 * Complete consent flow for new users during onboarding
 * 1. Show GDPR consent form
 * 2. Request ATT permission (iOS only)
 * 3. Initialize ads SDK
 */
export const completeConsentFlow = async (): Promise<{
  gdprConsent: boolean;
  attConsent: boolean;
  sdkInitialized: boolean;
}> => {
  console.log('Starting consent flow...');

  // Step 1: GDPR Consent
  const gdprResult = await requestGDPRConsent();
  const gdprConsent = gdprResult.canRequestAds;
  console.log('GDPR consent result:', gdprResult.status, 'canRequestAds:', gdprConsent);

  // Step 2: ATT Permission (iOS only)
  const attConsent = await requestATTPermission();
  console.log('ATT consent result:', attConsent);

  // Step 3: Initialize SDK if we can request ads
  let sdkInitialized = false;
  if (gdprConsent) {
    sdkInitialized = await initializeAdsSDK();
  }

  console.log('Consent flow complete:', { gdprConsent, attConsent, sdkInitialized });

  return {
    gdprConsent,
    attConsent,
    sdkInitialized,
  };
};

/**
 * Check if SDK is already initialized
 */
export const isAdsSDKInitialized = (): boolean => {
  return isSDKInitialized;
};

/**
 * For returning users - gather consent using stored data or show form if needed
 * This is used on app startup for users who already completed onboarding
 */
export const initializeAdsForReturningUser = async (): Promise<boolean> => {
  if (!ADS_ENABLED) {
    return false;
  }

  try {
    // Gather consent - this uses stored consent or shows form if needed
    const consentInfo = await AdsConsent.gatherConsent();

    if (!consentInfo.canRequestAds || isSDKInitialized) {
      return isSDKInitialized;
    }

    return await initializeAdsSDK();
  } catch (error) {
    console.error('Failed to initialize ads for returning user:', error);
    return false;
  }
};
