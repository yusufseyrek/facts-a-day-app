import { ADS_ENABLED } from '../config/app';

let _isPremium = false;

export const setIsPremium = (value: boolean): void => {
  _isPremium = value;
};

export const getIsPremium = (): boolean => _isPremium;

/** Returns true if ads should be shown (user is not premium and ads are enabled) */
export const shouldShowAds = (): boolean => !_isPremium && ADS_ENABLED;

/** Returns true if the ad SDK should be initialized (for all users when ads are enabled) */
export const shouldInitializeAdsSdk = (): boolean => ADS_ENABLED;

/** Returns true if rewarded ads can be shown (for all users when ads are enabled, including premium) */
export const canShowRewardedAds = (): boolean => ADS_ENABLED;
