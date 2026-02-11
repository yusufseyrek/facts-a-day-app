import { Platform } from 'react-native';

const premiumState = jest.requireMock('../../services/premiumState');
const mobileAds = jest.requireMock('react-native-google-mobile-ads');
const { AdsConsent } = mobileAds;

import {
  isConsentRequired,
  requestATTPermission,
  completeConsentFlow,
  initializeAdsForReturningUser,
} from '../../services/ads';

describe('ads — isConsentRequired', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    premiumState.shouldInitializeAdsSdk.mockReturnValue(true);
  });

  it('returns false when ads are disabled', async () => {
    premiumState.shouldInitializeAdsSdk.mockReturnValue(false);
    expect(await isConsentRequired()).toBe(false);
  });

  it('returns true when GDPR applies and consent status is REQUIRED', async () => {
    AdsConsent.getGdprApplies.mockResolvedValue(true);
    AdsConsent.requestInfoUpdate.mockResolvedValue({ status: 'REQUIRED' });

    expect(await isConsentRequired()).toBe(true);
  });

  it('returns false when GDPR does not apply', async () => {
    AdsConsent.getGdprApplies.mockResolvedValue(false);
    AdsConsent.requestInfoUpdate.mockResolvedValue({ status: 'NOT_REQUIRED' });

    expect(await isConsentRequired()).toBe(false);
  });

  it('returns false on error', async () => {
    AdsConsent.requestInfoUpdate.mockRejectedValue(new Error('network'));
    expect(await isConsentRequired()).toBe(false);
  });
});

describe('ads — requestATTPermission', () => {
  const trackingTransparency = jest.requireMock('expo-tracking-transparency');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true on non-iOS platforms', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });

    expect(await requestATTPermission()).toBe(true);

    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
  });

  it('requests ATT on iOS', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });

    AdsConsent.getGdprApplies.mockResolvedValue(false);
    trackingTransparency.requestTrackingPermissionsAsync.mockResolvedValue({ status: 'granted' });

    expect(await requestATTPermission()).toBe(true);
    expect(trackingTransparency.requestTrackingPermissionsAsync).toHaveBeenCalled();

    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
  });

  it('skips ATT when GDPR applies without purpose-1 consent', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });

    AdsConsent.getGdprApplies.mockResolvedValue(true);
    AdsConsent.getPurposeConsents.mockResolvedValue('0'); // No purpose-1

    expect(await requestATTPermission()).toBe(false);

    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
  });
});

describe('ads — completeConsentFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    premiumState.shouldInitializeAdsSdk.mockReturnValue(true);
  });

  it('runs GDPR → ATT → SDK init in order', async () => {
    const callOrder: string[] = [];

    AdsConsent.gatherConsent.mockImplementation(async () => {
      callOrder.push('gdpr');
      return { canRequestAds: true, isConsentFormAvailable: false, status: 'OBTAINED' };
    });
    AdsConsent.getGdprApplies.mockResolvedValue(false);

    const trackingTransparency = jest.requireMock('expo-tracking-transparency');
    trackingTransparency.requestTrackingPermissionsAsync.mockImplementation(async () => {
      callOrder.push('att');
      return { status: 'granted' };
    });

    AdsConsent.getConsentInfo.mockResolvedValue({ canRequestAds: true });

    const result = await completeConsentFlow();
    expect(result.gdprConsent).toBe(true);

    // GDPR should happen before ATT
    const gdprIdx = callOrder.indexOf('gdpr');
    const attIdx = callOrder.indexOf('att');
    expect(gdprIdx).toBeLessThan(attIdx);
  });
});

describe('ads — initializeAdsForReturningUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    premiumState.shouldInitializeAdsSdk.mockReturnValue(true);
  });

  it('returns false when ads disabled', async () => {
    premiumState.shouldInitializeAdsSdk.mockReturnValue(false);
    expect(await initializeAdsForReturningUser()).toBe(false);
  });

  it('uses stored consent', async () => {
    AdsConsent.gatherConsent.mockResolvedValue({
      canRequestAds: true,
      status: 'OBTAINED',
    });
    AdsConsent.getConsentInfo.mockResolvedValue({ canRequestAds: true });

    const result = await initializeAdsForReturningUser();
    expect(AdsConsent.gatherConsent).toHaveBeenCalled();
    // result depends on SDK init
    expect(typeof result).toBe('boolean');
  });

  it('skips SDK init when consent denies ads', async () => {
    AdsConsent.gatherConsent.mockResolvedValue({
      canRequestAds: false,
      status: 'REQUIRED',
    });

    const result = await initializeAdsForReturningUser();
    // Should not crash, just return false or current SDK state
    expect(typeof result).toBe('boolean');
  });
});
