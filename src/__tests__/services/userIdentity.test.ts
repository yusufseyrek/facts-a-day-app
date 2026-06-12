import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  __resetIdentityCache,
  clearIdentity,
  getIdentity,
  getIdentityHeaders,
  saveIdentity,
} from '../../services/userIdentity';

// The global setup mocks AsyncStorage as no-ops; back it with a real map so
// the persistence round-trip (save → cache reset → reload) is observable.
const store = new Map<string, string>();

describe('userIdentity', () => {
  beforeEach(() => {
    store.clear();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      store.has(key) ? store.get(key)! : null
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        store.set(key, value);
      }
    );
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
});
