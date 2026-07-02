import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Local wallet for PURCHASED trivia hints (consumable IAP). Purchased hints
 * never expire and sit on top of the free daily quota in services/trivia.ts.
 *
 * Persistence is LAYERED like the user identity (services/userIdentity.ts):
 *   - SecureStore (iOS Keychain) survives reinstall on iOS, so a paid balance
 *     isn't wiped by a reinstall there. On Android SecureStore is cleared on
 *     uninstall — a lost balance is the accepted consumable trade-off.
 *   - AsyncStorage is the universal fallback; both stores are written on every
 *     change and SecureStore is read first.
 *
 * Crediting is IDEMPOTENT per store transaction id: expo-iap redelivers
 * unfinished purchases through purchaseUpdatedListener on the next launch, so
 * the listener credits BEFORE finishing the transaction and relies on the
 * txn-id dedup here to make any redelivery a no-op.
 */

const WALLET_KEY = '@hint_wallet'; // AsyncStorage key
const SECURE_WALLET_KEY = 'hint_wallet'; // SecureStore key (alphanumeric/._- only)

/** How many processed transaction ids to remember for dedup. */
const MAX_TXN_IDS = 20;

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

interface HintWallet {
  balance: number;
  /** Most recent store transaction ids already credited (newest last). */
  txns: string[];
}

const EMPTY_WALLET: HintWallet = { balance: 0, txns: [] };

// In-memory cache so the game screen's per-question reads skip the storage
// round-trip. `undefined` = not loaded yet.
let cached: HintWallet | undefined;

// Serialize read-modify-write mutations so two credits (or a credit and a
// spend) landing together can't clobber each other's write.
let opQueue: Promise<unknown> = Promise.resolve();

type BalanceListener = (balance: number) => void;
const balanceListeners = new Set<BalanceListener>();

/** Subscribe to balance changes (credit/spend). Returns an unsubscribe. */
export function onHintBalanceChange(listener: BalanceListener): () => void {
  balanceListeners.add(listener);
  return () => {
    balanceListeners.delete(listener);
  };
}

function emitBalanceChange(balance: number): void {
  balanceListeners.forEach((listener) => {
    try {
      listener(balance);
    } catch (error) {
      console.error('Error in hint balance listener:', error);
    }
  });
}

function sanitize(wallet: unknown): HintWallet {
  if (!wallet || typeof wallet !== 'object') return { ...EMPTY_WALLET };
  const raw = wallet as Partial<HintWallet>;
  const balance =
    typeof raw.balance === 'number' && Number.isFinite(raw.balance)
      ? Math.max(0, Math.floor(raw.balance))
      : 0;
  const txns = Array.isArray(raw.txns) ? raw.txns.filter((t) => typeof t === 'string') : [];
  return { balance, txns };
}

/** Best-effort Keychain write; AsyncStorage still holds the value. */
async function writeSecure(json: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SECURE_WALLET_KEY, json, SECURE_OPTIONS);
  } catch {
    // Keychain unavailable is rare on iOS and non-fatal everywhere
  }
}

/** Read the wallet, preferring SecureStore and migrating an AsyncStorage-only
 *  value up into the Keychain (mirrors userIdentity.ts). */
async function readStored(): Promise<HintWallet> {
  try {
    const secure = await SecureStore.getItemAsync(SECURE_WALLET_KEY);
    if (secure) return sanitize(JSON.parse(secure));
  } catch {
    // SecureStore unavailable / corrupt → fall back to AsyncStorage
  }
  try {
    const raw = await AsyncStorage.getItem(WALLET_KEY);
    if (!raw) return { ...EMPTY_WALLET };
    const parsed = sanitize(JSON.parse(raw));
    void writeSecure(JSON.stringify(parsed));
    return parsed;
  } catch {
    return { ...EMPTY_WALLET };
  }
}

async function getWallet(): Promise<HintWallet> {
  if (cached !== undefined) return cached;
  cached = await readStored();
  return cached;
}

async function saveWallet(wallet: HintWallet): Promise<void> {
  cached = wallet;
  const json = JSON.stringify(wallet);
  await Promise.all([writeSecure(json), AsyncStorage.setItem(WALLET_KEY, json)]);
  emitBalanceChange(wallet.balance);
}

/** Run a wallet mutation exclusively; returns the mutation's result. */
function withWallet<T>(mutate: (wallet: HintWallet) => Promise<T>): Promise<T> {
  const run = opQueue.then(async () => mutate(await getWallet()));
  // Keep the queue alive even when a mutation rejects.
  opQueue = run.catch(() => {});
  return run;
}

/** Current purchased-hint balance. */
export async function getHintBalance(): Promise<number> {
  return (await getWallet()).balance;
}

/**
 * Credit hints for a store purchase. Idempotent per transactionId: a
 * redelivered purchase (crash between credit and finishTransaction, or a
 * duplicate listener fire) resolves false and changes nothing.
 */
export async function creditHints(count: number, transactionId: string): Promise<boolean> {
  if (!Number.isFinite(count) || count <= 0 || !transactionId) return false;
  return withWallet(async (wallet) => {
    if (wallet.txns.includes(transactionId)) return false;
    await saveWallet({
      balance: wallet.balance + Math.floor(count),
      txns: [...wallet.txns, transactionId].slice(-MAX_TXN_IDS),
    });
    return true;
  });
}

/**
 * Spend one purchased hint. Resolves false (and changes nothing) when the
 * balance is already zero.
 */
export async function spendPurchasedHint(): Promise<boolean> {
  return withWallet(async (wallet) => {
    if (wallet.balance <= 0) return false;
    await saveWallet({ ...wallet, balance: wallet.balance - 1 });
    return true;
  });
}

/** Dev-only grant so the flow is testable without a store (mirrors devSetPremium). */
export async function devGrantHints(count: number): Promise<void> {
  if (!__DEV__) return;
  await withWallet(async (wallet) => {
    await saveWallet({ ...wallet, balance: wallet.balance + Math.max(0, Math.floor(count)) });
  });
}

/** Test hook: reset the in-memory cache so storage is re-read. */
export function __resetHintWalletCache(): void {
  cached = undefined;
  opQueue = Promise.resolve();
}
