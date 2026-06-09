import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

/**
 * Facts are served on demand from the API; React Query is the fact store. To
 * make cold opens instant we persist the cache to disk (AsyncStorage) and
 * rehydrate it on launch — see PersistQueryClientProvider in app/_layout.tsx.
 *
 * Freshness policy ("trust cache for 1 hour"): staleTime is 1h, so any query
 * restored from disk and younger than an hour is treated as fresh and does NOT
 * refetch on mount — the screen renders from cache with zero network calls.
 * Older-than-1h queries still render instantly from the persisted snapshot,
 * then revalidate in the background (stale-while-revalidate).
 */
const ONE_HOUR = 1000 * 60 * 60;
const ONE_DAY = ONE_HOUR * 24;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: ONE_HOUR, // trust cached facts for 1h before background refetch
      gcTime: ONE_DAY, // keep in memory long enough to be persisted across a session
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

/**
 * Disk persister. The whole client cache is serialized to a single AsyncStorage
 * key. maxAge (24h) bounds how long a persisted snapshot is allowed to hydrate
 * — past that the cache is discarded on launch so we never show day-old content.
 */
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'FACTS_RQ_CACHE',
  throttleTime: 1000, // coalesce rapid writes; persistence is best-effort
});

export const persistMaxAge = ONE_DAY;
