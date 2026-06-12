import { getCalendars, getLocales } from 'expo-localization';

import { countryForTimeZone } from '../utils/timezoneCountry';

import * as api from './api';
import * as notificationService from './notifications';
import { getIdentity, saveIdentity, type UserIdentity } from './userIdentity';

import type { SupportedLocale } from '../i18n/translations';

/**
 * Screen-name lifecycle on top of the identity store: claim once (mints the
 * backend identity), rename later, and keep the device token linked so admin
 * replies to this user's reports can reach this device.
 */

/** Mirrors the backend rule — validate before the round-trip. */
export const SCREEN_NAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export class ScreenNameTakenError extends Error {
  constructor() {
    super('screen name taken');
    this.name = 'ScreenNameTakenError';
  }
}

function isTakenError(error: unknown): boolean {
  return (error as any)?.code === 'SCREEN_NAME_TAKEN' || (error as any)?.status === 409;
}

function localeRegionCode(): string | null {
  try {
    for (const locale of getLocales()) {
      const region = locale?.regionCode;
      if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
    }
  } catch {
    // fall through to null
  }
  return null;
}

function timeZoneCountryCode(): string | null {
  try {
    const timeZone =
      getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return countryForTimeZone(timeZone);
  } catch {
    return null;
  }
}

/**
 * Device country ("TR") for the profile flag.
 *
 * The clock's IANA time zone leads on BOTH platforms: locale regions lie
 * whenever languages pin their own region (Android's zh → "CN") or the
 * Language & Region setting carries test residue (iOS suffixes every
 * preferred language with the device region — en-CN, tr-CN — long after a
 * Chinese-content test session ended). The time zone tracks where the device
 * actually lives; locale region is only the fallback for unmapped zones
 * (Etc/UTC and friends).
 */
export function deviceCountryCode(): string | null {
  return timeZoneCountryCode() ?? localeRegionCode();
}

export async function getProfile(): Promise<UserIdentity | null> {
  return getIdentity();
}

/**
 * Claim `screenName`, persist the minted identity, and re-register push so the
 * device row gets linked to the new user. Throws ScreenNameTakenError on 409.
 */
export async function claimScreenName(
  screenName: string,
  locale: SupportedLocale
): Promise<UserIdentity> {
  const existing = await getIdentity();
  if (existing) return renameScreenName(screenName);

  let created: api.CreateUserResponse;
  try {
    created = await api.createUser(screenName, deviceCountryCode());
  } catch (error) {
    if (isTakenError(error)) throw new ScreenNameTakenError();
    throw error;
  }

  const identity: UserIdentity = {
    userId: created.user_id,
    userKey: created.user_secret,
    screenName: created.screen_name,
    countryCode: created.country_code,
  };
  await saveIdentity(identity);

  // Link this device to the fresh identity. Best-effort: the next foreground
  // re-register links it anyway, so a failure here must not fail the claim.
  notificationService.registerForPush(locale).catch(() => {});

  return identity;
}

// Once per launch is enough: the inputs (time zone, locales) only change with
// device settings, and the next cold start picks those up.
let countryRefreshed = false;

/**
 * Re-derive the device country and sync a stale stored value to the backend
 * (claim-time capture is otherwise permanent, so a wrong reading — e.g. "CN"
 * recorded while a Chinese language list was active — would stick forever).
 * Comments join the user row, so past comments' flags heal too. Best-effort.
 */
export async function refreshCountryIfStale(): Promise<void> {
  if (countryRefreshed) return;
  const identity = await getIdentity();
  if (!identity) return;
  countryRefreshed = true;

  const device = deviceCountryCode();
  if (!device || device === identity.countryCode) return;

  await api.updateUser({ country_code: device });
  await saveIdentity({ ...identity, countryCode: device });
}

/** Test hook: allow refreshCountryIfStale to run again. */
export function __resetCountryRefresh(): void {
  countryRefreshed = false;
}

/** Rename, keeping the same identity (devices/comments/reports follow). */
export async function renameScreenName(screenName: string): Promise<UserIdentity> {
  const identity = await getIdentity();
  if (!identity) throw new Error('no identity to rename');

  try {
    await api.updateUser({ screen_name: screenName });
  } catch (error) {
    if (isTakenError(error)) throw new ScreenNameTakenError();
    throw error;
  }

  const updated: UserIdentity = { ...identity, screenName };
  await saveIdentity(updated);
  return updated;
}
