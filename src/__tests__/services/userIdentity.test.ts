import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import {
  __resetIdentityCache,
  clearIdentity,
  getIdentity,
  getIdentityHeaders,
  onIdentityChange,
  saveIdentity,
} from '../../services/userIdentity';

// The global setup mocks AsyncStorage + SecureStore as no-ops; back each with a
// real map so the persistence round-trip (save → cache reset → reload) and the
// SecureStore-first / migrate-up behaviour are observable.
const store = new Map<string, string>();
const secureStore = new Map<string, string>();

describe('userIdentity', () => {
  beforeEach(() => {
    store.clear();
    secureStore.clear();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      store.has(key) ? store.get(key)! : null
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        store.set(key, value);
      }
    );
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
      store.delete(key);
    });
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) =>
      secureStore.has(key) ? secureStore.get(key)! : null
    );
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        secureStore.set(key, value);
      }
    );
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      secureStore.delete(key);
    });
    __resetIdentityCache();
  });

  it('returns null and empty headers before a name is claimed', async () => {
    expect(await getIdentity()).toBeNull();
    expect(await getIdentityHeaders()).toEqual({});
  });

  it('persists the identity and serves the auth headers', async () => {
    await saveIdentity({
      userId: 'uuid-1',
      userKey: 'secret-1',
      screenName: 'CuriousMind',
      countryCode: 'TR',
    });

    expect(await getIdentityHeaders()).toEqual({
      'X-User-Id': 'uuid-1',
      'X-User-Key': 'secret-1',
    });

    // Survives a cache reset (i.e. a fresh app launch reading storage).
    __resetIdentityCache();
    const reloaded = await getIdentity();
    expect(reloaded?.screenName).toBe('CuriousMind');
    expect(reloaded?.countryCode).toBe('TR');
  });

  it('clearIdentity forgets the identity in cache and storage', async () => {
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
      store.delete(key);
    });
    await saveIdentity({
      userId: 'uuid-1',
      userKey: 'secret-1',
      screenName: 'CuriousMind',
      countryCode: 'TR',
    });

    await clearIdentity();

    expect(await getIdentity()).toBeNull();
    expect(await getIdentityHeaders()).toEqual({});
    // Storage is empty too, not just the in-memory cache.
    __resetIdentityCache();
    expect(await getIdentity()).toBeNull();
  });

  it('treats corrupted storage as no identity', async () => {
    store.set('@user_identity', 'not json');
    __resetIdentityCache();
    expect(await getIdentity()).toBeNull();
    expect(await getIdentityHeaders()).toEqual({});
  });

  it('notifies subscribers when the name is set and cleared (cross-screen sync)', async () => {
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
      store.delete(key);
    });
    const seen: (string | null)[] = [];
    const unsubscribe = onIdentityChange((identity) => seen.push(identity?.screenName ?? null));

    await saveIdentity({
      userId: 'uuid-1',
      userKey: 'secret-1',
      screenName: 'CuriousMind',
      countryCode: 'TR',
    });
    await clearIdentity();

    // A claim/rename emits the new name; clearing emits null. This is what keeps
    // Settings/comments/leaderboard from showing a stale name set elsewhere.
    expect(seen).toEqual(['CuriousMind', null]);

    // Unsubscribed listeners stop receiving updates.
    unsubscribe();
    await saveIdentity({
      userId: 'uuid-2',
      userKey: 'secret-2',
      screenName: 'Renamed',
      countryCode: 'TR',
    });
    expect(seen).toEqual(['CuriousMind', null]);
  });

  // ── SecureStore (iOS Keychain) durability layer ──

  it('writes the identity to the Keychain so it survives a reinstall (iOS)', async () => {
    await saveIdentity({
      userId: 'uuid-1',
      userKey: 'secret-1',
      screenName: 'CuriousMind',
      countryCode: 'TR',
    });

    // The durable copy lives in SecureStore (the Keychain on iOS), not only in
    // AsyncStorage which is wiped on uninstall.
    expect(secureStore.get('user_identity')).toContain('secret-1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'user_identity',
      expect.stringContaining('secret-1'),
      expect.objectContaining({ keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK })
    );

    // Simulate a reinstall: AsyncStorage is gone, only the Keychain remains.
    store.clear();
    __resetIdentityCache();
    expect((await getIdentity())?.screenName).toBe('CuriousMind');
  });

  it('prefers the Keychain copy over a stale AsyncStorage copy', async () => {
    secureStore.set(
      'user_identity',
      JSON.stringify({
        userId: 'uuid-secure',
        userKey: 'secure-key',
        screenName: 'FromKeychain',
        countryCode: 'TR',
      })
    );
    store.set(
      '@user_identity',
      JSON.stringify({
        userId: 'uuid-async',
        userKey: 'async-key',
        screenName: 'FromAsyncStorage',
        countryCode: 'TR',
      })
    );
    __resetIdentityCache();

    expect((await getIdentity())?.screenName).toBe('FromKeychain');
  });

  it('migrates a legacy AsyncStorage-only identity up into the Keychain', async () => {
    // A pre-SecureStore install: identity only in AsyncStorage, Keychain empty.
    store.set(
      '@user_identity',
      JSON.stringify({
        userId: 'uuid-legacy',
        userKey: 'legacy-key',
        screenName: 'LegacyUser',
        countryCode: 'TR',
      })
    );
    __resetIdentityCache();

    expect((await getIdentity())?.screenName).toBe('LegacyUser');

    // Reading it copied it into the Keychain so it's protected going forward.
    expect(secureStore.get('user_identity')).toContain('legacy-key');
  });
});
