import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import * as api from '../../services/api';
import { getStableDeviceId } from '../../services/deviceBinding';
import { bootstrapIdentityRecovery, claimScreenName } from '../../services/user';
import { __resetIdentityCache, getIdentity, saveIdentity } from '../../services/userIdentity';

/**
 * Reinstall recovery: on cold start the app re-binds a reinstalled device to
 * its anonymous account (Android device binding) so the user keeps their screen
 * name. iOS restores from the Keychain (userIdentity) and never recovers here.
 */

jest.mock('../../services/api', () => ({
  createUser: jest.fn(),
  recoverUser: jest.fn(),
  bindDevice: jest.fn(async () => {}),
}));
jest.mock('../../services/deviceBinding', () => ({
  getStableDeviceId: jest.fn(),
}));
jest.mock('../../services/notifications', () => ({
  registerForPush: jest.fn(async () => true),
}));
jest.mock('../../services/triviaSync', () => ({
  syncTriviaResults: jest.fn(async () => {}),
}));
jest.mock('../../services/analytics', () => ({
  trackScreenNameClaimed: jest.fn(),
  trackAccountDeleted: jest.fn(),
}));

const mockDeviceId = getStableDeviceId as jest.Mock;
const mockRecover = api.recoverUser as jest.Mock;
const mockBind = api.bindDevice as jest.Mock;
const mockCreate = api.createUser as jest.Mock;

const ANDROID_SSAID = 'android-ssaid-abcdef123456';

const store = new Map<string, string>();
const secureStore = new Map<string, string>();

function backStores() {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) =>
    store.has(k) ? store.get(k)! : null
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
    store.set(k, v);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (k: string) => {
    store.delete(k);
  });
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (k: string) =>
    secureStore.has(k) ? secureStore.get(k)! : null
  );
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (k: string, v: string) => {
    secureStore.set(k, v);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (k: string) => {
    secureStore.delete(k);
  });
}

describe('bootstrapIdentityRecovery', () => {
  beforeEach(() => {
    store.clear();
    secureStore.clear();
    jest.clearAllMocks();
    backStores();
    __resetIdentityCache();
  });

  it('does nothing on iOS / when no stable device id is available', async () => {
    mockDeviceId.mockResolvedValue(null);

    await bootstrapIdentityRecovery();

    expect(mockRecover).not.toHaveBeenCalled();
    expect(mockBind).not.toHaveBeenCalled();
    expect(await getIdentity()).toBeNull();
  });

  it('restores a lost identity from the server after a reinstall', async () => {
    mockDeviceId.mockResolvedValue(ANDROID_SSAID);
    mockRecover.mockResolvedValue({
      user_id: 'uuid-recovered',
      user_secret: 'fresh-secret',
      screen_name: 'CuriousMind',
      country_code: 'TR',
    });

    await bootstrapIdentityRecovery();

    expect(mockRecover).toHaveBeenCalledWith(ANDROID_SSAID);
    const restored = await getIdentity();
    expect(restored?.screenName).toBe('CuriousMind');
    expect(restored?.userKey).toBe('fresh-secret');
    // Binding is refreshed so future reinstalls keep working.
    expect(mockBind).toHaveBeenCalledWith(ANDROID_SSAID);
  });

  it('stays anonymous when no account is bound to the device', async () => {
    mockDeviceId.mockResolvedValue(ANDROID_SSAID);
    mockRecover.mockResolvedValue(null); // 404 NO_BINDING → null

    await bootstrapIdentityRecovery();

    expect(await getIdentity()).toBeNull();
    expect(mockBind).not.toHaveBeenCalled();
  });

  it('skips recovery but refreshes the binding when an identity already exists', async () => {
    await saveIdentity({
      userId: 'uuid-1',
      userKey: 'secret-1',
      screenName: 'AlreadyHere',
      countryCode: 'TR',
    });
    mockDeviceId.mockResolvedValue(ANDROID_SSAID);

    await bootstrapIdentityRecovery();

    expect(mockRecover).not.toHaveBeenCalled();
    expect(mockBind).toHaveBeenCalledWith(ANDROID_SSAID);
  });

  it('survives an offline recover attempt (stays anonymous, no throw)', async () => {
    mockDeviceId.mockResolvedValue(ANDROID_SSAID);
    mockRecover.mockRejectedValue(new Error('network down'));

    await expect(bootstrapIdentityRecovery()).resolves.toBeUndefined();
    expect(await getIdentity()).toBeNull();
    expect(mockBind).not.toHaveBeenCalled();
  });
});

describe('claimScreenName binds the device', () => {
  beforeEach(() => {
    store.clear();
    secureStore.clear();
    jest.clearAllMocks();
    backStores();
    __resetIdentityCache();
  });

  it('passes the stable device id to createUser so the claim is recoverable', async () => {
    mockDeviceId.mockResolvedValue(ANDROID_SSAID);
    mockCreate.mockResolvedValue({
      user_id: 'uuid-new',
      user_secret: 'secret-new',
      screen_name: 'Newcomer',
      country_code: 'TR',
    });

    await claimScreenName('Newcomer', 'en', 'settings');

    expect(mockCreate).toHaveBeenCalledWith('Newcomer', expect.anything(), ANDROID_SSAID);
    expect((await getIdentity())?.screenName).toBe('Newcomer');
  });
});
