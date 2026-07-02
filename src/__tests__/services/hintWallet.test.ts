import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import {
  __resetHintWalletCache,
  creditHints,
  devGrantHints,
  getHintBalance,
  onHintBalanceChange,
  spendPurchasedHint,
} from '../../services/hintWallet';

// The global setup mocks AsyncStorage + SecureStore as no-ops; back each with a
// real map so persistence round-trips (credit → cache reset → reload) and the
// SecureStore-first / migrate-up behaviour are observable (same rig as the
// userIdentity tests).
const store = new Map<string, string>();
const secureStore = new Map<string, string>();

describe('hintWallet', () => {
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
    __resetHintWalletCache();
  });

  it('starts with a zero balance', async () => {
    expect(await getHintBalance()).toBe(0);
  });

  it('credits hints and persists across a cache reset (fresh launch)', async () => {
    expect(await creditHints(10, 'txn-1')).toBe(true);
    expect(await getHintBalance()).toBe(10);

    __resetHintWalletCache();
    expect(await getHintBalance()).toBe(10);

    // Both layers hold the wallet (SecureStore is the reinstall-durable copy).
    expect(secureStore.get('hint_wallet')).toBeDefined();
    expect(store.get('@hint_wallet')).toBeDefined();
  });

  it('is idempotent per transaction id (store redelivery double-fires)', async () => {
    expect(await creditHints(50, 'txn-dup')).toBe(true);
    expect(await creditHints(50, 'txn-dup')).toBe(false);
    expect(await getHintBalance()).toBe(50);

    // Redelivery after a relaunch (cache reset) is also a no-op.
    __resetHintWalletCache();
    expect(await creditHints(50, 'txn-dup')).toBe(false);
    expect(await getHintBalance()).toBe(50);
  });

  it('rejects credits without a transaction id or a positive count', async () => {
    expect(await creditHints(10, '')).toBe(false);
    expect(await creditHints(0, 'txn-zero')).toBe(false);
    expect(await creditHints(-5, 'txn-neg')).toBe(false);
    expect(await getHintBalance()).toBe(0);
  });

  it('spends one hint at a time and refuses at zero', async () => {
    await creditHints(2, 'txn-2');

    expect(await spendPurchasedHint()).toBe(true);
    expect(await spendPurchasedHint()).toBe(true);
    expect(await getHintBalance()).toBe(0);
    expect(await spendPurchasedHint()).toBe(false);
    expect(await getHintBalance()).toBe(0);
  });

  it('serializes concurrent mutations (no lost updates)', async () => {
    const results = await Promise.all([
      creditHints(1, 'txn-a'),
      creditHints(2, 'txn-b'),
      creditHints(3, 'txn-c'),
    ]);
    expect(results).toEqual([true, true, true]);
    expect(await getHintBalance()).toBe(6);
  });

  it('caps the remembered transaction ids at 20 (oldest evicted)', async () => {
    for (let i = 1; i <= 21; i++) {
      expect(await creditHints(1, `txn-${i}`)).toBe(true);
    }
    // txn-1 was evicted from the dedup window, so it credits again; a recent
    // txn is still remembered and stays blocked.
    expect(await creditHints(1, 'txn-1')).toBe(true);
    expect(await creditHints(1, 'txn-21')).toBe(false);
    expect(await getHintBalance()).toBe(22);
  });

  it('migrates an AsyncStorage-only wallet up into SecureStore', async () => {
    store.set('@hint_wallet', JSON.stringify({ balance: 7, txns: ['txn-legacy'] }));

    expect(await getHintBalance()).toBe(7);
    // Wait a tick: the migrate-up write is fire-and-forget.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(secureStore.get('hint_wallet')).toContain('"balance":7');
  });

  it('sanitizes corrupt or malformed stored wallets to empty', async () => {
    secureStore.set('hint_wallet', 'not-json{');
    store.set('@hint_wallet', JSON.stringify({ balance: 'NaN-ish', txns: 'nope' }));
    expect(await getHintBalance()).toBe(0);

    __resetHintWalletCache();
    secureStore.clear();
    store.set('@hint_wallet', JSON.stringify({ balance: -12, txns: [3, 'ok'] }));
    expect(await getHintBalance()).toBe(0);
    expect(await creditHints(1, 'ok')).toBe(false); // string txns survive sanitize
  });

  it('notifies balance listeners on credit and spend', async () => {
    const seen: number[] = [];
    const unsubscribe = onHintBalanceChange((balance) => seen.push(balance));

    await creditHints(3, 'txn-listen');
    await spendPurchasedHint();
    unsubscribe();
    await spendPurchasedHint();

    expect(seen).toEqual([3, 2]);
  });

  it('devGrantHints credits without a transaction id (dev-only path)', async () => {
    await devGrantHints(10);
    expect(await getHintBalance()).toBe(10);
  });
});
