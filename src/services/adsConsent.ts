import {
  AdsConsent,
  AdsConsentStatus,
} from 'react-native-google-mobile-ads';

/**
 * Check if user has consented to personalized ads
 * Uses getUserChoices() to inspect actual consent choices
 * See: https://docs.page/invertase/react-native-google-mobile-ads/european-user-consent#inspecting-consent-choices
 * Returns true if personalized ads can be shown
 */
export const canShowPersonalizedAds = async (): Promise<boolean> => {
  try {
    const consentInfo = await AdsConsent.getConsentInfo();

    // If we can't request ads at all, return false
    if (!consentInfo.canRequestAds) {
      return false;
    }

    // If consent is not required (e.g., user not in EEA), we can show personalized ads
    if (consentInfo.status === AdsConsentStatus.NOT_REQUIRED) {
      return true;
    }

    // Check if GDPR applies
    const gdprApplies = await AdsConsent.getGdprApplies();
    
    if (!gdprApplies) {
      // GDPR doesn't apply, we can show personalized ads
      return true;
    }

    // GDPR applies, check the user's actual choices
    const userChoices = await AdsConsent.getUserChoices();
    console.log('User consent choices:', userChoices);

    // Check if user has consented to personalized ads
    // selectPersonalisedAds is the key choice for showing personalized ads
    const canPersonalize = userChoices.selectPersonalisedAds === true;
    console.log('Can show personalized ads:', canPersonalize);

    return canPersonalize;
  } catch (error) {
    console.error('Error checking personalized ads consent:', error);
    // On error, default to non-personalized ads to be safe
    return false;
  }
};

/**
 * Get whether to request non-personalized ads only
 * This is the inverse of canShowPersonalizedAds for ad request options
 */
export const shouldRequestNonPersonalizedAdsOnly = async (): Promise<boolean> => {
  const canPersonalize = await canShowPersonalizedAds();
  return !canPersonalize;
};


