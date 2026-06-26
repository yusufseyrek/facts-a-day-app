import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Local store for the anonymous app-user identity minted by POST /api/users.
 *
 * The backend returns { user_id, user_secret } exactly once when a screen name
 * is claimed; we persist both and present them as X-User-Id / X-User-Key on
 * the requests that want identity (comments, reports, device registration,
 * profile updates).
 *
 * Persistence is LAYERED so the identity survives an app uninstall/reinstall —
 * which previously locked a user out of their own screen name forever (the
 * orphaned backend row kept the name "taken" with no recovery path):
 *   - SecureStore (iOS Keychain) survives reinstall on iOS, so it's the durable
 *     copy there. On Android its storage is wiped on uninstall, so Android
 *     reinstall recovery is handled server-side via device binding (see
 *     services/user.ts → bootstrapIdentityRecovery), NOT by this module.
 *   - AsyncStorage is the legacy store and the universal fallback. A read that
 *     finds a value only in AsyncStorage migrates it up into SecureStore so it
 *     becomes Keychain-protected going forward.
 * We write BOTH on every change and read SecureStore first.
 *
 * Deliberately has NO api.ts import: api.ts reads identity headers from here,
 * so importing api back would be a cycle.
 */

const IDENTITY_KEY = '@user_identity'; // AsyncStorage key (legacy + fallback)
const SECURE_IDENTITY_KEY = 'user_identity'; // SecureStore key (alphanumeric/._- only)

// Keep the secret readable in the background (push re-register, trivia drain)
// without weakening reinstall survival — the accessibility class governs lock
// state and device-transfer, not uninstall survival.
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export interface UserIdentity {
  userId: string;
  userKey: string;
  screenName: string;
  countryCode: string | null;
}

// In-memory cache so hot paths (every comment/report request) skip the
// storage round-trip. `undefined` = not loaded yet, `null` = none stored.
let cached: UserIdentity | null | undefined;

// Listeners notified whenever the stored identity changes (claim, rename,
// clear). Every screen that shows the screen name keeps its own copy in local
// state; without this, a name set from one screen (e.g. a fact's comment
// section) leaves the others (Settings, leaderboard) showing a stale value.
type IdentityListener = (identity: UserIdentity | null) => void;
const identityListeners = new Set<IdentityListener>();

/** Subscribe to identity changes (claim/rename/clear). Returns an unsubscribe. */
export function onIdentityChange(listener: IdentityListener): () => void {
  identityListeners.add(listener);
  return () => {
    identityListeners.delete(listener);
  };
}

function emitIdentityChange(identity: UserIdentity | null): void {
  identityListeners.forEach((listener) => {
    try {
      listener(identity);
    } catch (error) {
      console.error('Error in identity change listener:', error);
    }
  });
}

/** Write the identity JSON to the Keychain. Best-effort: AsyncStorage still
 *  holds it, and on Android SecureStore isn't the durable copy anyway. */
async function writeSecure(json: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SECURE_IDENTITY_KEY, json, SECURE_OPTIONS);
  } catch {
    // ignore — Keychain unavailable is rare on iOS and non-fatal everywhere
  }
}

/** Read the identity, preferring SecureStore and migrating a legacy
 *  AsyncStorage-only value up into the Keychain. */
async function readStored(): Promise<UserIdentity | null> {
  try {
    const secure = await SecureStore.getItemAsync(SECURE_IDENTITY_KEY);
    if (secure) return JSON.parse(secure) as UserIdentity;
  } catch {
    // SecureStore unavailable / corrupt → fall back to AsyncStorage
  }
  try {
    const raw = await AsyncStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserIdentity;
    // Protect this legacy identity with the Keychain going forward (iOS).
    void writeSecure(raw);
    return parsed;
  } catch {
    return null;
  }
}

export async function getIdentity(): Promise<UserIdentity | null> {
  if (cached !== undefined) return cached;
  cached = await readStored();
  return cached;
}

export async function saveIdentity(identity: UserIdentity): Promise<void> {
  cached = identity;
  const json = JSON.stringify(identity);
  await Promise.all([writeSecure(json), AsyncStorage.setItem(IDENTITY_KEY, json)]);
  emitIdentityChange(identity);
}

/**
 * Forget the stored identity (the "reset onboarding" flow clears it for a
 * factory-fresh run; account deletion clears it after the server drops the
 * row). Clears both stores. Note: on Android the server-side device binding is
 * separate — deleting the account removes it; a local clear alone does not.
 */
export async function clearIdentity(): Promise<void> {
  cached = null;
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_IDENTITY_KEY).catch(() => {}),
    AsyncStorage.removeItem(IDENTITY_KEY),
  ]);
  emitIdentityChange(null);
}

/** Headers proving who we are, or {} when no name has been claimed yet. */
export async function getIdentityHeaders(): Promise<Record<string, string>> {
  const identity = await getIdentity();
  if (!identity) return {};
  return { 'X-User-Id': identity.userId, 'X-User-Key': identity.userKey };
}

/** Test hook: reset the in-memory cache so storage is re-read. */
export function __resetIdentityCache(): void {
  cached = undefined;
}
