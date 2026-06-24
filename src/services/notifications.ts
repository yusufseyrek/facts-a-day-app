import { Platform } from 'react-native';

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';

import { NOTIFICATION_SETTINGS } from '../config/app';
import { i18n } from '../i18n/config';

import { trackPushPermissionResult, trackPushRegisterResult } from './analytics';
import * as api from './api';
import * as database from './database';
import { getNotificationTimes, getSelectedCategories } from './onboarding';

import type { SupportedLocale } from '../i18n/translations';
import type { PushTrigger } from './analytics';

/**
 * Notifications are now SERVER-DRIVEN (Expo push). The app no longer schedules
 * local notifications on-device, downloads notification images ahead of time, or
 * keeps an OS↔DB schedule in sync — the backend pushes each device its daily
 * fact at the user's chosen local time (see registerForPush). What remains here
 * is: registering the push token + prefs, the foreground handler, a lightweight
 * preview builder for the settings screen, and cleanup of the now-obsolete
 * local notification image cache.
 */

// Legacy on-device notification image cache (no longer written; purged on cleanup).
const NOTIFICATION_IMAGES_DIR = `${FileSystem.documentDirectory}${NOTIFICATION_SETTINGS.IMAGES_DIR_NAME}`;

// ============================================================================
// NOTIFICATION CONFIGURATION (foreground presentation)
// ============================================================================

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ============================================================================
// SERVER-DRIVEN PUSH REGISTRATION
// ============================================================================

/**
 * Convert saved notification times (ISO strings from a local time picker) into
 * minutes-from-local-midnight, which is what the backend stores and matches
 * against each device's local time.
 */
function timesToPreferredMinutes(isoTimes: string[]): number[] {
  const minutes = new Set<number>();
  for (const iso of isoTimes) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) continue;
    minutes.add(d.getHours() * 60 + d.getMinutes());
  }
  return Array.from(minutes).sort((a, b) => a - b);
}

/**
 * Register this device for server-driven push: request permission, get the Expo
 * push token, and send it to the backend with the user's timezone, preferred
 * local times, locale, and category filter. Idempotent and best-effort — safe
 * to call on cold start, after onboarding, and whenever prefs change. Returns
 * false (without throwing) if permission is denied or no times are set.
 */
