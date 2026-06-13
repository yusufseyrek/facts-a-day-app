import { dehydrate, hydrate } from '@tanstack/react-query';
import * as BackgroundTask from 'expo-background-task';
import * as Localization from 'expo-localization';
import * as TaskManager from 'expo-task-manager';

import { asyncStoragePersister, queryClient } from '../config/queryClient';
import { homeFeedQueryOptions } from '../hooks/useHomeFeedData';
import { getLocaleFromCode } from '../i18n/config';

import { API_BASE_URL } from './api';
import { precacheFeedImages } from './images';

/**
 * Background feed refresh: while the app is closed the OS opportunistically runs
 * this task to warm the home feed's React Query cache (persisted to disk) and
 * pre-cache its images, so the NEXT open — even with no connectivity — has fresh
 * content with images. Pairs with the foreground precache in useHomeFeedData.
 *
 * iOS schedules background work opportunistically (battery, usage patterns), so
 * `minimumInterval` is a floor, not a guarantee. Requires a native build
 * (expo-background-task config plugin in app.json).
 */
export const BACKGROUND_FEED_TASK = 'background-feed-fetch';

/** Target cadence in MINUTES (OS-throttled; treated as a lower bound). */
const MINIMUM_INTERVAL_MINUTES = 60;

function deviceLocale(): string {
  try {
    return getLocaleFromCode(Localization.getLocales()[0]?.languageCode || 'en');
  } catch {
    return 'en';
  }
}

// Roots persisted to disk — must mirror app/_layout.tsx's
// PersistQueryClientProvider dehydrateOptions so we write back the same shape.
const PERSISTED_ROOTS = ['facts', 'home', 'metadata'];

// Defined at module load so the OS can invoke it after a cold start (the task
// must already be registered in JS when the headless runtime spins up).
TaskManager.defineTask(BACKGROUND_FEED_TASK, async () => {
  try {
    const locale = deviceLocale();

    // The headless runtime starts with an EMPTY queryClient and no persister
    // subscription. Hydrate the on-disk cache first so we extend it instead of
    // clobbering it, refresh the feed's first page (same query the home screen
    // reads), pre-cache its images, then write the cache back — so the next
    // open hydrates this fresh, image-ready page even with no connectivity.
    const restored = await asyncStoragePersister.restoreClient();
    if (restored?.clientState) hydrate(queryClient, restored.clientState);

    const data = await queryClient.fetchInfiniteQuery({
      ...homeFeedQueryOptions(locale),
      pages: 1,
    });
    // Raw API page facts already carry { id, image_url } — no DB mapping needed
    // (keeps this headless-safe by not importing the SQLite layer).
    const facts = (data?.pages ?? []).flatMap((p) => p.facts);
    await precacheFeedImages(facts);

    await asyncStoragePersister.persistClient({
      buster: API_BASE_URL,
      timestamp: Date.now(),
      clientState: dehydrate(queryClient, {
        shouldDehydrateQuery: (q) =>
          q.state.status === 'success' && PERSISTED_ROOTS.includes(q.queryKey[0] as string),
      }),
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Register the periodic feed refresh. Safe to call repeatedly (no-ops if
 * already registered or if the OS restricts background work). */
export async function registerBackgroundFeedFetch(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_FEED_TASK)) return;
    await BackgroundTask.registerTaskAsync(BACKGROUND_FEED_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MINUTES,
    });
  } catch {
    // Best-effort enhancement — never block startup on it.
  }
}
