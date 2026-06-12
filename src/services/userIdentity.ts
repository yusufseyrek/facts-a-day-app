import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local store for the anonymous app-user identity minted by POST /api/users.
 *
 * The backend returns { user_id, user_secret } exactly once when a screen name
 * is claimed; we persist both and present them as X-User-Id / X-User-Key on
 * the requests that want identity (comments, reports, device registration,
 * profile updates). Losing this record means losing the name — there is no
 * recovery flow by design (no email/password), so this module is the single
 * writer of the key.
 *
 * Deliberately has NO api.ts import: api.ts reads identity headers from here,
 * so importing api back would be a cycle.
 */

const IDENTITY_KEY = '@user_identity';

export interface UserIdentity {
  userId: string;
  userKey: string;
  screenName: string;
  countryCode: string | null;
}

// In-memory cache so hot paths (every comment/report request) skip the
// AsyncStorage round-trip. `undefined` = not loaded yet, `null` = none stored.
let cached: UserIdentity | null | undefined;

export async function getIdentity(): Promise<UserIdentity | null> {
  if (cached !== undefined) return cached;
  try {
    const raw = await AsyncStorage.getItem(IDENTITY_KEY);
    cached = raw ? (JSON.parse(raw) as UserIdentity) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function saveIdentity(identity: UserIdentity): Promise<void> {
  cached = identity;
  await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
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
