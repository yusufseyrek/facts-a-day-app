import { dehydrate, hydrate } from '@tanstack/react-query';
import * as Localization from 'expo-localization';

import { asyncStoragePersister, queryClient } from '../config/queryClient';
import { homeFeedQueryOptions } from '../hooks/useHomeFeedData';
import { getLocaleFromCode } from '../i18n/config';

import { API_BASE_URL } from './api';
import { precacheFeedImages } from './images';
import { pushWidgetFacts } from './widgetData';

// expo-background-task / expo-task-manager both bind to the ExpoTaskManager
// native module via requireNativeModule(), which THROWS at module-evaluation
// time on a binary that predates these plugins (e.g. a dev client built before
// they were added). A static `import` lets that throw escape this file and
// crash every screen that transitively imports it (app/_layout.tsx → "missing
// default export" → white screen). Load them lazily inside try/catch so a
// stale/older binary degrades to a clean no-op — which is exactly what the
// registration path below already assumes ("no-op until the next native
// build"). Pure-JS change: Metro fast-refreshes it with no rebuild; the feature
// itself only lights up once a native build includes the module.
type BackgroundTaskModule = typeof import('expo-background-task');
type TaskManagerModule = typeof import('expo-task-manager');

let BackgroundTask: BackgroundTaskModule | null = null;
let TaskManager: TaskManagerModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bg = require('expo-background-task') as BackgroundTaskModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tm = require('expo-task-manager') as TaskManagerModule;
  BackgroundTask = bg;
  TaskManager = tm;
} catch {
  // Native module absent — leave both null so every entry point below no-ops.
}

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
// must already be registered in JS when the headless runtime spins up). Guarded
// on the native modules: on a binary without ExpoTaskManager they're null, and
// defineTask would throw and take down the import (see note above).
if (TaskManager && BackgroundTask) {
  const taskManager = TaskManager;
  const backgroundTask = BackgroundTask;
  taskManager.defineTask(BACKGROUND_FEED_TASK, async () => {
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

      // Mirror the latest facts into the home-screen widget on this same ~hourly
      // cadence, reusing the facts we just fetched (no extra network). Keeps the
      // widget fresh while the app is closed. Headless-safe (no SQLite import).
      await pushWidgetFacts(facts, locale);

      await asyncStoragePersister.persistClient({
        buster: API_BASE_URL,
        timestamp: Date.now(),
        clientState: dehydrate(queryClient, {
          shouldDehydrateQuery: (q) =>
            q.state.status === 'success' && PERSISTED_ROOTS.includes(q.queryKey[0] as string),
        }),
      });
      return backgroundTask.BackgroundTaskResult.Success;
    } catch {
      return backgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Register the periodic feed refresh. Safe to call repeatedly (no-ops if
 * already registered, if the OS restricts background work, or if the native
 * ExpoTaskManager module isn't in this build).
 *
 * DEV BUILDS: never schedule it, and actively unregister any job left over from
 * a prior run. In a dev-client build the WorkManager job spins up the *shared*
 * ReactHost headlessly (expo-task-manager TaskService → app.getReactHost()) to
 * run this task while the app is closed. That creates the React context outside
 * the dev-launcher's load flow, so the next time MainActivity launches the
 * dev-launcher's `require(currentReactContext == null)` assertion throws
 * "App react context shouldn't be created before." and the dev build crashes on
 * open (expo/expo#35385). Production is unaffected — release builds don't run
 * the dev-launcher's AppLoader. The unregister below self-heals a device whose
 * job was already scheduled: one clean launch clears it for good. */
export async function registerBackgroundFeedFetch(): Promise<void> {
  const backgroundTask = BackgroundTask;
  const taskManager = TaskManager;
  if (!backgroundTask || !taskManager) return;
  try {
    if (__DEV__) {
      if (await taskManager.isTaskRegisteredAsync(BACKGROUND_FEED_TASK)) {
        await backgroundTask.unregisterTaskAsync(BACKGROUND_FEED_TASK);
      }
      return;
    }
    const status = await backgroundTask.getStatusAsync();
    if (status === backgroundTask.BackgroundTaskStatus.Restricted) return;
    if (await taskManager.isTaskRegisteredAsync(BACKGROUND_FEED_TASK)) return;
    await backgroundTask.registerTaskAsync(BACKGROUND_FEED_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MINUTES,
    });
  } catch {
    // Best-effort enhancement — never block startup on it.
  }
}