export async function registerForPush(
  locale: SupportedLocale,
  {
    trigger = 'foreground',
    promptIfUndetermined = false,
  }: { trigger?: PushTrigger; promptIfUndetermined?: boolean } = {}
): Promise<boolean> {
  try {
    if (!Device.isDevice) {
      trackPushRegisterResult({ success: false, reason: 'not_device', trigger });
      return false; // simulators can't get a push token
    }

    const { status } = await Notifications.getPermissionsAsync();
    const previouslyGranted = status === 'granted';
    let granted = previouslyGranted;
    // The resolved permission status: starts at the read value and updates to
    // the dialog result if we prompt. Lets the register-result below tell a
    // genuine denial apart from a passive caller that simply never asked.
    let finalStatus = status;
    // Prompt for permission ONLY when the caller explicitly opts in
    // (promptIfUndetermined) AND the OS would actually show a dialog (status
    // still 'undetermined'). registerForPush also runs passively on every
    // foreground, launch, language change, and at the end of onboarding — none
    // of those may pop the OS dialog unprompted, so they pass
    // promptIfUndetermined=false and just register when permission was ALREADY
    // granted. The dialog is reserved for explicit opt-in moments: the
    // onboarding notifications screen (which calls requestPermissionsAsync
    // directly) and the Settings time picker (which passes
    // promptIfUndetermined=true). This is what keeps onboarding "Maybe later" an
    // actual opt-out — the success screen no longer prompts the decliner — and
    // never silently re-asks on foreground. (Already-'denied' never shows a
    // dialog regardless: requestPermissionsAsync resolves immediately.)
    if (!granted && status === 'undetermined' && promptIfUndetermined) {
      const req = await Notifications.requestPermissionsAsync();
      finalStatus = req.status;
      granted = req.status === 'granted';
      trackPushPermissionResult({
        status: granted ? 'granted' : 'denied',
        trigger,
        previouslyGranted,
      });
    }
    if (!granted) {
      // 'undetermined' here means a passive caller never prompted — the user
      // hasn't decided, so it's not a denial. A real denial (read as 'denied',
      // or chosen in the dialog above) reports 'permission_denied'.
      trackPushRegisterResult({
        success: false,
        reason: finalStatus === 'undetermined' ? 'permission_undetermined' : 'permission_denied',
        trigger,
      });
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Daily facts',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const preferredMinutes = timesToPreferredMinutes(await getNotificationTimes());
    if (preferredMinutes.length === 0) {
      trackPushRegisterResult({ success: false, reason: 'no_times', trigger, timesCount: 0 });
      return false;
    }

    // Expo-managed token (NOT getDevicePushTokenAsync — the backend sends via
    // Expo's push service, which requires the ExponentPushToken[...] form).
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;
    if (!token) {
      trackPushRegisterResult({
        success: false,
        reason: 'no_token',
        trigger,
        timesCount: preferredMinutes.length,
      });
      return false;
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const categories = await getSelectedCategories();

    await api.registerPushToken({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      timezone,
      preferred_minutes: preferredMinutes,
      locale,
      categories: categories.length > 0 ? categories : undefined,
    });

    trackPushRegisterResult({
      success: true,
      reason: 'ok',
      trigger,
      timesCount: preferredMinutes.length,
    });
    return true;
  } catch (error) {
    if (__DEV__) console.warn('registerForPush failed:', error);
    trackPushRegisterResult({ success: false, reason: 'error', trigger });
    return false;
  }
}

/**
 * Fetch this device's Expo push token (the `ExponentPushToken[...]` form the
 * backend sends through). Returns null on a simulator or if permission/token
 * can't be obtained. Dev-only diagnostics use this to show/copy the token.
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return res.data ?? null;
  } catch {
    return null;
  }
}

/**
 * DEV/diagnostics: send a real push to THIS device through Expo's push service —
 * the exact transport the backend scheduler uses (Expo → APNs/FCM → device).
 *
 * Crucially this checks the push *receipt*, not just the ticket. The ticket
 * `status: ok` only means Expo accepted the message; the actual APNs/FCM
 * delivery result (and any error like DeviceNotRegistered or an APNs/.p8
 * credential problem) only shows up in the receipt a few seconds later. A push
 * that "says ok but never arrives" almost always has a failing receipt.
 */
export async function sendTestPushToSelf(factId?: number): Promise<{
  ok: boolean;
  detail: string;
  token?: string;
}> {
  const token = await getExpoPushToken();
  if (!token) {
    return {
      ok: false,
      detail: 'No push token (real device + granted permission required).',
    };
  }
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title: 'Fact of the day',
        body: 'Test push — full server pipeline',
        sound: 'default',
        badge: 1,
        data: factId ? { factId } : {},
      }),
    });
    const json = (await res.json()) as {
      data?: { status?: string; message?: string; id?: string };
      errors?: unknown;
    };
    const ticket = json?.data;
    if (ticket?.status !== 'ok') {
      return {
        ok: false,
        detail: ticket?.message || JSON.stringify(json?.errors || json),
        token,
      };
    }

    // Ticket accepted. Now confirm actual delivery via the receipt.
    const ticketId = ticket.id;
    if (!ticketId) {
      return { ok: true, detail: 'Expo accepted the push (no ticket id to verify).', token };
    }

    // Receipts aren't instant; give Expo→APNs a moment, then poll a few times.
    let lastDetail = 'Ticket accepted; receipt not ready yet.';
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const rcptRes = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [ticketId] }),
        });
        const rcptJson = (await rcptRes.json()) as {
          data?: Record<
            string,
            { status?: string; message?: string; details?: { error?: string } }
          >;
        };
        const receipt = rcptJson?.data?.[ticketId];
        if (!receipt) {
          lastDetail = 'Receipt not available yet (Expo still processing).';
          continue;
        }
        if (receipt.status === 'ok') {
          return { ok: true, detail: 'Delivered ✅ (APNs/FCM accepted the push).', token };
        }
        // Receipt error = the real reason it never arrived.
        const err = receipt.details?.error;
        return {
          ok: false,
          detail: `Receipt error: ${err || receipt.status}${
            receipt.message ? ` — ${receipt.message}` : ''
          }`,
          token,
        };
      } catch {
        lastDetail = 'Receipt fetch failed (network).';
      }
    }
    return { ok: false, detail: lastDetail, token };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'send failed', token };
  }
}

// ============================================================================
// NOTIFICATION PREVIEW (settings screen)
// ============================================================================

/**
 * Build a notification content object for the settings preview. Unlike the old
 * local scheduler, this does no image download — push image attachments are
 * handled server-side; the preview just needs the title/body/data.
 */
export async function buildNotificationContent(
  fact: database.FactWithRelations,
  locale: SupportedLocale = 'en'
): Promise<Notifications.NotificationContentInput> {
  const previousLocale = i18n.locale;
  i18n.locale = locale;
  const appName = i18n.t('appName');
  i18n.locale = previousLocale;

  const content: Notifications.NotificationContentInput = {
    title: appName,
    body: fact.title || fact.content.substring(0, 100),
    data: { factId: fact.id, ...(fact.image_url ? { imageUrl: fact.image_url } : {}) },
    badge: 1,
  };

  return content;
}

// ============================================================================
// LEGACY IMAGE CACHE CLEANUP
// ============================================================================

/**
 * Purge the legacy notification image cache. The app no longer schedules local
 * notifications, so every preloaded image is obsolete — delete the whole dir.
 * Returns the number of files removed.
 */
export async function cleanupOldNotificationImages(): Promise<number> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(NOTIFICATION_IMAGES_DIR);
    if (!dirInfo.exists) return 0;
    const files = await FileSystem.readDirectoryAsync(NOTIFICATION_IMAGES_DIR);
    for (const file of files) {
      await FileSystem.deleteAsync(`${NOTIFICATION_IMAGES_DIR}${file}`, { idempotent: true });
    }
    return files.length;
  } catch {
    return 0;
  }
}
