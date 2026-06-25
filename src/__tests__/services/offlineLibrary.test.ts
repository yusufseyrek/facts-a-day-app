/**
 * offlineLibrary — the premium offline download feature.
 *
 * Focused on the parts that encode the product rule ("max 2000: up to 1000
 * newest + 1000 oldest") and the persisted size setting. The download/sync flow
 * itself is integration-heavy (SQLite + feed paging + file I/O) and exercised in
 * the app; here we lock down the pure math and the clamped setting.
 */

// expo-sqlite can't run in Node; openDatabase() only needs the connection shape.
jest.mock('expo-sqlite', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  };
  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
    __mockDb: mockDb,
  };
});

import { OFFLINE_LIBRARY, STORAGE_KEYS } from '../../config/app';
import {
  computeSideTargets,
  getOfflineIndexVersion,
  getOfflineLimit,
  invalidateOfflineIndex,
  isFactSavedOfflineSync,
  setOfflineLimit,
  subscribeOfflineIndex,
} from '../../services/offlineLibrary';

const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default;

describe('offlineLibrary — computeSideTargets', () => {
  it('splits the maximum into 1000 newest + 1000 oldest', () => {
    expect(computeSideTargets(2000)).toEqual({ newest: 1000, oldest: 1000 });
  });

  it('never exceeds the per-side cap even past the max', () => {
    const { newest, oldest } = computeSideTargets(999999);
    expect(newest).toBeLessThanOrEqual(OFFLINE_LIBRARY.MAX_PER_SIDE);
    expect(oldest).toBeLessThanOrEqual(OFFLINE_LIBRARY.MAX_PER_SIDE);
    expect(newest + oldest).toBeLessThanOrEqual(OFFLINE_LIBRARY.MAX_FACTS);
  });

  it('splits smaller sizes in half', () => {
    expect(computeSideTargets(1000)).toEqual({ newest: 500, oldest: 500 });
    expect(computeSideTargets(500)).toEqual({ newest: 250, oldest: 250 });
    expect(computeSideTargets(100)).toEqual({ newest: 50, oldest: 50 });
  });

  it('gives the odd fact to the newest side and never goes negative', () => {
    expect(computeSideTargets(1)).toEqual({ newest: 1, oldest: 0 });
    expect(computeSideTargets(0)).toEqual({ newest: 0, oldest: 0 });
    expect(computeSideTargets(-50)).toEqual({ newest: 0, oldest: 0 });
  });
});

describe('offlineLibrary — size setting', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
    store = {};
    AsyncStorage.getItem.mockImplementation(async (k: string) => store[k] ?? null);
    AsyncStorage.setItem.mockImplementation(async (k: string, v: string) => {
      store[k] = v;
    });
  });

  it('returns 0 when nothing is stored', async () => {
    expect(await getOfflineLimit()).toBe(0);
  });

  it('persists and reads back a chosen size', async () => {
    await setOfflineLimit(500);
    expect(store[STORAGE_KEYS.OFFLINE_CACHE_LIMIT]).toBe('500');
    expect(await getOfflineLimit()).toBe(500);
  });

  it('clamps a stored value above the max down to the max', async () => {
    store[STORAGE_KEYS.OFFLINE_CACHE_LIMIT] = '9999';
    expect(await getOfflineLimit()).toBe(OFFLINE_LIBRARY.MAX_FACTS);
  });

  it('clamps on write too', async () => {
    await setOfflineLimit(9999);
    expect(store[STORAGE_KEYS.OFFLINE_CACHE_LIMIT]).toBe(String(OFFLINE_LIBRARY.MAX_FACTS));
  });

  it('treats a negative/garbage stored value as off', async () => {
    store[STORAGE_KEYS.OFFLINE_CACHE_LIMIT] = '-5';
    expect(await getOfflineLimit()).toBe(0);
    store[STORAGE_KEYS.OFFLINE_CACHE_LIMIT] = 'abc';
    expect(await getOfflineLimit()).toBe(0);
  });
});

describe('offlineLibrary — index change notifications', () => {
  it('reports a fact as not-saved until the index is populated', () => {
    // No index loaded in this unit context → the sync resolver answers false,
    // which is what the card badge relies on before warmup.
    expect(isFactSavedOfflineSync(123)).toBe(false);
  });

  it('bumps the version and notifies subscribers when the index changes', () => {
    const before = getOfflineIndexVersion();
    const listener = jest.fn();
    const unsubscribe = subscribeOfflineIndex(listener);

    invalidateOfflineIndex();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getOfflineIndexVersion()).toBe(before + 1);

    unsubscribe();
    invalidateOfflineIndex();
    // Still detached → no further calls after unsubscribe.
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
